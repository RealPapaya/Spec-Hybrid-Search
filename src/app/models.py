"""Pydantic request/response schemas for the DocSense API."""
from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel


# ── Search ────────────────────────────────────────────────────────────────────

class SearchResult(BaseModel):
    doc_id:         str
    filename:       str
    filepath:       str
    chunk_text:     str
    page:           Optional[int] = None
    score:          float
    bm25_score:     float = 0.0
    semantic_score: float = 0.0
    mode:           str   # "vector" | "keyword" | "hybrid"

    # Occurrence metadata — populated only in occurrences view.
    chunk_index:    Optional[int]  = None
    match_position: Optional[int]  = None
    snippet:        Optional[str]  = None

    # Aggregated occurrence info — populated in documents view per chunk.
    match_positions:      List[int] = []
    occurrences_in_chunk: int       = 0


class SearchResponse(BaseModel):
    query:   str
    mode:    str
    total:   int                 # length of results in this response
    results: List[SearchResult]

    # Aggregated metadata; populated when the relevant view is used.
    view:              str   = "documents"   # "documents" | "occurrences"
    total_occurrences: int   = 0
    total_chunks:      int   = 0
    total_documents:   int   = 0
    capped:            bool  = False
    offset:            int   = 0
    limit:             Optional[int] = None
    took_ms:           float = 0.0


# ── Index ─────────────────────────────────────────────────────────────────────

class IndexResponse(BaseModel):
    status:         str   # "ok" | "error"
    files_indexed:  int
    files_skipped:  int
    message:        str   = ""


class StatusResponse(BaseModel):
    total_documents:   int
    total_chunks:      int
    collection_points: int
    watched_docs_dir:  str
