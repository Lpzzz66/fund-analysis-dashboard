"""Authenticated IMAP settings, connectivity, synchronization, and run history."""

from __future__ import annotations

import logging
import socket
import ssl
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import AuthContext, get_db, require_roles
from app.auth.service import AuthService
from app.config import Settings
from app.db.base import JobStatus, UserRole
from app.db.models import BackgroundJob
from app.mail import (
    MailConfigurationError,
    MailConnectionError,
    MailCredentialStoreError,
    MailService,
    MailSettings,
    MailSyncAlreadyRunning,
    mail_credential_status,
    write_mail_credential,
)
from app.system.settings import (
    effective_mail_sync_schedule,
    effective_mail_username,
    mail_sync_enabled,
    update_mail_username,
    update_settings,
)

router = APIRouter(prefix="/api/v1/mail", tags=["mail"])
logger = logging.getLogger(__name__)

DatabaseSession = Annotated[Session, Depends(get_db)]
MailReader = Annotated[
    AuthContext, Depends(require_roles(UserRole.ADMIN, UserRole.OPERATOR))
]
MailOperator = Annotated[
    AuthContext, Depends(require_roles(UserRole.ADMIN, UserRole.OPERATOR))
]
MailAdmin = Annotated[AuthContext, Depends(require_roles(UserRole.ADMIN))]


def _mail_settings(session: Session) -> MailSettings:
    return MailSettings.from_environment(
        username_override=effective_mail_username(session)
    )


def _service(request: Request, session: Session, settings: MailSettings) -> MailService:
    app_settings: Settings = request.app.state.settings
    return MailService.from_app_settings(
        session,
        app_settings,
        settings,
        connection_factory=getattr(request.app.state, "mail_connection_factory", None),
    )


def _public_settings(session: Session) -> dict[str, object]:
    credential = mail_credential_status()
    username = effective_mail_username(session)
    schedule = effective_mail_sync_schedule(session)
    try:
        settings = _mail_settings(session)
    except MailConfigurationError:
        return {
            "host": "",
            "port": 993,
            "username": username,
            **credential.as_dict(),
            "configured": False,
            "auto_sync_enabled": mail_sync_enabled(session),
            "schedule": schedule,
        }
    return {
        "host": settings.host,
        "port": settings.port,
        "username": settings.username,
        **credential.as_dict(),
        "configured": settings.configured,
        "auto_sync_enabled": mail_sync_enabled(session),
        "schedule": schedule,
    }


@router.get("/settings")
def get_settings(_: MailReader, session: DatabaseSession) -> dict[str, object]:
    return {"data": _public_settings(session)}


@router.put("/settings")
async def update_settings_endpoint(
    request: Request,
    context: MailAdmin,
    session: DatabaseSession,
) -> dict[str, object]:
    try:
        payload = await request.json()
    except (TypeError, ValueError):
        payload = None
    # The body is parsed manually so validation errors never echo an arbitrary
    # extra field, which could contain a credential submitted to the wrong endpoint.
    if not isinstance(payload, dict) or set(payload) != {"username"}:
        raise HTTPException(status_code=422, detail="invalid_mail_username")
    raw_username = payload.get("username")
    if not isinstance(raw_username, str):
        raise HTTPException(status_code=422, detail="invalid_mail_username")
    try:
        update_mail_username(session, raw_username)
    except ValueError as exc:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from None
    AuthService(session).record_audit(
        action="mail.username_updated",
        resource_type="mail_settings",
        resource_id="imap",
        actor_user_id=context.user.id,
        summary={"changed_keys": ["username"]},
    )
    session.commit()
    return {"data": _public_settings(session)}


@router.put("/credential")
async def update_credential(
    request: Request,
    context: MailAdmin,
    session: DatabaseSession,
) -> dict[str, object]:
    try:
        payload = await request.json()
    except ValueError:
        raise HTTPException(status_code=422, detail="invalid_mail_credential") from None
    if not isinstance(payload, dict) or set(payload) != {"authorization_code"}:
        raise HTTPException(status_code=422, detail="invalid_mail_credential")
    raw_code = payload.get("authorization_code")
    if not isinstance(raw_code, str):
        raise HTTPException(status_code=422, detail="invalid_mail_credential")
    authorization_code = raw_code.strip()
    if not authorization_code or len(authorization_code) > 256:
        raise HTTPException(status_code=422, detail="invalid_mail_credential")
    try:
        status = write_mail_credential(authorization_code)
    except MailCredentialStoreError as exc:
        code = str(exc)
        status_code = 409 if code == "mail_credential_managed_by_environment" else 503
        raise HTTPException(status_code=status_code, detail=code) from None
    AuthService(session).record_audit(
        action="mail.credential_updated",
        resource_type="mail_settings",
        resource_id="imap",
        actor_user_id=context.user.id,
        summary={"credential_source": status.source},
    )
    session.commit()
    return {"data": status.as_dict()}


