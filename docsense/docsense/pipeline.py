"""
Ingestion pipeline orchestration.

``process_file()`` is the single entry point for the full
parse → chunk → embed → index flow.  It is called by:
- The file watcher daemon (on create/modify events).
- The ``POST /admin/ingest`` and ``POST /admin/reindex`` API endpoints
  (via FastAPI ``BackgroundTasks``).

Key design principles
---------------------
- **Idempotent** — if the file hash has not changed since the last successful
  index, the function returns immediately without re-processing.
- **Atomic** — the SQLite document record transitions through
  ``pending → processing → indexed`` (or ``error``).  A crash mid-way leaves
  the status as ``processing``; the watcher will retry on the next restart.
- **Never raises** — all exceptions are caught, logged, and reflected in the
  ``error_message`` column.  The caller (watcher) must not crash.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path

from docsense.chunking import ChunkingEngine
from docsense.config import get_settings
from docsense.database.models import Chunk, Document
from docsense.database.session import get_session
from docsense.indexer.embedder import Embedder
from docsense.indexer.qdrant_store import QdrantStore

# Import parsers — side-effect registers them with the ParserRegistry
from docsense.parsers import parse_file  # noqa: F401 (triggers __init__ registrations)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def process_file(filepath: Path) -> str | None:
    """
    Run the full ingestion pipeline for a single file.

    Parameters
    ----------
    filepath:
        Path to the document to process.

    Returns
    -------
    str | None
        The ``Document.id`` on success, or ``None`` on failure.
    """
    filepath = Path(filepath).resolve()
    logger.info("Processing: %s", filepath.name)

    try:
        return _process(filepath)
    except Exception as exc:
        logger.error("Unhandled pipeline error for %s: %s", filepath.name, exc, exc_info=True)
        _mark_error(str(filepath), str(exc))
        return None


def remove_document(filepath: Path) -> None:
    """
    Remove a document from both Qdrant and SQLite when its file is deleted.

    Parameters
    ----------
    filepath:
        Path of the deleted file.
    """
    filepath = Path(filepath).resolve()
    logger.info("Removing from index: %s", filepath.name)

    try:
        with get_session() as session:
            doc = session.query(Document).filter(
                Document.filepath == str(filepath)
            ).first()

            if doc is None:
                logger.debug("File not in index, nothing to remove: %s", filepath)
                return

            # Remove vectors first (best-effort)
            try:
                QdrantStore().delete_by_document_id(doc.id)
            except Exception as exc:
                logger.warning("Qdrant deletion failed for %s: %s", filepath.name, exc)

            session.delete(doc)  # cascades to chunks

        logger.info("Removed from index: %s", filepath.name)

    except Exception as exc:
        logger.error("Failed to remove %s: %s", filepath.name, exc, exc_info=True)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _process(filepath: Path) -> str | None:
    """Core pipeline — called inside a try/except by ``process_file``."""
    settings = get_settings()
    file_hash = _sha256(filepath)
    file_size = filepath.stat().st_size

    # ── Step 1: Check whether re-indexing is needed ───────────────────────
    with get_session() as session:
        existing: Document | None = session.query(Document).filter(
            Document.filepath == str(filepath)
        ).first()

        if existing and existing.file_hash == file_hash and existing.status == "indexed":
            logger.info("Skipping unchanged file: %s", filepath.name)
            return existing.id

        # Create or update the document record
        if existing:
            doc = existing
            doc.status = "processing"
            doc.file_hash = file_hash
            doc.file_size = file_size
            doc.updated_at = datetime.now(timezone.utc)
            doc.error_message = None

            # Purge stale vectors and chunks
            try:
                QdrantStore().delete_by_document_id(doc.id)
            except Exception as exc:
                logger.warning("Could not delete old vectors for %s: %s", filepath.name, exc)

            session.query(Chunk).filter(Chunk.document_id == doc.id).delete()
        else:
            doc = Document(
                filename=filepath.name,
                filepath=str(filepath),
                file_type=filepath.suffix.lower(),
                file_size=file_size,
                file_hash=file_hash,
                status="processing",
            )
            session.add(doc)

        session.flush()
        document_id: str = doc.id

    # ── Step 2: Parse ─────────────────────────────────────────────────────
    parsed = parse_file(filepath)

    if parsed.error:
        _mark_error(document_id, parsed.error)
        return None

    if parsed.is_empty:
        _mark_error(document_id, "No text content extracted from file.")
        return None

    # ── Step 3: Chunk ─────────────────────────────────────────────────────
    text_chunks = ChunkingEngine().chunk_document(parsed)

    if not text_chunks:
        _mark_error(document_id, "Chunking produced no output.")
        return None

    # ── Step 4: Embed ─────────────────────────────────────────────────────
    embedder = Embedder()
    vectors = embedder.embed_texts([c.text for c in text_chunks])

    # ── Step 5: Write chunks to SQLite and upsert vectors to Qdrant ───────
    with get_session() as session:
        chunk_ids: list[str] = []
        payloads: list[dict] = []
        db_chunks: list[Chunk] = []

        for tc in text_chunks:
            chunk = Chunk(
                document_id=document_id,
                chunk_index=tc.chunk_index,
                text=tc.text,
                token_count=tc.token_count,
                page_number=tc.page_number,
                section_title=tc.section_title,
                start_char=tc.start_char,
                end_char=tc.end_char,
            )
            session.add(chunk)
            session.flush()  # populate chunk.id

            chunk_ids.append(chunk.id)
            payloads.append({
                "document_id": document_id,
                "filename": filepath.name,
                "file_type": filepath.suffix.lower(),
                "text": tc.text,
                "section_title": tc.section_title,
                "page_number": tc.page_number,
                "chunk_index": tc.chunk_index,
            })
            db_chunks.append(chunk)

        # Upsert to Qdrant
        point_ids = QdrantStore().upsert_chunks(chunk_ids, vectors, payloads)

        # Record Qdrant point IDs back onto the chunk rows
        for chunk, pid in zip(db_chunks, point_ids):
            chunk.qdrant_point_id = pid

        # Finalise the document record
        doc = session.query(Document).filter(Document.id == document_id).first()
        doc.status = "indexed"
        doc.chunk_count = len(text_chunks)
        doc.page_count = parsed.page_count
        doc.updated_at = datetime.now(timezone.utc)

    logger.info(
        "✓ Indexed %s → %d chunk(s) / %d vector(s).",
        filepath.name,
        len(text_chunks),
        vectors.shape[0],
    )
    return document_id


def _mark_error(document_id_or_path: str, message: str) -> None:
    """Set a document's status to ``error`` and record the error message."""
    try:
        with get_session() as session:
            doc = session.query(Document).filter(
                (Document.id == document_id_or_path)
                | (Document.filepath == document_id_or_path)
            ).first()
            if doc:
                doc.status = "error"
                doc.error_message = message
                doc.updated_at = datetime.now(timezone.utc)
                logger.warning("Document error [%s]: %s", doc.filename, message)
    except Exception as exc:
        logger.error("Failed to mark document error: %s", exc)


def _sha256(filepath: Path) -> str:
    """Compute the SHA-256 hex digest of a file (streaming, memory-safe)."""
    h = hashlib.sha256()
    with open(filepath, "rb") as fh:
        for block in iter(lambda: fh.read(65536), b""):
            h.update(block)
    return h.hexdigest()
