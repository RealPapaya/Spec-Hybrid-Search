"""
Documents route — ``GET /docs``, ``GET /docs/{id}``, ``DELETE /docs/{id}``.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from docsense.api.schemas import ChunkSummary, DocumentDetail, DocumentSummary
from docsense.database.models import Chunk, Document
from docsense.database.session import get_db_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/docs", tags=["Documents"])


@router.get("", response_model=list[DocumentSummary], summary="List documents")
def list_documents(
    status: str | None = Query(None, description="Filter by status (indexed, error, …)"),
    file_type: str | None = Query(None, description="Filter by file type, e.g. .pdf"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db_session),
) -> list[DocumentSummary]:
    """Return a paginated list of all documents known to the index."""
    q = db.query(Document)
    if status:
        q = q.filter(Document.status == status)
    if file_type:
        q = q.filter(Document.file_type == file_type)

    docs = q.order_by(Document.updated_at.desc()).offset(offset).limit(limit).all()
    return [DocumentSummary.model_validate(d) for d in docs]


@router.get("/{document_id}", response_model=DocumentDetail, summary="Get document detail")
def get_document(
    document_id: str,
    db: Session = Depends(get_db_session),
) -> DocumentDetail:
    """Return full metadata and chunk list for a specific document."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found.")

    chunks = (
        db.query(Chunk)
        .filter(Chunk.document_id == document_id)
        .order_by(Chunk.chunk_index)
        .all()
    )

    return DocumentDetail(
        id=doc.id,
        filename=doc.filename,
        filepath=doc.filepath,
        file_type=doc.file_type,
        file_size=doc.file_size,
        status=doc.status,
        chunk_count=doc.chunk_count,
        page_count=doc.page_count,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        error_message=doc.error_message,
        chunks=[ChunkSummary.model_validate(c) for c in chunks],
    )


@router.delete("/{document_id}", summary="Delete document")
def delete_document(
    document_id: str,
    db: Session = Depends(get_db_session),
) -> dict:
    """Remove a document and all its chunks from both SQLite and Qdrant."""
    from docsense.indexer.qdrant_store import QdrantStore

    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found.")

    # Remove vectors from Qdrant (best-effort — don't fail the whole request)
    try:
        QdrantStore().delete_by_document_id(document_id)
    except Exception as exc:
        logger.warning("Qdrant deletion failed for %s: %s", document_id, exc)

    filename = doc.filename
    db.delete(doc)
    db.commit()

    return {"status": "deleted", "document_id": document_id, "filename": filename}
