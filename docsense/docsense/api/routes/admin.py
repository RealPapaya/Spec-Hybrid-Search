"""
Admin route — ``GET /admin/stats``, ``POST /admin/ingest``,
``POST /admin/reindex``, ``GET /admin/health``.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from docsense.api.schemas import IndexStats, IngestRequest, IngestResponse
from docsense.config import get_settings
from docsense.database.models import Chunk, Document
from docsense.database.session import get_db_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/health", summary="Health check")
def health_check() -> dict:
    """Return a simple liveness signal."""
    return {"status": "ok", "service": "docsense", "version": "0.1.0"}


@router.get("/stats", response_model=IndexStats, summary="Index statistics")
def get_stats(db: Session = Depends(get_db_session)) -> IndexStats:
    """Return document/chunk counts and Qdrant collection status."""
    from docsense.indexer.qdrant_store import QdrantStore

    total = db.query(Document).count()
    indexed = db.query(Document).filter(Document.status == "indexed").count()
    errors = db.query(Document).filter(Document.status == "error").count()
    chunks = db.query(Chunk).count()

    try:
        info = QdrantStore().get_collection_info()
    except Exception as exc:
        logger.warning("Could not reach Qdrant: %s", exc)
        info = {"points_count": 0, "name": "unavailable", "status": "unreachable"}

    return IndexStats(
        total_documents=total,
        indexed_documents=indexed,
        error_documents=errors,
        total_chunks=chunks,
        qdrant_points=info.get("points_count", 0),
        qdrant_collection=info.get("name", ""),
        qdrant_status=info.get("status", "unknown"),
    )


@router.post("/ingest", response_model=IngestResponse, summary="Manually ingest a file")
def ingest_file(
    request: IngestRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db_session),
) -> IngestResponse:
    """
    Queue a specific file for ingestion.

    The file is processed in a background task so the request returns
    immediately.  Poll ``GET /docs`` or ``GET /admin/stats`` to monitor
    progress.
    """
    from docsense.pipeline import process_file

    filepath = Path(request.filepath)

    if not filepath.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {filepath}")

    settings = get_settings()
    if filepath.suffix.lower() not in settings.supported_extensions:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type '{filepath.suffix}'. "
                f"Supported: {sorted(settings.supported_extensions)}"
            ),
        )

    existing = db.query(Document).filter(Document.filepath == str(filepath)).first()

    background_tasks.add_task(process_file, filepath)

    if existing:
        return IngestResponse(
            document_id=existing.id,
            filename=existing.filename,
            status="reprocessing",
            message=f"File re-queued for indexing: {filepath.name}",
        )

    return IngestResponse(
        document_id="pending",
        filename=filepath.name,
        status="queued",
        message=f"File queued for indexing: {filepath.name}",
    )


@router.post("/reindex", summary="Re-index all documents")
def reindex_all(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db_session),
) -> dict:
    """Trigger a full re-index of every known document."""
    from docsense.pipeline import process_file

    docs = db.query(Document).all()
    queued = 0
    for doc in docs:
        p = Path(doc.filepath)
        if p.exists():
            background_tasks.add_task(process_file, p)
            queued += 1

    return {"status": "reindex_started", "documents_queued": queued}
