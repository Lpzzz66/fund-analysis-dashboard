"""Authenticated IMAP settings, connectivity, synchronization, and run history."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth.dependencies import AuthContext, get_db, require_roles
from app.config import Settings
from app.db.base import UserRole
from app.mail import (
    MailConfigurationError,
    MailConnectionError,
    MailService,
    MailSettings,
)

router = APIRouter(prefix="/api/v1/mail", tags=["mail"])

DatabaseSession = Annotated[Session, Depends(get_db)]
MailReader = Annotated[
    AuthContext, Depends(require_roles(UserRole.ADMIN, UserRole.OPERATOR))
]
MailOperator = Annotated[
    AuthContext, Depends(require_roles(UserRole.ADMIN, UserRole.OPERATOR))
]
MailAdmin = Annotated[AuthContext, Depends(require_roles(UserRole.ADMIN))]


def _mail_settings() -> MailSettings:
    return MailSettings.from_environment()


def _service(request: Request, session: Session, settings: MailSettings) -> MailService:
    app_settings: Settings = request.app.state.settings
    return MailService.from_app_settings(
        session,
        app_settings,
        settings,
        connection_factory=getattr(request.app.state, "mail_connection_factory", None),
    )


@router.get("/settings")
def get_settings(_: MailReader) -> dict[str, object]:
    try:
        settings = _mail_settings()
    except MailConfigurationError:
        return {"data": {"configured": False, "host": "", "port": 993, "username": ""}}
    return {
        "data": {
            "configured": settings.configured,
            "host": settings.host,
            "port": settings.port,
            "username": settings.username,
        }
    }


@router.post("/test-connection")
def test_connection(
    request: Request,
    _: MailAdmin,
    session: DatabaseSession,
) -> dict[str, object]:
    try:
        settings = _mail_settings()
        service = _service(request, session, settings)
        service.test_connection()
    except MailConfigurationError:
        raise HTTPException(status_code=503, detail="Mail is not configured") from None
    except MailConnectionError:
        raise HTTPException(status_code=502, detail="Mail connection failed") from None
    return {"data": {"connected": True}}


@router.post("/sync")
def sync(
    request: Request,
    context: MailOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    try:
        settings = _mail_settings()
        result = _service(request, session, settings).sync(context.user.id)
        session.commit()
    except MailConfigurationError:
        session.rollback()
        raise HTTPException(status_code=503, detail="Mail is not configured") from None
    return {"data": result.as_dict()}


@router.get("/sync-runs")
def sync_runs(
    _: MailReader,
    session: DatabaseSession,
) -> dict[str, object]:
    return {"data": MailService.list_sync_runs(session)}
