"""Application factory and public process health endpoint."""

from fastapi import FastAPI

from .config import get_settings


def create_app() -> FastAPI:
    """Create the FastAPI application with its minimal public endpoint."""

    settings = get_settings()
    app = FastAPI(title=settings.service_name)

    @app.get("/health/live", tags=["health"])
    def health_live() -> dict[str, str]:
        """Return a stable, non-sensitive liveness response."""

        return {
            "status": "ok",
            "service": settings.service_name,
        }

    return app


app = create_app()
