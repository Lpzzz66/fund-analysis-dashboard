"""Review and valuation publication routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import AuthContext, get_db, require_roles
from app.db.base import UserRole, ValidationLevel
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
) -> dict[str, object]:
    versions = session.scalars(
        select(ValuationVersion)
        .join(Fund, Fund.id == ValuationVersion.fund_id)
        .where(ValuationVersion.status == "pending_review")
        .order_by(ValuationVersion.valuation_date, ValuationVersion.id)
    ).all()
    data = []
    for version in versions:
        findings = session.scalars(
            select(ValidationResult).where(
                ValidationResult.valuation_version_id == version.id
            )
        ).all()
        data.append(
            {
                "id": version.id,
                "fund_id": version.fund_id,
                "fund_name": version.fund.standard_name,
                "valuation_date": version.valuation_date.isoformat(),
                "version_no": version.version_no,
                "critical_count": sum(
                    item.level == ValidationLevel.CRITICAL for item in findings
                ),
                "warning_count": sum(
                    item.level == ValidationLevel.WARNING for item in findings
                ),
            }
        )
    return {"data": data, "meta": {"total": len(data)}}


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
