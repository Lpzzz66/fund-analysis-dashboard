"""Application factory and public process health endpoint."""

from fastapi import FastAPI

from .api.auth import router as auth_router
from .api.auth import user_router
from .api.dashboard import router as dashboard_router
from .api.imports import router as imports_router
from .api.reviews import router as reviews_router
from .config import get_settings
from .db.session import create_engine


def create_app() -> FastAPI:
    """Create the FastAPI application with its minimal public endpoint."""

    settings = get_settings()
    app = FastAPI(title=settings.service_name)
    app.state.settings = settings
    app.state.db_engine = create_engine(settings.database_url)
    app.include_router(auth_router)
    app.include_router(user_router)
    app.include_router(imports_router)
    app.include_router(dashboard_router)
    app.include_router(reviews_router)

    @app.get("/health/live", tags=["health"])
    def health_live() -> dict[str, str]:
        """Return a stable, non-sensitive liveness response."""

        return {
            "status": "ok",
            "service": settings.service_name,
        }

    return app


app = create_app()
