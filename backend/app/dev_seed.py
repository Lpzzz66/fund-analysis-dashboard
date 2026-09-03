"""Create deterministic local-only demo data for the fund dashboard.

This module is intentionally separate from application startup. It writes only
funds marked with the ``DEMO-`` product-code prefix and refuses to run when
those records already exist, so a developer cannot accidentally overwrite an
existing local database by restarting the API.

Run from the ``backend`` directory after applying migrations::

    ..\\.venv\\Scripts\\python.exe -m app.dev_seed
"""

from __future__ import annotations

import argparse
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.company import calculate_company_index
from app.config import get_settings
from app.db.base import (
    AnalysisRunStatus,
    AuditResult,
    FundStatus,
    RiskEventStatus,
    RiskSeverity,
    ValidationLevel,
    ValuationStatus,
)
from app.db.models import (
    AnalysisRun,
    AuditLog,
    CompanyMetricDaily,
    Fund,
    FundDailySnapshot,
    FundMetricDaily,
    PositionDaily,
    RiskEvent,
    RiskRule,
    ValidationResult,
    ValuationVersion,
)
from app.db.session import create_engine

DEMO_PREFIX = "DEMO-"
HISTORY_DAYS = 45
MONEY_QUANTUM = Decimal("0.01")
NAV_QUANTUM = Decimal("0.0000000001")

FUND_DEFINITIONS = (
    ("丹寅梦一号私募证券投资基金", "梦一号", "成长精选"),
    ("丹寅天策上将私募证券投资基金", "天策上将", "科技成长"),
    ("丹寅价值先锋私募证券投资基金", "价值先锋", "价值投资"),
    ("丹寅量化增强私募证券投资基金", "量化增强", "量化多策略"),
    ("丹寅蓝筹精选私募证券投资基金", "蓝筹精选", "股票多头"),
    ("丹寅稳健增利私募证券投资基金", "稳健增利", "固收+"),
    ("丹寅星河成长私募证券投资基金", "星河成长", "成长精选"),
    ("丹寅远见一号私募证券投资基金", "远见一号", "宏观策略"),
    ("丹寅睿享私募证券投资基金", "睿享", "多资产"),
    ("丹寅新势力私募证券投资基金", "新势力", "科技成长"),
    ("丹寅长青私募证券投资基金", "长青", "价值投资"),
    ("丹寅启明星私募证券投资基金", "启明星", "量化多策略"),
    ("丹寅臻选私募证券投资基金", "臻选", "股票多头"),
    ("丹寅汇盈私募证券投资基金", "汇盈", "固收+"),
    ("丹寅远航私募证券投资基金", "远航", "多资产"),
)

POSITION_DEFINITIONS = (
    ("中际旭创", "300308", "深圳", "0.24", "135.40", "0.08"),
    ("海光信息", "688041", "上海", "0.18", "98.20", "0.04"),
    ("寒武纪", "688256", "上海", "0.16", "83.70", "0.06"),
    ("光迅科技", "002281", "深圳", "0.12", "31.65", "0.03"),
    ("招商银行", "600036", "上海", "0.10", "36.20", "0.02"),
    ("现金及收益互换", "OTHER", "场外", "0.08", "1.00", "0.00"),
)


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def _nav(value: Decimal) -> Decimal:
    return value.quantize(NAV_QUANTUM, rounding=ROUND_HALF_UP)


def _daily_return(index: int, offset: int) -> Decimal:
    # A small deterministic variation keeps the demo readable and repeatable.
    baseline = Decimal("0.0008") + Decimal(index - 7) / Decimal(10000)
    cycle = Decimal((offset % 9) - 4) / Decimal(100000)
    return baseline + cycle


def _initial_nav(index: int) -> Decimal:
    if index == 0:
        return Decimal("1.4200")
    if index == 1:
        return Decimal("2.6800")
    return Decimal("1.0800") + Decimal(index) * Decimal("0.0550")


def _base_assets(index: int) -> Decimal:
    if index == 0:
        return Decimal(908000000)
    if index == 1:
        return Decimal(187000000)
    return Decimal(320000000) + Decimal(index - 2) * Decimal(35000000)


