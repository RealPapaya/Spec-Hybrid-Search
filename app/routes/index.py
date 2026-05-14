"""
POST /api/index  — trigger (re-)indexing of watched_docs/
GET  /api/status — return index statistics
"""
from __future__ import annotations
import logging

from fastapi import APIRouter, BackgroundTasks

from app.models import IndexResponse, StatusResponse
from app.config import WATCHED_DOCS_DIR
from app.services.fts import get_stats
from app.services.qdrant_store import collection_point_count
from indexer.pipeline import index_all

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/index", response_model=IndexResponse)
async def trigger_index(background_tasks: BackgroundTasks):
    """
    Kick off a background re-index of everything in watched_docs/.
    Returns immediately; indexing runs asynchronously.
    """
    def _run():
        indexed, skipped = index_all()
        logger.info("Background index complete: %d indexed, %d skipped", indexed, skipped)

    background_tasks.add_task(_run)
    return IndexResponse(
        status="ok",
        files_indexed=0,
        files_skipped=0,
        message="Indexing started in background. Check /api/status for progress.",
    )


@router.get("/status", response_model=StatusResponse)
async def get_status():
    """Return current index statistics."""
    stats = get_stats()
    return StatusResponse(
        total_documents=stats["total_documents"],
        total_chunks=stats["total_chunks"],
        collection_points=collection_point_count(),
        watched_docs_dir=str(WATCHED_DOCS_DIR),
    )
