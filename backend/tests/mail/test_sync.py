from __future__ import annotations

from app.db.models import ImportBatch, SourceFile, SourceMessage
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .conftest import FakeMailbox, make_email, make_xlsx_bytes


def test_settings_are_redacted_and_test_connection_uses_database_dependency(
    admin_client: TestClient,
    fake_mailbox: FakeMailbox,
) -> None:
    settings = admin_client.get("/api/v1/mail/settings")
    connection = admin_client.post("/api/v1/mail/test-connection")

    assert settings.status_code == 200
    assert settings.json() == {
        "data": {
            "configured": True,
            "host": "imap.example.test",
            "port": 993,
            "username": "funds@example.test",
        }
    }
    assert "test-only-authorisation-code" not in settings.text
    assert connection.status_code == 200
    assert connection.json() == {"data": {"connected": True}}
    assert fake_mailbox.connections[-1].selected_readonly is True
    assert fake_mailbox.connections[-1].logged_out is True


def test_sync_counts_attachments_and_sync_runs_return_a_list(
    admin_client: TestClient,
    fake_mailbox: FakeMailbox,
    app_and_engine: tuple[object, object],
) -> None:
    fake_mailbox.messages["1"] = make_email(
        "<message-1@example.test>",
        [("valuation.xlsx", make_xlsx_bytes()), ("notes.txt", b"ignore")],
    )

    response = admin_client.post("/api/v1/mail/sync")
    runs = admin_client.get("/api/v1/mail/sync-runs")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "succeeded"
    assert data["attachments_seen"] == 2
    assert data["attachments_imported"] == 1
    assert data["ignored_attachments"] == 1
    assert data["failed_attachments"] == 0
    assert data["batches_created"] == 1
    assert runs.status_code == 200
    assert isinstance(runs.json()["data"], list)
    assert runs.json()["data"][0]["run_id"] == data["run_id"]

    _, engine = app_and_engine
    with Session(engine) as session:
        assert session.scalar(select(func.count(SourceMessage.id))) == 1
        assert session.scalar(select(func.count(SourceFile.id))) == 1
        assert session.scalar(select(func.count(ImportBatch.id))) == 1


def test_message_id_and_attachment_hash_are_idempotent(
    admin_client: TestClient,
    fake_mailbox: FakeMailbox,
    app_and_engine: tuple[object, object],
) -> None:
    payload = make_xlsx_bytes()
    fake_mailbox.messages.update(
        {
            "1": make_email("<message-1@example.test>", [("one.xlsx", payload)]),
            "2": make_email("<message-2@example.test>", [("two.xlsx", payload)]),
        }
    )

    first = admin_client.post("/api/v1/mail/sync")
    second = admin_client.post("/api/v1/mail/sync")

    assert first.status_code == 200
    assert first.json()["data"]["attachments_imported"] == 1
    assert first.json()["data"]["duplicate_attachments"] == 1
    assert second.status_code == 200
    assert second.json()["data"]["messages_skipped"] == 2

    _, engine = app_and_engine
    with Session(engine) as session:
        assert session.scalar(select(func.count(SourceMessage.id))) == 2
        assert session.scalar(select(func.count(SourceFile.id))) == 1


def test_one_fetch_error_does_not_stop_later_messages(
    admin_client: TestClient,
    fake_mailbox: FakeMailbox,
) -> None:
    fake_mailbox.messages.update(
        {
            "1": None,
            "2": make_email(
                "<message-2@example.test>", [("valuation.xlsx", make_xlsx_bytes())]
            ),
        }
    )

    response = admin_client.post("/api/v1/mail/sync")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "failed"
    assert data["messages_seen"] == 2
    assert data["failed_messages"] == 1
    assert data["attachments_imported"] == 1


def test_operator_can_sync_but_viewer_cannot_access_mail(
    admin_client: TestClient,
    fake_mailbox: FakeMailbox,
) -> None:
    admin_client.post(
        "/api/v1/users",
        json={"username": "operator", "password": "correct horse", "role": "operator"},
    )
    admin_client.post(
        "/api/v1/users",
        json={"username": "viewer", "password": "correct horse", "role": "viewer"},
    )
    operator = TestClient(admin_client.app)
    viewer = TestClient(admin_client.app)
    operator.post(
        "/api/v1/auth/login",
        json={"username": "operator", "password": "correct horse"},
    )
    viewer.post(
        "/api/v1/auth/login",
        json={"username": "viewer", "password": "correct horse"},
    )
    fake_mailbox.messages["1"] = make_email(
        "<message-1@example.test>", [("valuation.xlsx", make_xlsx_bytes())]
    )

    operator_sync = operator.post("/api/v1/mail/sync")
    operator_test = operator.post("/api/v1/mail/test-connection")
    viewer_settings = viewer.get("/api/v1/mail/settings")
    viewer_sync_runs = viewer.get("/api/v1/mail/sync-runs")

    assert operator_sync.status_code == 200
    assert operator_test.status_code == 403
    assert viewer_settings.status_code == 403
    assert viewer_sync_runs.status_code == 403
