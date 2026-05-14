"""
Pydantic request / response schemas for the DocSense REST API.

Keeping schemas in a dedicated module makes them easy to import from any
route module and ensures a single source of truth for the OpenAPI spec.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class SearchModeEnum(str, Enum):
    """Search retrieval mode."""

    KEYWORD = "keyword"
    SEMANTIC = "semantic"
    HYBRID = "hybrid"


class DocumentStatusEnum(str, Enum):
    """Document ingestion lifecycle status."""

    PENDING = "pending"
    PROCESSING = "processing"
    INDEXED = "indexed"
    ERROR = "error"


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

class SearchRequest(BaseModel):
    """Body for ``POST /search``."""

    query: str = Field(..., min_length=1, max_length=1000, description="Search query text")
    mode: SearchModeEnum = Field(SearchModeEnum.HYBRID, description="Retrieval mode")
    top_k: int = Field(20, ge=1, le=100, description="Number of results to return")
    file_type: str | None = Field(None, description="Restrict to file type, e.g. '.pdf'")


class SearchResultItem(BaseModel):
    """A single item in the search result list."""

    chunk_id: str
    document_id: str
    text: str
    filename: str
    file_type: str
    section_title: str | None = None
    page_number: int | None = None
    fused_score: float
    bm25_score: float
    semantic_score: float
    rrf_rank: int


class SearchResponse(BaseModel):
    """Response body for ``GET /search`` and ``POST /search``."""

    query: str
    mode: SearchModeEnum
    results: list[SearchResultItem]
    total_results: int
    took_ms: float


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

class ChunkSummary(BaseModel):
    """Chunk summary embedded in :class:`DocumentDetail`."""

    id: str
    chunk_index: int
    text: str
    token_count: int
    page_number: int | None = None
    section_title: str | None = None

    model_config = {"from_attributes": True}


class DocumentSummary(BaseModel):
    """Lightweight document representation for list views."""

    id: str
    filename: str
    filepath: str
    file_type: str
    file_size: int
    status: DocumentStatusEnum
    chunk_count: int
    page_count: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentDetail(DocumentSummary):
    """Full document view including error info and chunk list."""

    error_message: str | None = None
    chunks: list[ChunkSummary] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

class IndexStats(BaseModel):
    """System-wide index statistics returned by ``GET /admin/stats``."""

    total_documents: int
    indexed_documents: int
    error_documents: int
    total_chunks: int
    qdrant_points: int
    qdrant_collection: str
    qdrant_status: str


class IngestRequest(BaseModel):
    """Body for ``POST /admin/ingest``."""

    filepath: str = Field(..., description="Absolute path to the file to ingest")


class IngestResponse(BaseModel):
    """Response after queuing a manual ingestion request."""

    document_id: str
    filename: str
    status: str
    message: str
