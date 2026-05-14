"""
Hybrid search engine — BM25 + dense vector retrieval fused via RRF.

Supported modes
---------------
``keyword``
    BM25 only.  The entire indexed chunk corpus is loaded from SQLite into an
    in-memory :class:`~rank_bm25.BM25Okapi` index on every call.  This is
    acceptable for up to ~100 k chunks; for larger corpora consider a
    dedicated keyword index.
``semantic``
    Dense cosine-similarity search via Qdrant only.
``hybrid`` (default)
    Retrieves ``top_k * 3`` candidates from both BM25 and Qdrant, then
    applies **Reciprocal Rank Fusion** (RRF) to produce a single merged
    ranking::

        rrf_score(d) = α / (k + rank_BM25(d)) + β / (k + rank_semantic(d))

    where ``α`` and ``β`` are the configured weights, and ``k = 60`` (the
    standard RRF constant that penalises low-ranked items).
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from enum import Enum

import numpy as np
from rank_bm25 import BM25Okapi
from sqlalchemy.orm import Session

from docsense.config import get_settings
from docsense.database.models import Chunk, Document
from docsense.indexer.embedder import Embedder
from docsense.indexer.qdrant_store import QdrantStore, VectorSearchResult

logger = logging.getLogger(__name__)


class SearchMode(str, Enum):
    """Available search retrieval modes."""

    KEYWORD = "keyword"
    SEMANTIC = "semantic"
    HYBRID = "hybrid"


@dataclass
class SearchResult:
    """A single ranked search result with scoring breakdown."""

    chunk_id: str
    document_id: str
    text: str
    filename: str
    file_type: str
    section_title: str | None = None
    page_number: int | None = None

    # Scores — all normalised to [0, 1]
    fused_score: float = 0.0
    bm25_score: float = 0.0
    semantic_score: float = 0.0
    rrf_rank: int = 0


@dataclass
class SearchResponse:
    """Complete response returned by :meth:`HybridSearchEngine.search`."""

    query: str
    mode: SearchMode
    results: list[SearchResult] = field(default_factory=list)
    total_results: int = 0
    took_ms: float = 0.0


class HybridSearchEngine:
    """
    Combines BM25 keyword search and Qdrant dense vector search via RRF.

    Parameters
    ----------
    db_session:
        An open SQLAlchemy session used to load the BM25 corpus and look up
        chunk metadata.
    """

    # Standard RRF constant — controls how strongly rank position is penalised.
    RRF_K: int = 60

    def __init__(self, db_session: Session) -> None:
        self._settings = get_settings()
        self._db = db_session
        self._embedder = Embedder()
        self._qdrant = QdrantStore()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def search(
        self,
        query: str,
        mode: SearchMode = SearchMode.HYBRID,
        top_k: int | None = None,
        file_type_filter: str | None = None,
    ) -> SearchResponse:
        """
        Execute a search query.

        Parameters
        ----------
        query:
            The user's search string.
        mode:
            ``keyword``, ``semantic``, or ``hybrid``.
        top_k:
            Number of results to return.  Defaults to ``settings.top_k``.
        file_type_filter:
            Restrict results to a specific file type (e.g. ``".pdf"``).

        Returns
        -------
        SearchResponse
            Ordered list of :class:`SearchResult` objects with scores.
        """
        t0 = time.perf_counter()
        k = top_k if top_k is not None else self._settings.top_k

        if mode == SearchMode.KEYWORD:
            results = self._keyword_search(query, k, file_type_filter)
        elif mode == SearchMode.SEMANTIC:
            results = self._semantic_search(query, k, file_type_filter)
        else:
            results = self._hybrid_search(query, k, file_type_filter)

        elapsed = (time.perf_counter() - t0) * 1000

        return SearchResponse(
            query=query,
            mode=mode,
            results=results[:k],
            total_results=len(results),
            took_ms=round(elapsed, 2),
        )

    # ------------------------------------------------------------------
    # Keyword (BM25)
    # ------------------------------------------------------------------

    def _keyword_search(
        self,
        query: str,
        top_k: int,
        file_type_filter: str | None,
    ) -> list[SearchResult]:
        """BM25 retrieval over all indexed chunks in SQLite."""
        chunk_ids, texts, chunks_meta = self._load_corpus(file_type_filter)

        if not chunk_ids:
            return []

        tokenised = [self._tokenise(t) for t in texts]
        bm25 = BM25Okapi(tokenised)
        scores = bm25.get_scores(self._tokenise(query))

        top_indices = np.argsort(scores)[::-1][:top_k]
        max_score = float(scores[top_indices[0]]) if scores[top_indices[0]] > 0 else 1.0

        results: list[SearchResult] = []
        for rank, idx in enumerate(top_indices):
            if float(scores[idx]) <= 0:
                break
            meta = chunks_meta[idx]
            normalised = float(scores[idx]) / max_score
            results.append(SearchResult(
                chunk_id=chunk_ids[idx],
                document_id=meta["document_id"],
                text=texts[idx][:500],
                filename=meta["filename"],
                file_type=meta["file_type"],
                section_title=meta["section_title"],
                page_number=meta["page_number"],
                bm25_score=round(normalised, 4),
                fused_score=round(normalised, 4),
                rrf_rank=rank + 1,
            ))

        return results

    # ------------------------------------------------------------------
    # Semantic (dense)
    # ------------------------------------------------------------------

    def _semantic_search(
        self,
        query: str,
        top_k: int,
        file_type_filter: str | None,
    ) -> list[SearchResult]:
        """Dense cosine-similarity search via Qdrant."""
        qvec = self._embedder.embed_query(query)
        hits: list[VectorSearchResult] = self._qdrant.search(
            query_vector=qvec,
            top_k=top_k,
            file_type_filter=file_type_filter,
        )

        return [
            SearchResult(
                chunk_id=h.chunk_id,
                document_id=h.document_id,
                text=h.text[:500],
                filename=h.filename,
                file_type=h.file_type,
                section_title=h.section_title,
                page_number=h.page_number,
                semantic_score=round(h.score, 4),
                fused_score=round(h.score, 4),
                rrf_rank=rank + 1,
            )
            for rank, h in enumerate(hits)
        ]

    # ------------------------------------------------------------------
    # Hybrid (RRF)
    # ------------------------------------------------------------------

    def _hybrid_search(
        self,
        query: str,
        top_k: int,
        file_type_filter: str | None,
    ) -> list[SearchResult]:
        """
        Fuse BM25 and dense results via Reciprocal Rank Fusion.

        Fetches ``top_k * 3`` candidates from each retriever so the fusion
        pool is large enough to surface good results even when the two
        rankings disagree.
        """
        fetch_k = top_k * 3

        sem_results = self._semantic_search(query, fetch_k, file_type_filter)
        kw_results = self._keyword_search(query, fetch_k, file_type_filter)

        # Build lookup maps: chunk_id → SearchResult
        sem_map = {r.chunk_id: r for r in sem_results}
        kw_map = {r.chunk_id: r for r in kw_results}
        sem_rank = {r.chunk_id: i + 1 for i, r in enumerate(sem_results)}
        kw_rank = {r.chunk_id: i + 1 for i, r in enumerate(kw_results)}

        # Compute RRF score for every chunk seen in either list
        all_ids = set(sem_map) | set(kw_map)
        rrf: dict[str, float] = {}

        for cid in all_ids:
            score = 0.0
            if cid in sem_rank:
                score += self._settings.semantic_weight / (self.RRF_K + sem_rank[cid])
            if cid in kw_rank:
                score += self._settings.bm25_weight / (self.RRF_K + kw_rank[cid])
            rrf[cid] = score

        sorted_ids = sorted(rrf, key=lambda cid: rrf[cid], reverse=True)
        max_rrf = rrf[sorted_ids[0]] if sorted_ids else 1.0

        fused: list[SearchResult] = []
        for rank, cid in enumerate(sorted_ids[:top_k]):
            base = sem_map.get(cid) or kw_map[cid]
            normalised = rrf[cid] / max_rrf if max_rrf > 0 else 0.0
            fused.append(SearchResult(
                chunk_id=base.chunk_id,
                document_id=base.document_id,
                text=base.text,
                filename=base.filename,
                file_type=base.file_type,
                section_title=base.section_title,
                page_number=base.page_number,
                fused_score=round(normalised, 4),
                bm25_score=kw_map[cid].bm25_score if cid in kw_map else 0.0,
                semantic_score=sem_map[cid].semantic_score if cid in sem_map else 0.0,
                rrf_rank=rank + 1,
            ))

        return fused

    # ------------------------------------------------------------------
    # Corpus helpers
    # ------------------------------------------------------------------

    def _load_corpus(
        self, file_type_filter: str | None
    ) -> tuple[list[str], list[str], list[dict]]:
        """
        Load all indexed chunks from SQLite for BM25 indexing.

        Returns
        -------
        chunk_ids, texts, metadata_dicts
            Three parallel lists of the same length.
        """
        query = (
            self._db.query(Chunk, Document)
            .join(Document, Chunk.document_id == Document.id)
            .filter(Document.status == "indexed")
        )
        if file_type_filter:
            query = query.filter(Document.file_type == file_type_filter)

        rows = query.all()

        chunk_ids: list[str] = []
        texts: list[str] = []
        meta: list[dict] = []

        for chunk, doc in rows:
            chunk_ids.append(chunk.id)
            texts.append(chunk.text)
            meta.append({
                "document_id": doc.id,
                "filename": doc.filename,
                "file_type": doc.file_type,
                "section_title": chunk.section_title,
                "page_number": chunk.page_number,
            })

        logger.debug("BM25 corpus loaded: %d chunk(s).", len(chunk_ids))
        return chunk_ids, texts, meta

    @staticmethod
    def _tokenise(text: str) -> list[str]:
        """Lowercase alphabetic + numeric tokenisation for BM25."""
        return re.findall(r"\w+", text.lower())
