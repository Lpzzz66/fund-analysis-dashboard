from app.main import create_app
from fastapi.testclient import TestClient


def test_health_live_returns_stable_public_fields() -> None:
    client = TestClient(create_app())

    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "fund-dashboard-api",
    }
