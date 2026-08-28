"""Application factory and public process health endpoint."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api.auth import router as auth_router
from .api.auth import user_router
from .api.catalog import router as catalog_router
from .api.dashboard import router as dashboard_router
from .api.exports import router as exports_router
from .api.imports import router as imports_router
from .api.mail import router as mail_router
from .api.reviews import router as reviews_router
from .api.risk import router as risk_router
from .api.system import router as system_router
from .config import get_settings
from .db.session import create_engine
from .system.scheduler import MailSyncScheduler


def create_app() -> FastAPI:
    """Create the FastAPI application with its minimal public endpoint."""

    settings = get_settings()

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        scheduler = MailSyncScheduler(_app.state.db_engine, settings)
        task = asyncio.create_task(scheduler.run())
        yield
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    app = FastAPI(title=settings.service_name, lifespan=lifespan)
    app.state.settings = settings
    app.state.db_engine = create_engine(settings.database_url)
    app.include_router(auth_router)
    app.include_router(user_router)
    app.include_router(imports_router)
    app.include_router(exports_router)
    app.include_router(mail_router)
    app.include_router(dashboard_router)
    app.include_router(reviews_router)
    app.include_router(catalog_router)
    app.include_router(risk_router)
    app.include_router(system_router)

    @app.get("/health/live", tags=["health"])
    def health_live() -> dict[str, str]:
        """Return a stable, non-sensitive liveness response."""

        return {
            "status": "ok",
            "service": settings.service_name,
        }

    return app


app = create_app()
