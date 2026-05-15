"""
FastAPI application factory.

Startup sequence
----------------
1. Ensure DB schema exists (SQLite + FTS5)            — sync, fast
2. Ensure Qdrant collection exists                    — sync, fast
3. Start watchdog observer for live updates           — sync, fast
4. Kick off initial index pass on watched_docs/       — BACKGROUND task
5. Pre-warm the ONNX embedder                         — BACKGROUND task

Steps 4 and 5 run in a background thread so uvicorn starts accepting
requests immediately. Index progress can be polled via /api/status.

The frontend is served as static files from /frontend → mounted at /.
"""
from __future__ import annotations
import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.config import FRONTEND_DIR, WATCHED_DOCS_DIR
from app.routes import search as search_router
from app.routes import index  as index_router
from app.routes import settings as settings_router
from app.services.fts import init_db
from app.services.qdrant_store import ensure_collection
from indexer.pipeline import index_all
from indexer.watcher import start_watcher, stop_worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

_observer = None   # watchdog Observer — kept alive for app lifetime
_bg_tasks: set[asyncio.Task] = set()


def _run_initial_index() -> None:
    """Run the full index pass; logged so users can see progress in the log."""
    try:
        t0 = time.perf_counter()
        indexed, skipped = index_all()
        dt = time.perf_counter() - t0
        logger.info("Startup index: %d indexed, %d skipped in %.2fs", indexed, skipped, dt)
    except Exception:
        logger.exception("Startup index failed")


def _prewarm_embedder() -> None:
    """Load the ONNX model into memory so the first search isn't slow."""
    try:
        from app.services.embedder import _get_model
        t0 = time.perf_counter()
        _get_model()
        logger.info("Embedder pre-warmed in %.2fs", time.perf_counter() - t0)
    except Exception:
        logger.exception("Embedder pre-warm failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _observer

    # ── Startup (fast path only) ─────────────────────────────────────────────
    logger.info("Initialising database …")
    init_db()

    logger.info("Connecting to Qdrant …")
    ensure_collection()

    WATCHED_DOCS_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("Starting file watcher …")
    _observer = start_watcher()

    # Schedule heavy work in background so server is ready immediately.
    loop = asyncio.get_running_loop()
    idx_task = loop.run_in_executor(None, _run_initial_index)
    warm_task = loop.run_in_executor(None, _prewarm_embedder)
    _bg_tasks.add(idx_task)
    _bg_tasks.add(warm_task)
    logger.info("Server ready. Initial index + embedder warm-up running in background.")

    yield   # app is running

    # ── Shutdown ─────────────────────────────────────────────────────────────
    if _observer:
        try:
            _observer.stop()
            _observer.join(timeout=3)
        except Exception:
            logger.exception("Error stopping watcher")
    try:
        stop_worker()
    except Exception:
        logger.exception("Error stopping index worker")
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
    app.include_router(settings_router.router, prefix="/api")

    # Serve the single-page frontend at /
    FRONTEND_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

    return app


app = create_app()
