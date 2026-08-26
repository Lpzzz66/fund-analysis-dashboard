from __future__ import annotations

import sqlite3
import subprocess
from datetime import UTC, datetime
from pathlib import Path

import pytest
from app.db.base import AuditResult
from app.db.models import AuditLog
from app.system.backup import (
    BackupService,
    BackupStatus,
    DatabaseBackupAdapter,
    UnconfiguredRemoteSourceBackup,
    UnsafeBackupPathError,
)
from sqlalchemy import select
from sqlalchemy.orm import Session


def _sqlite_url(path: Path) -> str:
    return f"sqlite+pysqlite:///{path.as_posix()}"


def test_postgresql_command_never_contains_connection_password(
    tmp_path: Path,
) -> None:
    adapter = DatabaseBackupAdapter(
        "postgresql+psycopg://backup_user:super-secret@db.example:5432/funds?sslmode=require",
        tmp_path,
    )

    command = adapter.build_command("nested/database.dump")

    assert command[0] == "pg_dump"
    assert "--no-password" in command
    assert "super-secret" not in " ".join(command)
    assert "backup_user" in command
    assert str((tmp_path / "nested" / "database.dump").resolve()) in command


def test_backup_target_cannot_escape_configured_root(tmp_path: Path) -> None:
    adapter = DatabaseBackupAdapter(
        "postgresql+psycopg://backup_user@db.example/funds",
        tmp_path / "backups",
    )

    with pytest.raises(UnsafeBackupPathError):
        adapter.build_command("../outside.dump")


def test_sqlite_adapter_makes_a_real_backup(tmp_path: Path) -> None:
    database_path = tmp_path / "application.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute("CREATE TABLE sample (value TEXT NOT NULL)")
        connection.execute("INSERT INTO sample (value) VALUES ('kept')")
        connection.commit()

    adapter = DatabaseBackupAdapter(_sqlite_url(database_path), tmp_path / "backups")
    execution = adapter.execute("application-copy.db")

    assert execution.status == BackupStatus.SUCCEEDED
    assert (
        execution.target_path
        == (tmp_path / "backups" / "application-copy.db").resolve()
    )
    assert execution.size_bytes > 0
    with sqlite3.connect(execution.target_path) as connection:
        assert connection.execute("SELECT value FROM sample").fetchone() == ("kept",)


def test_backup_service_records_failure_and_keeps_password_out_of_audit(
    session: Session, tmp_path: Path
) -> None:
    captured: list[tuple[str, ...]] = []

    def failed_runner(command: tuple[str, ...]) -> subprocess.CompletedProcess[str]:
        captured.append(command)
        return subprocess.CompletedProcess(
            command,
            1,
            stdout="",
            stderr="connection failed for super-secret",
        )

    adapter = DatabaseBackupAdapter(
        "postgresql+psycopg://backup_user:super-secret@db.example/funds",
        tmp_path / "backups",
        runner=failed_runner,
    )
    service = BackupService(session, adapter)

    result = service.run(
        output_name="failed.dump",
        now=datetime(2026, 8, 26, tzinfo=UTC),
    )

    assert result.status == BackupStatus.FAILED
    assert result.error_code == "pg_dump_failed"
    assert captured and "super-secret" not in " ".join(captured[0])
    audit = session.get(AuditLog, result.audit_log_id)
    assert audit is not None
    assert audit.result == AuditResult.FAILURE
    assert "super-secret" not in repr(audit.summary)
    assert service.latest_result() == result


def test_backup_service_records_success_and_recent_result(
    session: Session, tmp_path: Path
) -> None:
    database_path = tmp_path / "application.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute("CREATE TABLE sample (value TEXT NOT NULL)")
        connection.execute("INSERT INTO sample (value) VALUES ('ok')")
        connection.commit()

    service = BackupService(
        session,
        DatabaseBackupAdapter(_sqlite_url(database_path), tmp_path / "backups"),
    )
    result = service.run(output_name="success.db")

    assert result.status == BackupStatus.SUCCEEDED
    assert result.backup_path is not None and result.backup_path.exists()
    assert service.latest_result() == result
    audit = session.scalar(select(AuditLog).where(AuditLog.id == result.audit_log_id))
    assert audit is not None
    assert audit.result == AuditResult.SUCCESS
    assert audit.summary["remote_source_backup"] == "not_configured"


def test_remote_source_backup_is_explicitly_not_configured() -> None:
    result = UnconfiguredRemoteSourceBackup().backup([1, 2])

    assert result.status == "not_configured"
    assert "not configured" in result.message
