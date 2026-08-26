"""Validated, non-sensitive settings stored in the singleton system row."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import SystemState


class SystemSettingsError(ValueError):
    """Raised when a setting key or value is outside the supported contract."""


@dataclass(frozen=True, slots=True)
class SettingDefinition:
    kind: str
    minimum: int | None = None
    maximum: int | None = None


SETTING_DEFINITIONS: dict[str, SettingDefinition] = {
    "source_retention_days": SettingDefinition("int", 1, 3650),
    "task_concurrency": SettingDefinition("int", 1, 16),
    "data_lateness_days": SettingDefinition("int", 0, 30),
    "mail_sync_interval_minutes": SettingDefinition("int", 1, 1440),
    "mail_sync_enabled": SettingDefinition("bool"),
    "backup_retention_days": SettingDefinition("int", 1, 3650),
    "timezone": SettingDefinition("timezone"),
}

DEFAULT_VALUES: dict[str, object] = {
    "task_concurrency": 1,
    "data_lateness_days": 1,
    "mail_sync_interval_minutes": 15,
    "mail_sync_enabled": True,
    "backup_retention_days": 30,
    "timezone": "Asia/Shanghai",
}

RUNTIME_NOTE = (
    "The mail sync switch is read before every scheduled run. Other database-backed "
    "values are persisted but are not hot-applied by current worker processes."
)


def _baseline_values(runtime_settings: Settings) -> dict[str, object]:
    return {
        **DEFAULT_VALUES,
        "source_retention_days": runtime_settings.source_retention_days,
    }


def _source_for_baseline(key: str) -> str:
    if key == "source_retention_days":
        return "environment" if "SOURCE_RETENTION_DAYS" in os.environ else "default"
    return "default"


def validate_updates(values: dict[str, object]) -> dict[str, object]:
    """Validate and normalize a partial setting update."""

    normalized: dict[str, object] = {}
    for key, value in values.items():
        definition = SETTING_DEFINITIONS.get(key)
        if definition is None:
            raise SystemSettingsError(f"unknown_setting:{key}")
        if definition.kind == "int":
            if isinstance(value, bool) or not isinstance(value, int):
                raise SystemSettingsError(f"invalid_type:{key}")
            assert definition.minimum is not None
            assert definition.maximum is not None
            if not definition.minimum <= value <= definition.maximum:
                raise SystemSettingsError(f"out_of_range:{key}")
            normalized[key] = value
            continue
        if definition.kind == "bool":
            if not isinstance(value, bool):
                raise SystemSettingsError(f"invalid_type:{key}")
            normalized[key] = value
            continue
        if not isinstance(value, str) or not value.strip():
            raise SystemSettingsError(f"invalid_type:{key}")
        timezone = value.strip()
        try:
            ZoneInfo(timezone)
        except ZoneInfoNotFoundError as exc:
            raise SystemSettingsError(f"invalid_timezone:{key}") from exc
        normalized[key] = timezone
    return normalized


def _state(session: Session) -> SystemState:
    state = session.get(SystemState, 1)
    if state is None:
        state = SystemState(id=1)
        session.add(state)
        session.flush()
    return state


def effective_settings(
    session: Session, runtime_settings: Settings
) -> dict[str, dict[str, object]]:
    """Return whitelisted values with their persisted/environment source."""

    state = session.get(SystemState, 1)
    persisted: dict[str, Any] = (
        state.settings if state is not None and isinstance(state.settings, dict) else {}
    )
    baseline = _baseline_values(runtime_settings)
    result: dict[str, dict[str, object]] = {}
    for key in SETTING_DEFINITIONS:
        value = baseline[key]
        source = _source_for_baseline(key)
        if key in persisted:
            try:
                value = validate_updates({key: persisted[key]})[key]
                source = "database"
            except SystemSettingsError:
                # Invalid legacy data must not make the settings endpoint fail open.
                value = baseline[key]
        result[key] = {"value": value, "source": source}
    return result


def update_settings(
    session: Session,
    runtime_settings: Settings,
    values: dict[str, object],
) -> dict[str, dict[str, object]]:
    normalized = validate_updates(values)
    state = _state(session)
    current = state.settings if isinstance(state.settings, dict) else {}
    state.settings = {**current, **normalized}
    session.flush()
    return effective_settings(session, runtime_settings)


def mail_sync_enabled(session: Session) -> bool:
    state = session.get(SystemState, 1)
    if state is None or not isinstance(state.settings, dict):
        return True
    value = state.settings.get("mail_sync_enabled", True)
    return value if isinstance(value, bool) else True


__all__ = [
    "RUNTIME_NOTE",
    "SETTING_DEFINITIONS",
    "SystemSettingsError",
    "effective_settings",
    "mail_sync_enabled",
    "update_settings",
    "validate_updates",
]
