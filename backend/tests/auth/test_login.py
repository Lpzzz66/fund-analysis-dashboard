from datetime import UTC, datetime, timedelta

import pytest
from app.auth.service import AuthService
from app.db.models import AuditLog, User, UserSession
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session


@pytest.mark.security
def test_initialize_first_admin_and_reject_second(client: TestClient) -> None:
    first = client.post(
        "/api/v1/auth/initialize",
        json={"username": "admin", "password": "correct horse", "display_name": "管理员"},
    )
    second = client.post(
        "/api/v1/auth/initialize",
        json={"username": "other", "password": "correct horse"},
    )

    assert first.status_code == 201
    assert first.json()["data"]["role"] == "admin"
    assert second.status_code == 409


@pytest.mark.security
def test_login_sets_secure_session_cookie_and_me(client: TestClient) -> None:
    client.post(
        "/api/v1/auth/initialize",
        json={"username": "admin", "password": "correct horse"},
    )

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "correct horse"},
    )
    me = client.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert response.cookies.get("fund_session")
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]
    assert me.status_code == 200
    assert me.json()["data"]["username"] == "admin"


@pytest.mark.security
def test_wrong_password_uses_generic_error_and_locks_after_five_failures(
    app_and_engine: tuple[object, object],
) -> None:
    _, engine = app_and_engine
    with Session(engine) as session:
        service = AuthService(session)
        service.initialize_admin("admin", "correct horse")
        now = datetime(2026, 8, 26, 12, 0, tzinfo=UTC)

        for _ in range(5):
            with pytest.raises(service.InvalidCredentials):
                service.authenticate("admin", "wrong", now=now)

        user = session.scalar(select(User).where(User.username == "admin"))
        assert user is not None
        assert user.failed_login_count == 5
        assert service._as_utc(user.locked_until) == now + timedelta(minutes=15)

        with pytest.raises(service.InvalidCredentials):
            service.authenticate("admin", "correct horse", now=now)

        result = service.authenticate(
            "admin", "correct horse", now=now + timedelta(minutes=16)
        )
        assert result.user.username == "admin"
        assert user.failed_login_count == 0
        assert user.locked_until is None


@pytest.mark.security
def test_disabled_user_cannot_use_existing_session(client: TestClient) -> None:
    client.post(
        "/api/v1/auth/initialize",
        json={"username": "admin", "password": "correct horse"},
    )
    client.post(
        "/api/v1/users",
        json={"username": "viewer", "password": "correct horse", "role": "viewer"},
    )
    viewer = TestClient(client.app)
    viewer.post(
        "/api/v1/auth/login",
        json={"username": "viewer", "password": "correct horse"},
    )

    disable = client.post("/api/v1/users/2/disable")
    me = viewer.get("/api/v1/auth/me")

    assert disable.status_code == 200
    assert me.status_code == 401


@pytest.mark.security
def test_logout_and_change_password_revoke_other_sessions(client: TestClient) -> None:
    client.post(
        "/api/v1/auth/initialize",
        json={"username": "admin", "password": "correct horse"},
    )
    client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "correct horse"},
    )
    other = TestClient(client.app)
    other.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "correct horse"},
    )

    changed = client.post(
        "/api/v1/auth/change-password",
        json={"old_password": "correct horse", "new_password": "new correct horse"},
    )
    old_session_me = other.get("/api/v1/auth/me")
    logged_out = client.post("/api/v1/auth/logout")
    current_session_me = client.get("/api/v1/auth/me")

    assert changed.status_code == 200
    assert old_session_me.status_code == 401
    assert logged_out.status_code == 204
    assert current_session_me.status_code == 401


@pytest.mark.security
def test_audit_log_does_not_store_plaintext_password_or_token(
    app_and_engine: tuple[object, object],
) -> None:
    _, engine = app_and_engine
    with Session(engine) as session:
        service = AuthService(session)
        result = service.initialize_admin("admin", "correct horse")
        login = service.authenticate("admin", "correct horse")
        session.commit()

        user = session.scalar(select(User).where(User.username == "admin"))
        audit_rows = session.scalars(select(AuditLog)).all()
        sessions = session.scalars(select(UserSession)).all()

        assert user is not None
        assert user.password_hash != "correct horse"
        assert user.password_hash.startswith("$argon2id$")
        assert all("correct horse" not in str(row.summary) for row in audit_rows)
        assert sessions[0].token_hash != login.raw_token
        assert result.user.id == user.id


@pytest.mark.security
def test_production_login_cookie_is_secure(client: TestClient) -> None:
    client.app.state.settings = client.app.state.settings.__class__(
        service_name="fund-dashboard-api",
        environment="production",
        host="127.0.0.1",
        port=8000,
        database_url="sqlite+pysqlite:///:memory:",
    )
    client.post(
        "/api/v1/auth/initialize",
        json={"username": "admin", "password": "correct horse"},
    )

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "correct horse"},
    )

    assert "Secure" in response.headers["set-cookie"]
