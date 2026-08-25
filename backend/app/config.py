"""Environment-based settings for the minimal backend application."""

import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Settings:
    """Local-safe runtime settings loaded from environment variables."""

    service_name: str = "fund-dashboard-api"
    environment: str = "development"
    host: str = "127.0.0.1"
    port: int = 8000


def get_settings() -> Settings:
    """Load application settings without requiring production secrets."""

    raw_port = os.getenv("APP_PORT", "8000")
    try:
        port = int(raw_port)
    except ValueError as exc:
        raise ValueError(
            "APP_PORT must be an integer between 1 and 65535"
        ) from exc

    if not 1 <= port <= 65535:
        raise ValueError("APP_PORT must be an integer between 1 and 65535")

    return Settings(
        service_name=os.getenv("APP_SERVICE_NAME", "fund-dashboard-api"),
        environment=os.getenv("APP_ENV", "development"),
        host=os.getenv("APP_HOST", "127.0.0.1"),
        port=port,
    )
