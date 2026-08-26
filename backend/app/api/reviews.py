"""Review and valuation publication routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.dependencies import AuthContext, get_db, require_roles
from app.db.base import UserRole, ValidationLevel, ValuationStatus
from app.db.models import Fund, ValidationResult, ValuationVersion
from app.publishing import (
    PublishingService,
    PublishingServiceError,
    PublishingStateError,
    PublishingValidationError,
)

router = APIRouter(prefix="/api/v1", tags=["reviews"])
DatabaseSession = Annotated[Session, Depends(get_db)]
ReviewOperator = Annotated[
    AuthContext, Depends(require_roles(UserRole.ADMIN, UserRole.OPERATOR))
]


class ReviewDecision(BaseModel):
    allow_publish: bool
    note: str = Field(min_length=1, max_length=2000)


class PublishRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=2000)
    confirm_warnings: bool = False


class ReasonRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


def _error(exc: PublishingServiceError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.get("/reviews")
def list_reviews(
    _: ReviewOperator,
    session: DatabaseSession,
    version_status: ValuationStatus = Query(  # noqa: B008
        default=ValuationStatus.PENDING_REVIEW, alias="status"
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict[str, object]:
    base = (
        select(ValuationVersion, Fund.standard_name)
        .join(Fund, Fund.id == ValuationVersion.fund_id)
        .where(ValuationVersion.status == version_status)
        .order_by(ValuationVersion.valuation_date, ValuationVersion.id)
    )
    count = (
        session.scalar(
            select(func.count(ValuationVersion.id)).where(
                ValuationVersion.status == version_status
            )
        )
        or 0
    )
    rows = session.execute(base.offset((page - 1) * page_size).limit(page_size)).all()
    version_ids = [version.id for version, _ in rows]
    findings = (
        session.scalars(
            select(ValidationResult).where(
                ValidationResult.valuation_version_id.in_(version_ids)
            )
        ).all()
        if version_ids
        else []
    )
    counts: dict[int, dict[str, int]] = {}
    for finding in findings:
        current = counts.setdefault(
            finding.valuation_version_id, {"critical": 0, "warning": 0}
        )
        if finding.level == ValidationLevel.CRITICAL:
            current["critical"] += 1
        elif finding.level == ValidationLevel.WARNING:
            current["warning"] += 1
    data = [
        {
            "id": version.id,
            "fund_id": version.fund_id,
            "fund_name": fund_name,
            "valuation_date": version.valuation_date.isoformat(),
            "version_no": version.version_no,
            "status": version.status,
            "critical_count": counts.get(version.id, {}).get("critical", 0),
            "warning_count": counts.get(version.id, {}).get("warning", 0),
        }
        for version, fund_name in rows
    ]
    return {
        "data": data,
        "meta": {"page": page, "page_size": page_size, "total": count},
    }


@router.post("/reviews/{version_id}/acknowledge")
def acknowledge_review(
    version_id: int,
    payload: ReviewDecision,
    context: ReviewOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    try:
        result = PublishingService(session).acknowledge_review(
            version_id,
            allow_publish=payload.allow_publish,
            actor_user_id=context.user.id,
            note=payload.note,
        )
        session.commit()
    except PublishingServiceError as exc:
        session.rollback()
        raise _error(exc) from exc
    return {"data": {"version_id": result.version_id, "status": result.status}}


@router.post("/valuations/{version_id}/publish")
def publish_version(
    version_id: int,
    payload: PublishRequest,
    context: ReviewOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    try:
        result = PublishingService(session).publish_version(
            version_id,
            actor_user_id=context.user.id,
            actor_label=context.user.username,
            reason=payload.reason,
            confirm_warnings=payload.confirm_warnings,
        )
        session.commit()
    except (PublishingValidationError, PublishingStateError) as exc:
        session.rollback()
        raise _error(exc) from exc
    except PublishingServiceError as exc:
        session.rollback()
        raise _error(exc) from exc
    return {
        "data": {
            "version_id": result.version_id,
            "fund_id": result.fund_id,
            "valuation_date": result.valuation_date.isoformat(),
            "superseded_version_ids": list(result.superseded_version_ids),
            "analysis_run_id": result.analysis_run_id,
        }
    }


@router.post("/valuations/{version_id}/reject")
def reject_version(
    version_id: int,
    payload: ReasonRequest,
    context: ReviewOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    try:
        result = PublishingService(session).reject_version(
            version_id, actor_user_id=context.user.id, reason=payload.reason
        )
        session.commit()
    except PublishingServiceError as exc:
        session.rollback()
        raise _error(exc) from exc
    return {"data": {"version_id": result.version_id, "status": result.status}}


@router.post("/valuations/{version_id}/revoke")
def revoke_version(
    version_id: int,
    payload: ReasonRequest,
    context: ReviewOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    try:
        result = PublishingService(session).revoke_version(
            version_id, actor_user_id=context.user.id, reason=payload.reason
        )
        session.commit()
    except PublishingServiceError as exc:
        session.rollback()
        raise _error(exc) from exc
    return {
        "data": {
            "version_id": result.version_id,
            "status": "revoked",
            "analysis_run_id": result.analysis_run_id,
        }
    }


@router.post("/valuations/{version_id}/restore")
def restore_version(
    version_id: int,
    payload: ReasonRequest,
    context: ReviewOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    try:
        result = PublishingService(session).restore_version(
            version_id,
            actor_user_id=context.user.id,
            actor_label=context.user.username,
            reason=payload.reason,
        )
        session.commit()
    except PublishingServiceError as exc:
        session.rollback()
        raise _error(exc) from exc
    return {
        "data": {
            "version_id": result.version_id,
            "status": "published",
            "superseded_version_ids": list(result.superseded_version_ids),
            "analysis_run_id": result.analysis_run_id,
        }
    }
