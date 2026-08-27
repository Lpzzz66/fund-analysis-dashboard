from __future__ import annotations

import os
import stat

import pytest
from app.db.models import (
    AuditLog,
    ImportBatch,
    SourceFile,
    SourceMessage,
    SystemState,
)
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
            "credential_source": "environment",
            "credential_writable": False,
            "auto_sync_enabled": True,
        }
    }
    assert "test-only-authorisation-code" not in settings.text
    assert connection.status_code == 200
    assert connection.json() == {"data": {"connected": True}}
    assert fake_mailbox.connections[-1].selected_readonly is True
    assert fake_mailbox.connections[-1].logged_out is True


def test_admin_can_update_mail_username_and_it_is_used_by_settings(
    admin_client: TestClient,
    fake_mailbox: FakeMailbox,
    app_and_engine: tuple[object, object],
) -> None:
    response = admin_client.put(
        "/api/v1/mail/settings",
        json={"username": " updated@example.test "},
    )
    settings = admin_client.get("/api/v1/mail/settings")

    assert response.status_code == 200
    assert response.json()["data"]["username"] == "updated@example.test"
    assert settings.json()["data"]["username"] == "updated@example.test"
    connection = admin_client.post("/api/v1/mail/test-connection")
    assert connection.status_code == 200
    assert fake_mailbox.connections[-1].logged_in_with == (
        "updated@example.test",
        "test-only-authorisation-code",
    )

    _, engine = app_and_engine
    with Session(engine) as session:
        state = session.get(SystemState, 1)
        assert state is not None
        assert state.settings["mail_imap_username"] == "updated@example.test"
        audit = session.scalar(
            select(AuditLog).where(AuditLog.action == "mail.username_updated")
        )
        assert audit is not None
        assert audit.summary == {"changed_keys": ["username"]}


def test_mail_username_update_is_admin_only_and_validated(
    admin_client: TestClient,
) -> None:
    admin_client.post(
        "/api/v1/users",
        json={
            "username": "mail-operator",
            "password": "correct horse",
            "role": "operator",
        },
    )
    operator = TestClient(admin_client.app)
    operator.post(
        "/api/v1/auth/login",
        json={"username": "mail-operator", "password": "correct horse"},
    )

    assert (
        operator.put(
            "/api/v1/mail/settings", json={"username": "other@example.test"}
        ).status_code
        == 403
    )
    assert (
        admin_client.put("/api/v1/mail/settings", json={"username": "   "}).status_code
        == 422
    )
    assert (
        admin_client.put(
            "/api/v1/mail/settings", json={"username": "a", "extra": True}
        ).status_code
        == 422
    )


