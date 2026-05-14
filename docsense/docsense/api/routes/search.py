"""
Search route — ``GET /search`` and ``POST /search``.

Both endpoints delegate to :class:`~docsense.search.hybrid.HybridSearchEngine`
and return a :class:`~docsense.api.schemas.SearchResponse`.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from docsense.api.schemas import (
    SearchModeEnum,
    SearchRequest,
    SearchResponse,
    SearchResultItem,
)
from docsense.database.session import get_db_session
from docsense.search.hybrid import HybridSearchEngine, SearchMode

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/search", tags=["Search"])


def _run_search(request: SearchRequest, db: Session) -> SearchResponse:
    """Shared search logic used by both GET and POST handlers."""
    try:
        engine = HybridSearchEngine(db_session=db)
        mode_map = {
            SearchModeEnum.KEYWORD: SearchMode.KEYWORD,
            SearchModeEnum.SEMANTIC: SearchMode.SEMANTIC,
            SearchModeEnum.HYBRID: SearchMode.HYBRID,
        }
        resp = engine.search(
            query=request.query,
            mode=mode_map[request.mode],
            top_k=request.top_k,
            file_type_filter=request.file_type,
        )
        return SearchResponse(
            query=resp.query,
            mode=request.mode,
            results=[
                SearchResultItem(
                    chunk_id=r.chunk_id,
                    document_id=r.document_id,
                    text=r.text,
                    filename=r.filename,
                    file_type=r.file_type,
                    section_title=r.section_title,
                    page_number=r.page_number,
                    fused_score=r.fused_score,
                    bm25_score=r.bm25_score,
                    semantic_score=r.semantic_score,
                    rrf_rank=r.rrf_rank,
                )
                for r in resp.results
            ],
            total_results=resp.total_results,
            took_ms=resp.took_ms,
        )
    except Exception as exc:
        logger.error("Search failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Search error: {exc}") from exc


@router.post("", response_model=SearchResponse, summary="Search documents (POST)")
def search_post(
    request: SearchRequest,
    db: Session = Depends(get_db_session),
) -> SearchResponse:
    """
    Search indexed documents.

    Supports three modes:
    - **hybrid** (default) — RRF fusion of BM25 + cosine similarity
    - **keyword** — BM25 keyword ranking only
    - **semantic** — dense vector search only
    """
    return _run_search(request, db)


@router.get("", response_model=SearchResponse, summary="Search documents (GET)")
def search_get(
    q: str = Query(..., min_length=1, max_length=1000, description="Search query"),
    mode: SearchModeEnum = Query(SearchModeEnum.HYBRID, description="Retrieval mode"),
    top_k: int = Query(20, ge=1, le=100, description="Number of results"),
    file_type: str | None = Query(None, description="Filter by file type, e.g. .pdf"),
    db: Session = Depends(get_db_session),
) -> SearchResponse:
    """Browser/curl-friendly GET variant of the search endpoint."""
    return _run_search(
        SearchRequest(query=q, mode=mode, top_k=top_k, file_type=file_type),
        db,
    )