def _seed_fund_history(
    session: Session,
    fund: Fund,
    *,
    index: int,
    latest_date: date,
) -> tuple[ValuationVersion, ...]:
    start_date = latest_date - timedelta(days=HISTORY_DAYS - 1)
    previous_nav = _initial_nav(index)
    nav_by_date: dict[date, Decimal] = {}
    versions: list[ValuationVersion] = []

    for offset in range(HISTORY_DAYS):
        valuation_date = start_date + timedelta(days=offset)
        prior_nav = previous_nav
        current_nav = (
            _nav(prior_nav * (Decimal(1) + _daily_return(index, offset)))
            if offset
            else _nav(prior_nav)
        )
        daily_return = _nav(current_nav / prior_nav - Decimal(1)) if offset else None
        previous_nav = current_nav
        nav_by_date[valuation_date] = current_nav
        week_start = valuation_date - timedelta(days=valuation_date.weekday())
        quarter_start = date(
            valuation_date.year,
            ((valuation_date.month - 1) // 3) * 3 + 1,
            1,
        )
        initial_nav = _initial_nav(index)
        period_returns = {
            "wtd_return": _nav(current_nav / nav_by_date.get(week_start, initial_nav) - Decimal(1)),
            "mtd_return": _nav(
                current_nav
                / nav_by_date.get(valuation_date.replace(day=1), initial_nav)
                - Decimal(1)
            ),
            "qtd_return": _nav(
                current_nav / nav_by_date.get(quarter_start, initial_nav) - Decimal(1)
            ),
            "ytd_return": _nav(
                current_nav
                / nav_by_date.get(valuation_date.replace(month=1, day=1), initial_nav)
                - Decimal(1)
            ),
            "cumulative_return": _nav(current_nav / initial_nav - Decimal(1)),
        }
        total_assets = _money(_base_assets(index) + Decimal(offset) * Decimal(450000))
        liabilities = _money(total_assets * Decimal("0.035"))
        net_assets = _money(total_assets - liabilities)
        version = ValuationVersion(
            fund_id=fund.id,
            valuation_date=valuation_date,
            version_no=1,
            status=ValuationStatus.PUBLISHED,
            published_by="demo-seed",
            published_at=datetime.combine(
                valuation_date, datetime.min.time(), tzinfo=UTC
            ),
            release_reason="本地演示数据",
        )
        session.add(version)
        session.flush()
        session.add(
            FundDailySnapshot(
                valuation_version_id=version.id,
                total_assets=total_assets,
                total_liabilities=liabilities,
                net_asset_value=net_assets,
                unit_nav=current_nav,
                cumulative_unit_nav=current_nav,
                previous_unit_nav=prior_nav if offset else None,
                daily_return=daily_return,
                **period_returns,
            )
        )
        session.add(
            ValidationResult(
                valuation_version_id=version.id,
                rule_code="DEMO-CHECK",
                level=ValidationLevel.INFO,
                message="演示数据已通过基础校验",
            )
        )
        versions.append(version)

    session.flush()
    return tuple(versions)


def _seed_positions(session: Session, version: ValuationVersion, index: int) -> None:
    snapshot = session.scalar(
        select(FundDailySnapshot).where(
            FundDailySnapshot.valuation_version_id == version.id
        )
    )
    if snapshot is None or snapshot.net_asset_value is None:
        return
    for position_index, (name, code, market, weight, price, gain) in enumerate(
        POSITION_DEFINITIONS
    ):
        nav_weight = Decimal(weight) + Decimal(index % 3) / Decimal(1000)
        market_value = _money(snapshot.net_asset_value * nav_weight)
        market_price = Decimal(price)
        quantity = _money(market_value / market_price)
        session.add(
            PositionDaily(
                valuation_version_id=version.id,
                security_code=code,
                security_name=name,
                market=market,
                account=f"演示组合-{index + 1:02d}",
                quantity=quantity,
                market_price=market_price,
                market_value=market_value,
                nav_weight=nav_weight,
                valuation_gain=_money(market_value * Decimal(gain)),
                source_worksheet="demo_seed",
                source_row=position_index + 2,
            )
        )


def _seed_analysis(
    session: Session,
    fund: Fund,
    versions: tuple[ValuationVersion, ...],
    *,
    index: int,
    latest_date: date,
    now: datetime,
) -> AnalysisRun:
    run = AnalysisRun(
        trigger_version_id=versions[-1].id,
        trigger_reason="demo_seed",
        input_start_date=versions[0].valuation_date,
        input_end_date=latest_date,
        input_version_range=f"fund:{fund.id};demo",
        methodology_version="demo-v1",
        status=AnalysisRunStatus.SUCCEEDED,
        started_at=now,
        ended_at=now,
    )
    session.add(run)
    session.flush()
    peak_nav = Decimal(0)
    for version in versions:
        snapshot = session.scalar(
            select(FundDailySnapshot).where(
                FundDailySnapshot.valuation_version_id == version.id
            )
        )
        if snapshot is None or snapshot.unit_nav is None:
            continue
        peak_nav = max(peak_nav, snapshot.unit_nav)
        session.add(
            FundMetricDaily(
                fund_id=fund.id,
                valuation_date=version.valuation_date,
                source_analysis_run_id=run.id,
                daily_return=snapshot.daily_return,
                cumulative_return=_nav(
                    snapshot.unit_nav / _initial_nav(index) - Decimal(1)
                ),
                drawdown=_nav(snapshot.unit_nav / peak_nav - Decimal(1)),
                historical_peak=peak_nav,
                concentration=Decimal("0.24"),
                asset_ratio=Decimal("0.965"),
            )
        )
    session.flush()
    return run


def seed_demo_data(session: Session, *, latest_date: date) -> int:
    existing = session.scalars(
        select(Fund).where(Fund.product_code.like(f"{DEMO_PREFIX}%"))
    ).all()
    if existing:
        print(f"已找到 {len(existing)} 只 DEMO 基金，跳过写入。")
        return 0

    now = datetime.now(UTC)
    funds: list[Fund] = []
    histories: dict[int, tuple[ValuationVersion, ...]] = {}
    for index, (name, _, strategy) in enumerate(FUND_DEFINITIONS):
        fund = Fund(
            standard_name=name,
            product_code=f"{DEMO_PREFIX}{index + 1:02d}",
            establishment_date=date(2021 + index % 4, 1 + index % 10, 1),
            strategy=strategy,
            manager="丹寅资产演示团队",
            status=FundStatus.ACTIVE,
            notes="本地演示数据，仅用于界面验证，不代表真实投资结果。",
        )
        session.add(fund)
        session.flush()
        funds.append(fund)
        histories[fund.id] = _seed_fund_history(
            session, fund, index=index, latest_date=latest_date
        )
        _seed_positions(session, histories[fund.id][-1], index)

    session.flush()
    runs = [
        _seed_analysis(
            session,
            fund,
            histories[fund.id],
            index=index,
            latest_date=latest_date,
            now=now,
        )
        for index, fund in enumerate(funds)
    ]

    company_inputs: list[dict[str, object]] = []
    for fund, history in zip(funds, histories.values(), strict=True):
        for version in history:
            snapshot = session.scalar(
                select(FundDailySnapshot).where(
                    FundDailySnapshot.valuation_version_id == version.id
                )
            )
            if snapshot is None:
                continue
            company_inputs.append(
                {
                    "fund_id": fund.id,
                    "valuation_date": version.valuation_date,
                    "net_asset_value": snapshot.net_asset_value,
                    "daily_return": snapshot.daily_return,
                }
            )
    company_metrics = calculate_company_index(
        company_inputs,
        fund_ids=[fund.id for fund in funds],
    )
    session.add_all(
        CompanyMetricDaily(
            valuation_date=metric.valuation_date,
            source_analysis_run_id=runs[0].id,
            company_index=metric.company_index,
            company_daily_return=metric.company_daily_return,
            effective_fund_count=metric.effective_fund_count,
            total_net_assets=metric.total_net_assets,
        )
        for metric in company_metrics
    )

    risk_rule_definitions = (
        ("DEMO-DRAWDOWN", "最大回撤", RiskSeverity.CRITICAL, Decimal("0.10")),
        ("DEMO-CONCENTRATION", "单一持仓集中度", RiskSeverity.WARNING, Decimal("0.25")),
        ("DEMO-DAILY-LOSS", "单日亏损", RiskSeverity.WARNING, Decimal("0.03")),
    )
    risk_rules: list[RiskRule] = []
    for code, rule_type, severity, threshold in risk_rule_definitions:
        rule = RiskRule(
            rule_code=code,
            rule_type=rule_type,
            scope="fund",
            threshold=threshold,
            severity=severity,
            valid_from=latest_date - timedelta(days=HISTORY_DAYS),
            version="demo-v1",
            enabled=True,
        )
        session.add(rule)
        risk_rules.append(rule)
    session.flush()
    for rule, fund_index in zip(risk_rules, (2, 1, 4), strict=False):
        fund = funds[fund_index]
        session.add(
            RiskEvent(
                risk_rule_id=rule.id,
                fund_id=fund.id,
                valuation_date=latest_date,
                severity=rule.severity,
                status=RiskEventStatus.OPEN,
                first_triggered_at=now,
                last_triggered_at=now,
                evidence_snapshot="演示风险事件，用于检查风险列表与详情跳转。",
                evidence_reference="demo_seed",
            )
        )
    session.add(
        AuditLog(
            actor_user_id=None,
            action="demo.seed",
            resource_type="database",
            resource_id="local",
            summary={"fund_count": len(funds), "history_days": HISTORY_DAYS},
            reason="本地演示数据",
            result=AuditResult.SUCCESS,
        )
    )
    session.commit()
    return len(funds)


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("日期格式应为 YYYY-MM-DD") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="写入本地基金看板演示数据")
    parser.add_argument(
        "--latest-date",
        type=_parse_date,
        default=date(2026, 8, 17),
        help="演示数据最新估值日，默认 2026-08-17",
    )
    args = parser.parse_args()
    engine = create_engine(get_settings().database_url)
    with Session(engine) as session:
        count = seed_demo_data(session, latest_date=args.latest_date)
    if count:
        print(f"已写入 {count} 只基金、{count * HISTORY_DAYS} 个估值版本和最新持仓。")


if __name__ == "__main__":
    main()
