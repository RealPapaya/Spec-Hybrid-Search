"""
Indexing pipeline: file → extract → embed → store (Qdrant + SQLite/FTS5).

Each file gets a stable doc_id derived from its absolute path so that
re-indexing cleanly replaces the old vectors and metadata.
"""
from __future__ import annotations
import hashlib
import logging
from pathlib import Path
from typing import Tuple

from app.config import WATCHED_DOCS_DIR
from indexer.extractor import extract, SUPPORTED_EXTENSIONS
from app.services.embedder import embed
from app.services import qdrant_store as qs
from app.services.fts import (
    upsert_document,
    insert_chunks,
    delete_document,
    get_document_by_path,
)

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _doc_id(filepath: str) -> str:
    """Stable 16-char hex ID derived from the absolute file path."""
    return hashlib.sha256(filepath.encode()).hexdigest()[:16]


# ── Core indexing function ────────────────────────────────────────────────────

def index_file(path: Path) -> Tuple[bool, str]:
    """
    Index a single file.

    Returns
    -------
    (True,  "indexed")   — file was (re-)indexed successfully
    (False, "skipped")   — unchanged since last index
    (False, "error:<msg>") — extraction or storage failed
    """
    path = path.resolve()
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        return False, "unsupported"

    filepath = str(path)
    doc_id   = _doc_id(filepath)

    # Skip if already indexed and unmodified
    existing = get_document_by_path(filepath)
    if existing:
        try:
            mtime = path.stat().st_mtime
            if abs(existing["modified_at"] - mtime) < 1.0:
                logger.debug("Skipping (unchanged): %s", path.name)
                return False, "skipped"
        except OSError:
            pass

    logger.info("Indexing: %s", path.name)
    try:
        stat   = path.stat()
        chunks = extract(path)
        if not chunks:
            logger.warning("No content extracted from %s", path.name)
            return False, "empty"

        # Annotate each chunk with file metadata (stored in Qdrant payload)
        for chunk in chunks:
            chunk["filename"] = path.name
            chunk["filepath"] = filepath

        texts     = [c["text"] for c in chunks]
        vectors   = embed(texts)

        # Atomically replace old data
        delete_document(doc_id)          # SQLite (cascade → chunks → FTS)
        qs.delete_doc(doc_id)            # Qdrant

        upsert_document(
            doc_id=doc_id,
            filepath=filepath,
            filename=path.name,
            file_size=stat.st_size,
            modified_at=stat.st_mtime,
        )
        insert_chunks(doc_id, chunks)
        qs.upsert_chunks(doc_id, chunks, vectors)

        logger.info("Indexed %s — %d chunks", path.name, len(chunks))
        return True, "indexed"

    except Exception as exc:
        logger.exception("Failed to index %s: %s", path.name, exc)
        return False, f"error:{exc}"


def index_all(directory: Path | None = None) -> Tuple[int, int]:
    """
    Index all supported documents in *directory* (default: WATCHED_DOCS_DIR).

    Returns (files_indexed, files_skipped).
    """
    directory = Path(directory or WATCHED_DOCS_DIR)
    indexed = skipped = 0
    for path in sorted(directory.rglob("*")):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
            ok, reason = index_file(path)
            if ok:
                indexed += 1
            else:
                skipped += 1
    return indexed, skipped
