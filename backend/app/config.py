"""Environment-based settings for the minimal backend application."""

import os
from dataclasses import dataclass
from pathlib import Path

MAX_UPLOAD_BYTES_LIMIT = 20 * 1024 * 1024


def _default_database_url() -> str:
    """Return the local development database URL without creating the file."""

    database_path = Path(__file__).resolve().parents[2] / "data" / "dev.db"
    return f"sqlite+pysqlite:///{database_path.as_posix()}"


def _project_data_path(*parts: str) -> str:
    return str(Path(__file__).resolve().parents[2].joinpath("data", *parts))


@dataclass(frozen=True, slots=True)
class Settings:
    """Local-safe runtime settings loaded from environment variables."""

    service_name: str = "fund-dashboard-api"
    environment: str = "development"
    host: str = "127.0.0.1"
    port: int = 8000
    database_url: str = ""
    upload_temp_dir: str = ""
    source_storage_dir: str = ""
    max_upload_bytes: int = 20 * 1024 * 1024


def get_settings() -> Settings:
    """Load application settings without requiring production secrets."""

    raw_port = os.getenv("APP_PORT", "8000")
    try:
        port = int(raw_port)
    except ValueError as exc:
        raise ValueError("APP_PORT must be an integer between 1 and 65535") from exc

    if not 1 <= port <= 65535:
        raise ValueError("APP_PORT must be an integer between 1 and 65535")

    environment = os.getenv("APP_ENV", "development")
    raw_database_url = os.getenv("DATABASE_URL")
    raw_temp_dir = os.getenv("UPLOAD_TEMP_DIR")
    raw_storage_dir = os.getenv("SOURCE_STORAGE_DIR")
    if environment.lower() == "production":
        missing = [
            name
            for name, value in (
                ("DATABASE_URL", raw_database_url),
                ("UPLOAD_TEMP_DIR", raw_temp_dir),
                ("SOURCE_STORAGE_DIR", raw_storage_dir),
            )
            if not value
        ]
        if missing:
            raise ValueError(
                f"{', '.join(missing)} required when APP_ENV=production; "
                "refusing to use local development storage"
            )
        if not raw_database_url.lower().startswith(("postgresql://", "postgresql+")):
            raise ValueError("DATABASE_URL must use PostgreSQL when APP_ENV=production")

    raw_max_upload_bytes = os.getenv("MAX_UPLOAD_BYTES", str(MAX_UPLOAD_BYTES_LIMIT))
    try:
        max_upload_bytes = int(raw_max_upload_bytes)
    except ValueError as exc:
        raise ValueError("MAX_UPLOAD_BYTES must be a positive integer") from exc
    if max_upload_bytes <= 0:
        raise ValueError("MAX_UPLOAD_BYTES must be a positive integer")
    if max_upload_bytes > MAX_UPLOAD_BYTES_LIMIT:
        raise ValueError("MAX_UPLOAD_BYTES cannot exceed 20 MiB")

    return Settings(
        service_name=os.getenv("APP_SERVICE_NAME", "fund-dashboard-api"),
        environment=environment,
        host=os.getenv("APP_HOST", "127.0.0.1"),
        port=port,
        database_url=raw_database_url or _default_database_url(),
        upload_temp_dir=raw_temp_dir or _project_data_path("tmp", "uploads"),
        source_storage_dir=raw_storage_dir or _project_data_path("source-files"),
        max_upload_bytes=max_upload_bytes,
    )
