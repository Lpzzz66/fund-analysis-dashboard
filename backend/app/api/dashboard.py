"""Read-only dashboard queries over published valuation versions."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analytics.nav import calculate_nav_series
from app.auth.dependencies import AuthContext, get_auth_context, get_db
from app.db.base import FundStatus, ValuationStatus
from app.db.models import (
    Fund,
    FundDailySnapshot,
    PositionDaily,
    ValidationResult,
    ValuationVersion,
)

router = APIRouter(tags=["dashboard"])
DatabaseSession = Annotated[Session, Depends(get_db)]
CurrentContext = Annotated[AuthContext, Depends(get_auth_context)]


def _decimal(value: Decimal | None) -> str | None:
    return str(value) if value is not None else None


def _published_versions(
    session: Session,
    *,
    fund_id: int | None = None,
    as_of: date | None = None,
) -> list[ValuationVersion]:
    statement = (
        select(ValuationVersion)
        .join(Fund, Fund.id == ValuationVersion.fund_id)
        .where(ValuationVersion.status == ValuationStatus.PUBLISHED)
        .where(Fund.status == FundStatus.ACTIVE)
        .order_by(
            ValuationVersion.fund_id,
            ValuationVersion.valuation_date.desc(),
            ValuationVersion.id.desc(),
        )
    )
    if fund_id is not None:
        statement = statement.where(ValuationVersion.fund_id == fund_id)
    if as_of is not None:
        statement = statement.where(ValuationVersion.valuation_date == as_of)
    selected: list[ValuationVersion] = []
    seen_funds: set[int] = set()
    for version in session.scalars(statement):
        if version.fund_id in seen_funds:
            continue
        seen_funds.add(version.fund_id)
        selected.append(version)
    return selected


def _version_for_fund(
    session: Session, fund_id: int, as_of: date | None
) -> ValuationVersion | None:
    versions = _published_versions(session, fund_id=fund_id, as_of=as_of)
    return versions[0] if versions else None


def _snapshot(session: Session, version_id: int) -> FundDailySnapshot | None:
    return session.scalar(
        select(FundDailySnapshot).where(
            FundDailySnapshot.valuation_version_id == version_id
        )
    )


def _quality_status(session: Session, version_id: int) -> str:
    levels = session.scalars(
        select(ValidationResult.level).where(
            ValidationResult.valuation_version_id == version_id
        )
    ).all()
    if any(str(level) == "critical" for level in levels):
        return "warning"
    if any(str(level) == "warning" for level in levels):
        return "warning"
    return "valid"


@router.get("/api/v1/dashboard/overview")
def overview(
    _: CurrentContext,
    session: DatabaseSession,
    as_of: date | None = Query(default=None),  # noqa: B008
) -> dict[str, object]:
    total = (
        session.scalar(
            select(func.count(Fund.id)).where(Fund.status == FundStatus.ACTIVE)
        )
        or 0
    )
    versions = _published_versions(session, as_of=as_of)
    selected_fund_ids = {version.fund_id for version in versions}
    snapshots = [
        snapshot
        for version in versions
        if (snapshot := _snapshot(session, version.id)) is not None
    ]
    total_net_assets = sum(
        (
            snapshot.net_asset_value
            for snapshot in snapshots
            if snapshot.net_asset_value is not None
        ),
        Decimal(0),
    )
    return {
        "data": {
            "as_of": as_of.isoformat() if as_of else None,
            "total_net_assets": _decimal(total_net_assets) if snapshots else None,
            "fund_count": len(selected_fund_ids),
            "company_index": None,
            "company_daily_return": None,
            "risk_event_count": 0,
            "quality_status": (
                "warning"
                if any(
                    _quality_status(session, version.id) == "warning"
                    for version in versions
                )
                else "valid"
            ),
            "funds": _overview_funds(session, versions),
        },
        "meta": {
            "as_of": as_of.isoformat() if as_of else None,
            "coverage": {"available": len(selected_fund_ids), "total": total},
        },
    }


def _overview_funds(
    session: Session, versions: list[ValuationVersion]
) -> list[dict[str, object]]:
    data: list[dict[str, object]] = []
    for version in versions:
        snapshot = _snapshot(session, version.id)
        data.append(
            {
                "id": version.fund_id,
                "name": version.fund.standard_name,
                "valuation_date": version.valuation_date.isoformat(),
                "unit_nav": _decimal(snapshot.unit_nav) if snapshot else None,
                "daily_return": _decimal(snapshot.daily_return) if snapshot else None,
            }
        )
    return data


@router.get("/api/v1/funds")
def list_funds(
    _: CurrentContext,
    session: DatabaseSession,
    q: str | None = Query(default=None, max_length=255),
    status: FundStatus | None = Query(default=None),  # noqa: B008
    as_of: date | None = Query(default=None),  # noqa: B008
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict[str, object]:
    statement = select(Fund).order_by(Fund.standard_name, Fund.id)
    if q:
        statement = statement.where(Fund.standard_name.contains(q.strip()))
    if status is not None:
        statement = statement.where(Fund.status == status)
    funds = list(session.scalars(statement))
    total = len(funds)
    offset = (page - 1) * page_size
    data = []
    for fund in funds[offset : offset + page_size]:
        version = _version_for_fund(session, fund.id, as_of)
        snapshot = _snapshot(session, version.id) if version else None
        data.append(
            {
                "id": fund.id,
                "name": fund.standard_name,
                "product_code": fund.product_code,
                "status": fund.status,
                "current_version_id": version.id if version else None,
                "valuation_date": version.valuation_date.isoformat()
                if version
                else None,
                "unit_nav": _decimal(snapshot.unit_nav) if snapshot else None,
                "daily_return": _decimal(snapshot.daily_return) if snapshot else None,
                "quality_status": _quality_status(session, version.id)
                if version
                else "pending",
            }
        )
    return {
        "data": data,
        "meta": {"page": page, "page_size": page_size, "total": total},
    }


@router.get("/api/v1/funds/{fund_id}")
def fund_detail(
    fund_id: int,
    _: CurrentContext,
    session: DatabaseSession,
    as_of: date | None = Query(default=None),  # noqa: B008
) -> dict[str, object]:
    fund = session.get(Fund, fund_id)
    if fund is None:
        raise HTTPException(status_code=404, detail="Fund not found")
    version = _version_for_fund(session, fund_id, as_of)
    return {
        "data": {
            "id": fund.id,
            "name": fund.standard_name,
            "product_code": fund.product_code,
            "strategy": fund.strategy,
            "manager": fund.manager,
            "status": fund.status,
            "current_version_id": version.id if version else None,
            "valuation_date": version.valuation_date.isoformat() if version else None,
            "quality_status": _quality_status(session, version.id)
            if version
            else "pending",
        }
    }


@router.get("/api/v1/funds/{fund_id}/nav-series")
def nav_series(
    fund_id: int,
    _: CurrentContext,
    session: DatabaseSession,
    start: date | None = Query(default=None),  # noqa: B008
    end: date | None = Query(default=None),  # noqa: B008
) -> dict[str, object]:
    if session.get(Fund, fund_id) is None:
        raise HTTPException(status_code=404, detail="Fund not found")
    statement = (
        select(ValuationVersion, FundDailySnapshot)
        .join(
            FundDailySnapshot,
            FundDailySnapshot.valuation_version_id == ValuationVersion.id,
        )
        .where(
            ValuationVersion.fund_id == fund_id,
            ValuationVersion.status == ValuationStatus.PUBLISHED,
        )
        .order_by(ValuationVersion.valuation_date)
    )
    if start is not None:
        statement = statement.where(ValuationVersion.valuation_date >= start)
    if end is not None:
        statement = statement.where(ValuationVersion.valuation_date <= end)
    rows = list(session.execute(statement))
    records = [
        {
            "valuation_date": version.valuation_date,
            "unit_nav": snapshot.unit_nav,
            "cumulative_unit_nav": snapshot.cumulative_unit_nav,
            "cumulative_payout": snapshot.cumulative_payout,
        }
        for version, snapshot in rows
    ]
    result = calculate_nav_series(records)
    return {
        "data": {
            "methodology": result.methodology,
            "total_return": _decimal(result.total_return),
            "points": [
                {
                    "valuation_date": point.valuation_date.isoformat(),
                    "unit_nav": _decimal(point.unit_nav),
                    "cumulative_unit_nav": _decimal(point.cumulative_unit_nav),
                    "cumulative_payout": _decimal(point.cumulative_payout),
                    "adjusted_nav": _decimal(point.adjusted_nav),
                    "daily_return": _decimal(point.daily_return),
                    "cumulative_return": _decimal(point.cumulative_return),
                }
                for point in result.points
            ],
        },
        "meta": {"coverage": {"available": len(records), "total": len(records)}},
    }


@router.get("/api/v1/funds/{fund_id}/positions")
def positions(
    fund_id: int,
    _: CurrentContext,
    session: DatabaseSession,
    as_of: date | None = Query(default=None),  # noqa: B008
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> dict[str, object]:
    if session.get(Fund, fund_id) is None:
        raise HTTPException(status_code=404, detail="Fund not found")
    version = _version_for_fund(session, fund_id, as_of)
    if version is None:
        return {"data": [], "meta": {"page": page, "page_size": page_size, "total": 0}}
    statement = (
        select(PositionDaily)
        .where(PositionDaily.valuation_version_id == version.id)
        .order_by(PositionDaily.market_value.desc(), PositionDaily.id)
    )
    all_rows = list(session.scalars(statement))
    offset = (page - 1) * page_size
    return {
        "data": [
            {
                "security_code": row.security_code,
                "security_name": row.security_name,
                "market": row.market,
                "account": row.account,
                "quantity": _decimal(row.quantity),
                "market_price": _decimal(row.market_price),
                "market_value": _decimal(row.market_value),
                "nav_weight": _decimal(row.nav_weight),
                "suspension_info": row.suspension_info,
            }
            for row in all_rows[offset : offset + page_size]
        ],
        "meta": {
            "page": page,
            "page_size": page_size,
            "total": len(all_rows),
            "valuation_date": version.valuation_date.isoformat(),
        },
    }


@router.get("/api/v1/funds/{fund_id}/quality")
def quality(
    fund_id: int,
    _: CurrentContext,
    session: DatabaseSession,
    as_of: date | None = Query(default=None),  # noqa: B008
) -> dict[str, object]:
    if session.get(Fund, fund_id) is None:
        raise HTTPException(status_code=404, detail="Fund not found")
    version = _version_for_fund(session, fund_id, as_of)
    if version is None:
        return {
            "data": {"version_id": None, "validation": [], "quality_status": "pending"}
        }
    findings = session.scalars(
        select(ValidationResult)
        .where(ValidationResult.valuation_version_id == version.id)
        .order_by(ValidationResult.level, ValidationResult.id)
    ).all()
    return {
        "data": {
            "version_id": version.id,
            "valuation_date": version.valuation_date.isoformat(),
            "quality_status": _quality_status(session, version.id),
            "validation": [
                {
                    "rule_code": finding.rule_code,
                    "level": finding.level,
                    "actual_value": _decimal(finding.actual_value),
                    "expected_value": _decimal(finding.expected_value),
                    "difference": _decimal(finding.difference),
                    "source_location": finding.source_location,
                    "message": finding.message,
                }
                for finding in findings
            ],
        }
    }
