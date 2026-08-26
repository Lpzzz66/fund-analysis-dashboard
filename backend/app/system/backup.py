"""Database backup adapters with safe local targets and auditable results."""

from __future__ import annotations

import secrets
import sqlite3
import subprocess
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.base import AuditResult
from app.db.models import AuditLog
from app.imports.storage import UnsafeStoragePathError, resolve_in_root


class UnsafeBackupPathError(ValueError):
    """Raised when a backup output escapes the configured backup root."""


class UnsupportedDatabaseError(ValueError):
    """Raised when no logical-backup adapter exists for a database URL."""


class BackupStatus(StrEnum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass(frozen=True, slots=True)
class BackupExecution:
    """Result returned by the database-specific adapter."""

    status: BackupStatus
    target_path: Path | None
    command: tuple[str, ...]
    size_bytes: int
    error_code: str | None = None


@dataclass(frozen=True, slots=True)
class BackupResult:
    """Auditable result returned by ``BackupService``."""

    status: BackupStatus
    backup_path: Path | None
    size_bytes: int
    command: tuple[str, ...]
    error_code: str | None = None
    audit_log_id: int | None = None


class CommandRunner(Protocol):
    def __call__(self, command: Sequence[str]) -> object: ...


class DatabaseBackupAdapter:
    """Build and execute a PostgreSQL or SQLite logical backup."""

    def __init__(
        self,
        database_url: str,
        backup_root: Path,
        *,
        pg_dump_executable: str = "pg_dump",
        runner: CommandRunner | None = None,
    ) -> None:
        self.database_url = database_url
        self.backup_root = Path(backup_root).resolve()
        self.pg_dump_executable = pg_dump_executable
        self.runner = runner
        self._url = make_url(database_url)

    def build_command(self, output_name: str | Path) -> tuple[str, ...]:
        """Return a password-free command representation for the selected DB."""

        target = self._resolve_target(output_name)
        if self._is_postgresql:
            return self._postgresql_command(target)
        if self._is_sqlite:
            source = self._sqlite_source_path()
            return ("sqlite3", str(source), f".backup {target}")
        raise UnsupportedDatabaseError(self._url.drivername)

    def execute(self, output_name: str | Path) -> BackupExecution:
        """Run one backup without persisting application-level status."""

        target: Path | None = None
        command: tuple[str, ...] = ()
        try:
            target = self._resolve_target(output_name)
            command = self.build_command(target)
            if self._is_postgresql:
                return self._execute_postgresql(target, command)
            if self._is_sqlite:
                return self._execute_sqlite(target, command)
            raise UnsupportedDatabaseError(self._url.drivername)
        except UnsafeBackupPathError:
            return BackupExecution(
                status=BackupStatus.FAILED,
                target_path=target,
                command=command,
                size_bytes=0,
                error_code="unsafe_backup_path",
            )
        except UnsupportedDatabaseError:
            return BackupExecution(
                status=BackupStatus.FAILED,
                target_path=target,
                command=command,
                size_bytes=0,
                error_code="unsupported_database",
            )
        except Exception:  # noqa: BLE001 - adapter failures are recorded, not raised
            return BackupExecution(
                status=BackupStatus.FAILED,
                target_path=target,
                command=command,
                size_bytes=0,
                error_code="backup_execution_failed",
            )

    @property
    def _is_postgresql(self) -> bool:
        return self._url.drivername.startswith("postgresql")

    @property
    def _is_sqlite(self) -> bool:
        return self._url.drivername.startswith("sqlite")

    def _postgresql_command(self, target: Path) -> tuple[str, ...]:
        command: list[str] = [
            self.pg_dump_executable,
            "--no-password",
            "--format=custom",
            "--file",
            str(target),
        ]
        if self._url.host:
            command.extend(["--host", self._url.host])
        if self._url.port:
            command.extend(["--port", str(self._url.port)])
        if self._url.username:
            command.extend(["--username", self._url.username])
        if self._url.database:
            command.extend(["--dbname", self._url.database])
        return tuple(command)

    def _execute_postgresql(
        self, target: Path, command: tuple[str, ...]
    ) -> BackupExecution:
        if self.runner is None:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=30 * 60,
            )
        else:
            completed = self.runner(command)
        returncode = getattr(completed, "returncode", completed)
        if returncode != 0:
            return BackupExecution(
                status=BackupStatus.FAILED,
                target_path=target,
                command=command,
                size_bytes=target.stat().st_size if target.is_file() else 0,
                error_code="pg_dump_failed",
            )
        return BackupExecution(
            status=BackupStatus.SUCCEEDED,
            target_path=target,
            command=command,
            size_bytes=target.stat().st_size if target.is_file() else 0,
        )

    def _execute_sqlite(
        self, target: Path, command: tuple[str, ...]
    ) -> BackupExecution:
        source = self._sqlite_source_path()
        with (
            sqlite3.connect(str(source)) as source_connection,
            sqlite3.connect(str(target)) as target_connection,
        ):
            source_connection.backup(target_connection)
        return BackupExecution(
            status=BackupStatus.SUCCEEDED,
            target_path=target,
            command=command,
            size_bytes=target.stat().st_size if target.is_file() else 0,
        )

    def _sqlite_source_path(self) -> Path:
        database = self._url.database
        if not database or database == ":memory:":
            raise UnsupportedDatabaseError("sqlite_memory_database")
        return Path(database).resolve()

    def _resolve_target(self, output_name: str | Path) -> Path:
        self.backup_root.mkdir(parents=True, exist_ok=True)
        root = self.backup_root.resolve()
        requested = Path(output_name)
        if requested.is_absolute():
            candidate = requested.resolve()
            if not candidate.is_relative_to(root):
                raise UnsafeBackupPathError(str(output_name))
        else:
            if not str(requested) or str(requested) == ".":
                raise UnsafeBackupPathError(str(output_name))
            try:
                candidate = resolve_in_root(root, str(requested))
            except UnsafeStoragePathError as exc:
                raise UnsafeBackupPathError(str(output_name)) from exc
        lexical_candidate = (
            root / requested if not requested.is_absolute() else requested
        )
        if lexical_candidate.is_symlink() or candidate == root or candidate.is_dir():
            raise UnsafeBackupPathError(str(output_name))
        candidate.parent.mkdir(parents=True, exist_ok=True)
        return candidate


