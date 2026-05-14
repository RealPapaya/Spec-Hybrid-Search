"""
DocSense FastAPI application entry point.

Creates the ``app`` instance, registers all routers, and wires up
startup/shutdown lifecycle hooks.  Run with::

    uvicorn docsense.api.main:app --host 0.0.0.0 --port 8000

Or use the ``docsense`` CLI entry-point defined in ``pyproject.toml``.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from docsense.config import get_settings

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Construct and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="DocSense",
        description=(
            "Local enterprise document hybrid search API.  "
            "Combines BM25 keyword matching with dense vector similarity "
            "using Reciprocal Rank Fusion (RRF)."
        ),
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Allow all origins for local use.  Tighten this for network deployments.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Register routers ──────────────────────────────────────────────
    from docsense.api.routes.admin import router as admin_router
    from docsense.api.routes.documents import router as docs_router
    from docsense.api.routes.search import router as search_router

    app.include_router(search_router)
    app.include_router(docs_router)
    app.include_router(admin_router)

    # ── Lifecycle hooks ───────────────────────────────────────────────
    @app.on_event("startup")
    async def _startup() -> None:
        logging.basicConfig(
            level=getattr(logging, settings.log_level.upper(), logging.INFO),
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        )
        from docsense.database.session import init_db
        init_db()
        logger.info("DocSense API started — DB: %s", settings.sqlite_url)
        logger.info("Watch directory: %s", settings.watch_dir)

    # ── Root redirect ─────────────────────────────────────────────────
    @app.get("/", include_in_schema=False)
    def _root() -> dict:
        return {
            "service": "DocSense",
            "version": "0.1.0",
            "swagger_ui": "/docs",
            "health": "/admin/health",
        }

    return app


# Module-level app instance (picked up by uvicorn)
app = create_app()


def run() -> None:
    """Entry point for the ``docsense`` CLI command."""
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "docsense.api.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    run()
