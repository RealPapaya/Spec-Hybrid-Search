"""
POST /api/index           — trigger (re-)indexing of watched_docs/
GET  /api/status          — return index statistics
GET  /api/file/{doc_id}   — serve the original document (inline or download)
"""
from __future__ import annotations
import logging
import os
import sqlite3
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse

from app.models import IndexResponse, StatusResponse
from app.config import DB_PATH, WATCHED_DOCS_DIR
from app.services.fts import get_stats, get_all_documents
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


@router.get("/documents")
async def list_documents():
    """Return all indexed documents with metadata."""
    docs = get_all_documents()
    return {"documents": docs, "total": len(docs)}


# ── File serving ──────────────────────────────────────────────────────────────

_MIME = {
    ".pdf":  "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


@router.get("/file/{doc_id}")
async def serve_file(doc_id: str, download: int = Query(0)):
    """Return the original document for a given doc_id.

    The frontend uses this to open files in-browser (PDF inline) or as a
    download. The PDF inline view supports `#page=N` navigation, which the
    frontend appends client-side.
    """
    con = sqlite3.connect(str(DB_PATH))
    try:
        row = con.execute(
            "SELECT filepath, filename FROM documents WHERE doc_id = ?", (doc_id,)
        ).fetchone()
    finally:
        con.close()

    if not row:
        raise HTTPException(status_code=404, detail="doc_id not found")

    filepath, filename = row
    path = Path(filepath)
    if not path.is_file():
        raise HTTPException(status_code=410, detail="file no longer on disk")

    ext = path.suffix.lower()
    media_type = _MIME.get(ext, "application/octet-stream")
    disposition = "attachment" if download else "inline"

    return FileResponse(
        path=str(path),
        media_type=media_type,
        filename=filename,
        content_disposition_type=disposition,
    )


@router.post("/open/{doc_id}")
async def open_file_native(doc_id: str):
    """Open a non-PDF file with the OS default application via os.startfile()."""
    con = sqlite3.connect(str(DB_PATH))
    try:
        row = con.execute(
            "SELECT filepath FROM documents WHERE doc_id = ?", (doc_id,)
        ).fetchone()
    finally:
        con.close()

    if not row:
        raise HTTPException(status_code=404, detail="doc_id not found")

    path = Path(row[0])
    if not path.is_file():
        raise HTTPException(status_code=410, detail="file no longer on disk")

    os.startfile(str(path))
    return JSONResponse({"status": "ok"})
