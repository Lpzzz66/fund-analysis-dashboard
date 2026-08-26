from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.auth.service import AuthService
from app.db.base import SourceType, ValuationStatus
from app.db.models import (
    AccountSubjectDaily,
    Fund,
    FundAlias,
    FundDailySnapshot,
    PositionDaily,
    SubjectMapping,
    ValuationVersion,
)
from app.imports.processor import _product_aliases, _resolve_fund, process_import_batch
from app.imports.service import ImportService
from app.imports.tasks import process_next_job


def _valuation_xlsx() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "估值表"
    sheet.append(["证券投资基金估值表"])
    sheet.append(["千金一号___专用表"])
    sheet.append(["估值日期：2026-08-25"])
    sheet.append(
        [
            "科目代码",
            "科目名称",
            "数量",
            "单位成本",
            "成本",
            "成本占净值%",
            "市价",
            "市值",
            "市值占净值%",
            "估值增值",
            "停牌信息",
        ]
    )
    sheet.append(["10020101", "测试证券", 10, 10, 100, 100, 11, 110, 110, 10, ""])
    sheet.append(["资产类合计", "", "", "", "", "", "", 100, "", "", ""])
    sheet.append(["负债类合计", "", "", "", "", "", "", 0, "", "", ""])
    sheet.append(["基金资产净值", "", "", "", "", "", "", 100, "", "", ""])
    sheet.append(["基金资产净值:A类", "", "", "", "", "", "", 100, "", "", ""])
    sheet.append(["基金单位净值", 1])
    sheet.append(["基金单位净值:A类", 1])
    sheet.append(["累计单位净值", 1])
    sheet.append(["累计单位净值:A类", 1])
    sheet.append(["昨日单位净值", 0.99])
    sheet.append(["净值日增长率(%)", 1.010101])
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def test_processor_persists_version_snapshot_positions_and_validation(
    app_and_engine: tuple[object, object],
) -> None:
    app, engine = app_and_engine
    with Session(engine) as session:
        actor = AuthService(session).initialize_admin("admin", "correct horse").user
        fund = Fund(standard_name="千金一号")
        session.add(fund)
        session.add(
            SubjectMapping(
                subject_code_or_prefix="1002",
                standard_category="股票",
                include_in_holdings=True,
                rule_version="test-v1",
            )
        )
        session.flush()
        service = ImportService.from_settings(session, app.state.settings)
        batch = service.create_batch(SourceType.UPLOAD, actor.id)
        service.receive_upload(
            batch.id, "千金一号 08月25日.xlsx", BytesIO(_valuation_xlsx()), actor.id
        )
        service.complete_batch(batch.id, actor.id)
        session.commit()

        result = process_import_batch(session, batch.id, app.state.settings)
        session.commit()

        assert result.processed_files == 1
        assert result.created_versions
        version = session.get(ValuationVersion, result.created_versions[0])
        assert version.status == ValuationStatus.PUBLISHABLE
        snapshot = session.scalar(
            select(FundDailySnapshot).where(
                FundDailySnapshot.valuation_version_id == version.id
            )
        )
        position = session.scalar(
            select(PositionDaily).where(
                PositionDaily.valuation_version_id == version.id
            )
        )
        subject = session.scalar(
            select(AccountSubjectDaily).where(
                AccountSubjectDaily.valuation_version_id == version.id
            )
        )
        assert snapshot.net_asset_value == 100
        assert position.market_value == 110
        assert subject.standard_category == "股票"
        assert subject.include_in_holdings is True


def test_processor_treats_non_valuation_workbook_as_ignored(
    app_and_engine: tuple[object, object],
) -> None:
    app, engine = app_and_engine
    with Session(engine) as session:
        actor = AuthService(session).initialize_admin("admin", "correct horse").user
        service = ImportService.from_settings(session, app.state.settings)
        batch = service.create_batch(SourceType.UPLOAD, actor.id)
        content = BytesIO()
        workbook = Workbook()
        workbook.active.append(["交易记录"])
        workbook.save(content)
        service.receive_upload(
            batch.id, "交易记录.xlsx", BytesIO(content.getvalue()), actor.id
        )
        service.complete_batch(batch.id, actor.id)
        session.commit()

        result = process_import_batch(session, batch.id, app.state.settings)

        assert result.non_valuation_files == 1
        assert result.created_versions == ()


def test_processor_is_idempotent_for_a_completed_source_file(
    app_and_engine: tuple[object, object],
) -> None:
    app, engine = app_and_engine
    with Session(engine) as session:
        actor = AuthService(session).initialize_admin("admin", "correct horse").user
        fund = Fund(standard_name="千金一号")
        session.add(fund)
        session.flush()
        service = ImportService.from_settings(session, app.state.settings)
        batch = service.create_batch(SourceType.UPLOAD, actor.id)
        service.receive_upload(
            batch.id, "千金一号.xlsx", BytesIO(_valuation_xlsx()), actor.id
        )
        service.complete_batch(batch.id, actor.id)
        session.commit()

        first = process_next_job(session, app.state.settings)
        assert first is not None
        second = process_import_batch(session, batch.id, app.state.settings)

        assert first[1] is not None
        assert second.duplicate_files == 1
        assert second.created_versions == ()


def test_product_alias_queries_are_constant_for_multiple_funds(
    app_and_engine: tuple[object, object],
) -> None:
    _, engine = app_and_engine
    with Session(engine) as session:
        funds = [Fund(standard_name=f"产品{i}") for i in range(4)]
        session.add_all(funds)
        session.flush()
        session.add_all(
            [
                FundAlias(fund_id=funds[0].id, alias="甲产品"),
                FundAlias(fund_id=funds[0].id, alias="  A-Product  "),
                FundAlias(fund_id=funds[1].id, alias="乙产品"),
                FundAlias(fund_id=funds[2].id, alias="丙产品"),
            ]
        )
        session.flush()

        select_statements: list[str] = []

        def count_selects(
            _conn: object,
            _cursor: object,
            statement: str,
            _parameters: object,
            _context: object,
            _executemany: bool,
        ) -> None:
            if statement.lstrip().upper().startswith("SELECT"):
                select_statements.append(statement)

        event.listen(engine, "before_cursor_execute", count_selects)
        try:
            aliases = _product_aliases(session)
            assert aliases == {
                "产品0": ("甲产品", "  A-Product  "),
                "产品1": ("乙产品",),
                "产品2": ("丙产品",),
                "产品3": (),
            }
            assert len(select_statements) == 1

            select_statements.clear()
            assert _resolve_fund(session, " a-product ") is funds[0]
            assert len(select_statements) == 1
        finally:
            event.remove(engine, "before_cursor_execute", count_selects)