def _set_auto_sync(
    enabled: bool,
    context: AuthContext,
    request: Request,
    session: Session,
) -> dict[str, object]:
    if mail_sync_enabled(session) != enabled:
        update_settings(
            session,
            request.app.state.settings,
            {"mail_sync_enabled": enabled},
        )
        AuthService(session).record_audit(
            action="mail.auto_sync_resumed" if enabled else "mail.auto_sync_paused",
            resource_type="mail_settings",
            resource_id="imap",
            actor_user_id=context.user.id,
            summary={"auto_sync_enabled": enabled},
        )
        session.commit()
    return {"data": {"auto_sync_enabled": enabled}}


@router.post("/pause")
def pause_auto_sync(
    request: Request,
    context: MailAdmin,
    session: DatabaseSession,
) -> dict[str, object]:
    return _set_auto_sync(False, context, request, session)


@router.post("/resume")
def resume_auto_sync(
    request: Request,
    context: MailAdmin,
    session: DatabaseSession,
) -> dict[str, object]:
    return _set_auto_sync(True, context, request, session)


@router.post("/test-connection")
def test_connection(
    request: Request,
    _: MailAdmin,
    session: DatabaseSession,
) -> dict[str, object]:
    try:
        settings = _mail_settings(session)
        service = _service(request, session, settings)
        service.test_connection()
    except MailConfigurationError as exc:
        detail = str(exc)
        if detail == "mail_password_unavailable":
            logger.warning("mail connection blocked: credential unavailable")
            raise HTTPException(
                status_code=503, detail="mail_credential_unavailable"
            ) from None
        logger.warning("mail connection blocked: not configured")
        raise HTTPException(status_code=503, detail="mail_not_configured") from None
    except MailConnectionError as exc:
        cause = exc.__cause__
        if isinstance(cause, socket.timeout):
            detail = "mail_connection_timeout"
        elif isinstance(cause, socket.gaierror):
            detail = "mail_dns_failed"
        elif isinstance(cause, ssl.SSLError):
            detail = "mail_tls_failed"
        else:
            detail = "mail_connection_failed"
        logger.warning(
            "mail connection failed: host=%s port=%s error=%s",
            settings.host,
            settings.port,
            detail,
        )
        raise HTTPException(status_code=502, detail=detail) from None
    return {"data": {"connected": True}}


@router.post("/sync")
def sync(
    request: Request,
    context: MailOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    try:
        settings = _mail_settings(session)
        service = _service(request, session, settings)
        if request.headers.get("x-async-sync") == "1":
            result = service.enqueue_sync(context.user.id)
        else:
            result = service.sync(context.user.id)
        session.commit()
    except MailSyncAlreadyRunning as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail=f"mail_sync_already_running:{exc}") from None
    except MailConfigurationError:
        session.rollback()
        raise HTTPException(status_code=503, detail="Mail is not configured") from None
    return {"data": result.as_dict()}


@router.post("/sync/{run_id}/cancel")
def cancel_sync(
    run_id: str,
    context: MailOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    job = session.scalar(
        select(BackgroundJob).where(
            BackgroundJob.job_type == "mail_sync",
            BackgroundJob.resource_id == run_id,
            BackgroundJob.status.in_((JobStatus.PENDING, JobStatus.RUNNING)),
        )
    )
    if job is None:
        raise HTTPException(status_code=404, detail="mail_sync_not_running")
    job.cancel_requested = True
    session.commit()
    return {"data": {"run_id": run_id, "status": "cancelling"}}


@router.get("/sync-runs")
def sync_runs(
    _: MailReader,
    session: DatabaseSession,
) -> dict[str, object]:
    return {"data": MailService.list_sync_runs(session)}


@router.put("/schedule")
async def update_schedule(
    request: Request,
    context: MailAdmin,
    session: DatabaseSession,
) -> dict[str, object]:
    try:
        payload = await request.json()
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="invalid_schedule") from None
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="invalid_schedule")
    try:
        update_settings(
            session,
            request.app.state.settings,
            {"mail_sync_schedule": payload},
        )
    except ValueError as exc:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from None
    AuthService(session).record_audit(
        action="mail.schedule_updated",
        resource_type="mail_settings",
        resource_id="imap",
        actor_user_id=context.user.id,
        summary={"changed_keys": ["mail_sync_schedule"]},
    )
    session.commit()
    return {"data": _public_settings(session)}