def test_admin_can_store_authorization_code_without_exposing_it(
    admin_client: TestClient,
    app_and_engine: tuple[object, object],
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    secret_directory = tmp_path / "mail-secrets"
    secret_directory.mkdir()
    secret_path = secret_directory / "imap_password"
    authorization_code = "new-test-authorisation-code"
    monkeypatch.delenv("MAIL_IMAP_PASSWORD")
    monkeypatch.setenv("MAIL_IMAP_PASSWORD_FILE", str(secret_path))

    response = admin_client.put(
        "/api/v1/mail/credential",
        json={"authorization_code": authorization_code},
    )
    settings = admin_client.get("/api/v1/mail/settings")

    assert response.status_code == 200
    assert response.json() == {
        "data": {
            "configured": True,
            "credential_source": "secret_file",
            "credential_writable": True,
        }
    }
    assert authorization_code not in response.text
    assert secret_path.read_text(encoding="utf-8") == authorization_code
    if os.name != "nt":
        assert stat.S_IMODE(secret_path.stat().st_mode) == 0o600
    assert settings.json()["data"]["credential_source"] == "secret_file"
    assert authorization_code not in settings.text

    _, engine = app_and_engine
    with Session(engine) as session:
        audit = session.scalar(
            select(AuditLog).where(AuditLog.action == "mail.credential_updated")
        )
        assert audit is not None
        assert authorization_code not in str(audit.summary)


def test_environment_managed_authorization_code_cannot_be_overwritten(
    admin_client: TestClient,
) -> None:
    response = admin_client.put(
        "/api/v1/mail/credential",
        json={"authorization_code": "replacement-code"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "mail_credential_managed_by_environment"
    assert "replacement-code" not in response.text


def test_authorization_code_update_requires_configured_writable_directory(
    admin_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    monkeypatch.delenv("MAIL_IMAP_PASSWORD")
    monkeypatch.setenv(
        "MAIL_IMAP_PASSWORD_FILE", str(tmp_path / "missing" / "imap_password")
    )

    response = admin_client.put(
        "/api/v1/mail/credential",
        json={"authorization_code": "must-not-be-written"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "mail_credential_file_unavailable"
    assert "must-not-be-written" not in response.text


def test_invalid_authorization_code_is_redacted_from_validation_response(
    admin_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    secret_directory = tmp_path / "mail-secrets"
    secret_directory.mkdir()
    monkeypatch.delenv("MAIL_IMAP_PASSWORD")
    monkeypatch.setenv(
        "MAIL_IMAP_PASSWORD_FILE", str(secret_directory / "imap_password")
    )
    invalid_code = "x" * 257

    response = admin_client.put(
        "/api/v1/mail/credential",
        json={"authorization_code": invalid_code},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "invalid_mail_credential"
    assert invalid_code not in response.text


def test_authorization_code_update_rejects_unknown_fields_without_echo(
    admin_client: TestClient,
) -> None:
    response = admin_client.put(
        "/api/v1/mail/credential",
        json={"authorization_code": "hidden-code", "unexpected": True},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "invalid_mail_credential"
    assert "hidden-code" not in response.text


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
    paused = admin_client.post("/api/v1/mail/pause")
    operator_sync_while_paused = operator.post("/api/v1/mail/sync")
    operator_pause = operator.post("/api/v1/mail/pause")
    operator_credential = operator.put(
        "/api/v1/mail/credential", json={"authorization_code": "forbidden-code"}
    )
    viewer_resume = viewer.post("/api/v1/mail/resume")
    resumed = admin_client.post("/api/v1/mail/resume")

    assert operator_sync.status_code == 200
    assert operator_test.status_code == 403
    assert viewer_settings.status_code == 403
    assert viewer_sync_runs.status_code == 403
    assert paused.status_code == 200
    assert paused.json()["data"]["auto_sync_enabled"] is False
    assert operator_sync_while_paused.status_code == 200
    assert operator_pause.status_code == 403
    assert operator_credential.status_code == 403
    assert viewer_resume.status_code == 403
    assert resumed.status_code == 200
    assert resumed.json()["data"]["auto_sync_enabled"] is True


def test_safe_filename_rejects_windows_reserved_names() -> None:
    from app.mail.service import MailService

    service = MailService.__new__(MailService)
    assert service._safe_filename("CON.xlsx") is False
    assert service._safe_filename("NUL.xlsx") is False
    assert service._safe_filename("com1.xlsx") is False
    assert service._safe_filename("lpt9.XLSX") is False
    # Trailing dots and spaces: Windows silently strips them, so two
    # different filenames collide on disk.
    assert service._safe_filename("report.xlsx.") is False
    assert service._safe_filename("report.xlsx ") is False
    # Normal filenames still pass.
    assert service._safe_filename("估值表.xlsx") is True
    assert service._safe_filename(f"{'x' * 495}.xlsx") is True
    assert service._safe_filename(f"{'x' * 496}.xlsx") is False


def test_decode_filename_rejects_misdeclared_charset() -> None:
    """UTF-8 bytes declared as iso-8859-1 used to fall through to a latin-1
    decode and save mojibake; now it must return "" so the caller falls back
    to a token-based filename instead of persisting unreadable text."""

    from app.mail.service import MailService

    service = MailService.__new__(MailService)
    # UTF-8 bytes for "你好" declared as iso-8859-1.
    raw = "=?iso-8859-1?B?5L2g5aW9?="
    assert service._decode_filename(raw) == ""
    # When charset and bytes agree, decoding still works.
    good = "=?utf-8?B?5L2g5aW9?="
    assert service._decode_filename(good) == "你好"