class BackupService:
    """Persist the most recent database backup status in ``AuditLog``."""

    def __init__(
        self,
        session: Session,
        adapter: DatabaseBackupAdapter,
        *,
        actor_user_id: int | None = None,
    ) -> None:
        self.session = session
        self.adapter = adapter
        self.actor_user_id = actor_user_id

    @classmethod
    def from_settings(
        cls,
        session: Session,
        settings: Settings,
        *,
        actor_user_id: int | None = None,
        pg_dump_executable: str = "pg_dump",
        runner: CommandRunner | None = None,
    ) -> BackupService:
        adapter = DatabaseBackupAdapter(
            settings.database_url,
            Path(settings.database_backup_dir),
            pg_dump_executable=pg_dump_executable,
            runner=runner,
        )
        return cls(session, adapter, actor_user_id=actor_user_id)

    def run(
        self,
        *,
        output_name: str | Path | None = None,
        now: datetime | None = None,
    ) -> BackupResult:
        current_time = now or datetime.now(UTC)
        name = output_name or self._default_output_name(current_time)
        execution = self.adapter.execute(name)
        summary = {
            "status": execution.status.value,
            "backup_name": execution.target_path.name
            if execution.target_path is not None
            else None,
            "size_bytes": execution.size_bytes,
            "command": list(execution.command),
            "error_code": execution.error_code,
            "completed_at": current_time.isoformat(),
            "remote_source_backup": "not_configured",
        }
        audit = AuditLog(
            actor_user_id=self.actor_user_id,
            action="system.database_backup",
            resource_type="database",
            summary=summary,
            result=(
                AuditResult.SUCCESS
                if execution.status == BackupStatus.SUCCEEDED
                else AuditResult.FAILURE
            ),
        )
        self.session.add(audit)
        self.session.flush()
        return BackupResult(
            status=execution.status,
            backup_path=execution.target_path,
            size_bytes=execution.size_bytes,
            command=execution.command,
            error_code=execution.error_code,
            audit_log_id=audit.id,
        )

    def run_backup(
        self,
        *,
        output_name: str | Path | None = None,
        now: datetime | None = None,
    ) -> BackupResult:
        """Alias for ``run`` used by task runners."""

        return self.run(output_name=output_name, now=now)

    def latest_result(self) -> BackupResult | None:
        audit = self.session.scalar(
            select(AuditLog)
            .where(
                AuditLog.action == "system.database_backup",
                AuditLog.resource_type == "database",
            )
            .order_by(AuditLog.id.desc())
            .limit(1)
        )
        if audit is None or not isinstance(audit.summary, dict):
            return None
        summary = audit.summary
        try:
            status = BackupStatus(str(summary.get("status", "failed")))
        except ValueError:
            status = BackupStatus.FAILED
        raw_command = summary.get("command", [])
        command = (
            tuple(str(item) for item in raw_command)
            if isinstance(raw_command, list)
            else ()
        )
        backup_name = summary.get("backup_name")
        backup_path: Path | None = None
        if isinstance(backup_name, str) and backup_name:
            try:
                backup_path = resolve_in_root(self.adapter.backup_root, backup_name)
            except UnsafeStoragePathError:
                backup_path = None
        raw_size = summary.get("size_bytes", 0)
        size_bytes = raw_size if isinstance(raw_size, int) else 0
        error_code = summary.get("error_code")
        return BackupResult(
            status=status,
            backup_path=backup_path,
            size_bytes=size_bytes,
            command=command,
            error_code=error_code if isinstance(error_code, str) else None,
            audit_log_id=audit.id,
        )

    @staticmethod
    def _default_output_name(now: datetime) -> str:
        stamp = now.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")
        return f"database-{stamp}-{secrets.token_hex(4)}.dump"


@dataclass(frozen=True, slots=True)
class RemoteBackupResult:
    """Explicit status for the intentionally unconfigured remote provider."""

    status: str
    message: str


class RemoteSourceBackupAdapter(Protocol):
    """Interface reserved for a future encrypted OSS/source-object adapter."""

    def backup(self, source_file_ids: Sequence[int]) -> RemoteBackupResult: ...


class UnconfiguredRemoteSourceBackup:
    """Do not claim remote protection until a real provider is configured."""

    def backup(self, source_file_ids: Sequence[int]) -> RemoteBackupResult:
        del source_file_ids
        return RemoteBackupResult(
            status="not_configured",
            message="remote source backup provider is not configured",
        )


__all__ = [
    "BackupResult",
    "BackupService",
    "BackupStatus",
    "DatabaseBackupAdapter",
    "RemoteBackupResult",
    "RemoteSourceBackupAdapter",
    "UnconfiguredRemoteSourceBackup",
    "UnsafeBackupPathError",
]
