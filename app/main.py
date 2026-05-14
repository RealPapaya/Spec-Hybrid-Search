"""
FastAPI application factory.

Startup sequence
----------------
1. Ensure DB schema exists (SQLite + FTS5)
2. Ensure Qdrant collection exists
3. Run an initial index pass over watched_docs/
4. Start watchdog observer for live updates

The frontend is served as static files from /frontend → mounted at /.
"""
from __future__ import annotations
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.config import FRONTEND_DIR, WATCHED_DOCS_DIR
from app.routes import search as search_router
from app.routes import index  as index_router
from app.services.fts import init_db
from app.services.qdrant_store import ensure_collection
from indexer.pipeline import index_all
from indexer.watcher import start_watcher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

_observer = None   # watchdog Observer — kept alive for app lifetime


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _observer

    # ── Startup ──────────────────────────────────────────────────────────────
    logger.info("Initialising database …")
    init_db()

    logger.info("Connecting to Qdrant …")
    ensure_collection()

    logger.info("Initial index pass on %s …", WATCHED_DOCS_DIR)
    WATCHED_DOCS_DIR.mkdir(parents=True, exist_ok=True)
    indexed, skipped = index_all()
    logger.info("Startup index: %d indexed, %d skipped", indexed, skipped)

    logger.info("Starting file watcher …")
    _observer = start_watcher()

    yield   # app is running

    # ── Shutdown ─────────────────────────────────────────────────────────────
    if _observer:
        _observer.stop()
        _observer.join()
    logger.info("Shutdown complete.")


def create_app() -> FastAPI:
    app = FastAPI(
        title="DocSense",
        description="Local document search — PDF, DOCX, XLSX, PPTX",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API routes
    app.include_router(search_router.router, prefix="/api")
    app.include_router(index_router.router,  prefix="/api")

    # Serve the single-page frontend at /
    FRONTEND_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

    return app


app = create_app()
