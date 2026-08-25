import pytest
from app.config import get_settings
from fastapi.testclient import TestClient


def _create_app():
    from app.main import create_app

    return create_app()


def test_health_live_returns_stable_public_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("APP_SERVICE_NAME", raising=False)
    monkeypatch.delenv("APP_PORT", raising=False)
    client = TestClient(_create_app())

    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "fund-dashboard-api",
    }


def test_default_health_is_not_distorted_by_external_service_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("APP_SERVICE_NAME", raising=False)
    monkeypatch.delenv("APP_PORT", raising=False)

    response = TestClient(_create_app()).get("/health/live")

    assert response.json()["service"] == "fund-dashboard-api"


def test_health_uses_external_service_name_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_SERVICE_NAME", "review-env-override")
    monkeypatch.delenv("APP_PORT", raising=False)

    response = TestClient(_create_app()).get("/health/live")

    assert response.json()["service"] == "review-env-override"


def test_invalid_app_port_has_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_PORT", "not-a-port")

    with pytest.raises(
        ValueError,
        match="APP_PORT must be an integer between 1 and 65535",
    ):
        get_settings()
