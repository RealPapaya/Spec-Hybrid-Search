"""Pydantic request/response schemas for the DocSense API."""
from __future__ import annotations
from typing import Literal, List, Optional
from pydantic import BaseModel, Field


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


class SearchResponse(BaseModel):
    query:   str
    mode:    str
    total:   int
    results: List[SearchResult]


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
