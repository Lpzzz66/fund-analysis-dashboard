from __future__ import annotations

from io import BytesIO

from app.auth.service import AuthService
from app.db.base import SourceType, ValuationStatus
from app.db.models import (
    Fund,
    FundDailySnapshot,
    PositionDaily,
    ValuationVersion,
)
from app.imports.processor import process_import_batch
from app.imports.service import ImportService
from app.imports.tasks import process_next_job
from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.orm import Session


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
        assert snapshot.net_asset_value == 100
        assert position.market_value == 110


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
