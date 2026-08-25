"""Local authentication and administrator account routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import (
    SESSION_COOKIE_NAME,
    AuthContext,
    get_auth_context,
    get_db,
    require_roles,
)
from app.auth.service import SESSION_TTL, AuthService
from app.db.base import UserRole, UserStatus
from app.db.models import User

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
user_router = APIRouter(prefix="/api/v1/users", tags=["users"])

DatabaseSession = Annotated[Session, Depends(get_db)]
CurrentContext = Annotated[AuthContext, Depends(get_auth_context)]
AdminContext = Annotated[AuthContext, Depends(require_roles(UserRole.ADMIN))]


class InitializeRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=256)
    display_name: str | None = Field(default=None, max_length=255)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=256)
    role: UserRole
    display_name: str | None = Field(default=None, max_length=255)


class ResetPasswordRequest(BaseModel):
    password: str = Field(min_length=8, max_length=256)


class ChangeRoleRequest(BaseModel):
    role: UserRole


def _user_data(user: User) -> dict[str, object]:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "status": user.status,
        "last_login_at": user.last_login_at,
    }


def _set_session_cookie(request: Request, response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        secure=request.app.state.settings.environment.lower() == "production",
        samesite="lax",
        path="/",
    )


@router.post("/initialize", status_code=status.HTTP_201_CREATED)
def initialize(
    payload: InitializeRequest,
    request: Request,
    response: Response,
    session: DatabaseSession,
) -> dict[str, object]:
    service = AuthService(session)
    try:
        login = service.initialize_admin(
            payload.username, payload.password, payload.display_name
        )
        session.commit()
    except (AuthService.InitializationClosed, IntegrityError) as exc:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="Initialization already completed"
        ) from exc
    _set_session_cookie(request, response, login.raw_token)
    return {"data": _user_data(login.user)}


@router.post("/login")
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: DatabaseSession,
) -> dict[str, object]:
    service = AuthService(session)
    try:
        login_result = service.authenticate(
            payload.username,
            payload.password,
            device_info=request.headers.get("user-agent"),
        )
        session.commit()
    except AuthService.InvalidCredentials as exc:
        session.commit()
        raise HTTPException(
            status_code=401, detail="Invalid username or password"
        ) from exc
    _set_session_cookie(request, response, login_result.raw_token)
    return {"data": _user_data(login_result.user)}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    context: CurrentContext,
    session: DatabaseSession,
) -> Response:
    AuthService(session).logout(context.user, context.session)
    session.commit()
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=request.app.state.settings.environment.lower() == "production",
        samesite="lax",
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me")
def me(context: CurrentContext) -> dict[str, object]:
    return {"data": _user_data(context.user)}


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    context: CurrentContext,
    session: DatabaseSession,
) -> dict[str, object]:
    service = AuthService(session)
    try:
        service.change_password(
            context.user,
            context.session,
            payload.old_password,
            payload.new_password,
        )
        session.commit()
    except AuthService.InvalidOldPassword as exc:
        session.rollback()
        raise HTTPException(
            status_code=400, detail="Current password is incorrect"
        ) from exc
    return {"data": {"changed": True}}


@user_router.post("", status_code=status.HTTP_201_CREATED)
def create_user(
    payload: CreateUserRequest,
    context: AdminContext,
    session: DatabaseSession,
) -> dict[str, object]:
    service = AuthService(session)
    try:
        user = service.create_user(
            context.user,
            payload.username,
            payload.password,
            payload.role,
            payload.display_name,
        )
        session.commit()
    except (AuthService.DuplicateUsername, IntegrityError) as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Username already exists") from exc
    return {"data": _user_data(user)}


def _set_status(
    user_id: int,
    new_status: UserStatus,
    context: AuthContext,
    session: Session,
) -> dict[str, object]:
    try:
        user = AuthService(session).set_user_status(context.user, user_id, new_status)
        session.commit()
    except LookupError as exc:
        session.rollback()
        raise HTTPException(status_code=404, detail="User not found") from exc
    return {"data": _user_data(user)}


@user_router.post("/{user_id}/disable")
def disable_user(
    user_id: int, context: AdminContext, session: DatabaseSession
) -> dict[str, object]:
    return _set_status(user_id, UserStatus.DISABLED, context, session)


@user_router.post("/{user_id}/enable")
def enable_user(
    user_id: int, context: AdminContext, session: DatabaseSession
) -> dict[str, object]:
    return _set_status(user_id, UserStatus.ACTIVE, context, session)


@user_router.post("/{user_id}/reset-password")
def reset_password(
    user_id: int,
    payload: ResetPasswordRequest,
    context: AdminContext,
    session: DatabaseSession,
) -> dict[str, object]:
    try:
        user = AuthService(session).reset_password(
            context.user, user_id, payload.password
        )
        session.commit()
    except LookupError as exc:
        session.rollback()
        raise HTTPException(status_code=404, detail="User not found") from exc
    return {"data": _user_data(user)}


@user_router.patch("/{user_id}/role")
def change_role(
    user_id: int,
    payload: ChangeRoleRequest,
    context: AdminContext,
    session: DatabaseSession,
) -> dict[str, object]:
    try:
        user = AuthService(session).change_role(context.user, user_id, payload.role)
        session.commit()
    except LookupError as exc:
        session.rollback()
        raise HTTPException(status_code=404, detail="User not found") from exc
    return {"data": _user_data(user)}


@user_router.post("/{user_id}/revoke-sessions")
def revoke_sessions(
    user_id: int, context: AdminContext, session: DatabaseSession
) -> dict[str, object]:
    try:
        user = AuthService(session).revoke_sessions(context.user, user_id)
        session.commit()
    except LookupError as exc:
        session.rollback()
        raise HTTPException(status_code=404, detail="User not found") from exc
    return {"data": _user_data(user)}
