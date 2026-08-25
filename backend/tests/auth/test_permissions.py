import pytest
from fastapi.testclient import TestClient


@pytest.mark.security
def test_only_admin_can_manage_accounts(client: TestClient) -> None:
    client.post(
        "/api/v1/auth/initialize",
        json={"username": "admin", "password": "correct horse"},
    )
    client.post(
        "/api/v1/users",
        json={"username": "operator", "password": "correct horse", "role": "operator"},
    )
    client.post(
        "/api/v1/users",
        json={"username": "viewer", "password": "correct horse", "role": "viewer"},
    )

    operator = TestClient(client.app)
    viewer = TestClient(client.app)
    operator.post(
        "/api/v1/auth/login",
        json={"username": "operator", "password": "correct horse"},
    )
    viewer.post(
        "/api/v1/auth/login",
        json={"username": "viewer", "password": "correct horse"},
    )

    operator_attempt = operator.post(
        "/api/v1/users",
        json={"username": "blocked", "password": "correct horse", "role": "viewer"},
    )
    viewer_attempt = viewer.post(
        "/api/v1/users",
        json={"username": "blocked2", "password": "correct horse", "role": "viewer"},
    )

    assert operator_attempt.status_code == 403
    assert viewer_attempt.status_code == 403


@pytest.mark.security
def test_admin_can_change_role_reset_enable_and_revoke_sessions(
    client: TestClient,
) -> None:
    client.post(
        "/api/v1/auth/initialize",
        json={"username": "admin", "password": "correct horse"},
    )
    created = client.post(
        "/api/v1/users",
        json={"username": "member", "password": "correct horse", "role": "viewer"},
    )
    user_id = created.json()["data"]["id"]
    member = TestClient(client.app)
    member.post(
        "/api/v1/auth/login",
        json={"username": "member", "password": "correct horse"},
    )

    changed_role = client.patch(
        f"/api/v1/users/{user_id}/role", json={"role": "operator"}
    )
    revoked = client.post(f"/api/v1/users/{user_id}/revoke-sessions")
    disabled = client.post(f"/api/v1/users/{user_id}/disable")
    enabled = client.post(f"/api/v1/users/{user_id}/enable")
    reset = client.post(
        f"/api/v1/users/{user_id}/reset-password",
        json={"password": "replacement password"},
    )

    assert changed_role.json()["data"]["role"] == "operator"
    assert revoked.status_code == 200
    assert member.get("/api/v1/auth/me").status_code == 401
    assert disabled.json()["data"]["status"] == "disabled"
    assert enabled.json()["data"]["status"] == "active"
    assert reset.status_code == 200
