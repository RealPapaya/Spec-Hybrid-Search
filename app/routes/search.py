"""
GET /api/search  — hybrid / vector / keyword search.

Query params
------------
q       : search query (required)
mode    : "hybrid" | "vector" | "keyword"  (default: hybrid)
limit   : 1-50  (default: 10)
"""
from __future__ import annotations
import logging
from typing import List

from fastapi import APIRouter, HTTPException, Query

from app.models import SearchResponse, SearchResult
from app.config import DEFAULT_SEARCH_LIMIT, RRF_K
from app.services.embedder import embed_query
from app.services.qdrant_store import search_vector
from app.services.fts import search_fts

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Reciprocal Rank Fusion ────────────────────────────────────────────────────

def _rrf_fuse(
    vector_hits: List[dict],
    fts_hits:    List[dict],
    k: int = RRF_K,
    limit: int = DEFAULT_SEARCH_LIMIT,
) -> List[dict]:
    """
    Combine two ranked lists with RRF.
    Also tracks per-component scores:
      semantic_score — cosine similarity from vector search (0–1)
      bm25_score     — normalised BM25 from FTS5 (0–1)
      score          — RRF fused, normalised so top result = 1.0
    """
    scores: dict[str, dict] = {}

    def _key(hit: dict) -> str:
        return f"{hit['doc_id']}::{hit.get('chunk_text', '')[:60]}"

    for rank, hit in enumerate(vector_hits):
        key = _key(hit)
        scores.setdefault(key, {**hit, "rrf": 0.0, "semantic_score": 0.0, "bm25_score": 0.0})
        scores[key]["rrf"] += 1.0 / (k + rank)
        scores[key]["semantic_score"] = round(float(hit.get("score", 0.0)), 4)

    # Normalise FTS5 rank (negative BM25) to 0–1 range before fusing.
    # Most-negative rank = best match.  best=1.0, worst=0.0.
    if fts_hits:
        best_abs  = abs(fts_hits[0].get("rank",  -1)) or 1.0
        worst_abs = abs(fts_hits[-1].get("rank", -1)) or 1.0
        span      = best_abs - worst_abs
        for rank, hit in enumerate(fts_hits):
            key = _key(hit)
            bm25_norm = round((abs(hit.get("rank", 0)) - worst_abs) / span, 4) if span else 1.0
            if key not in scores:
                scores[key] = {**hit, "rrf": 0.0, "semantic_score": 0.0, "bm25_score": 0.0}
            scores[key]["rrf"] += 1.0 / (k + rank)
            scores[key]["bm25_score"] = bm25_norm

    merged = sorted(scores.values(), key=lambda x: x["rrf"], reverse=True)
    top = merged[:limit]

    # Normalise fused score: top result = 1.0
    max_rrf = top[0]["rrf"] if top else 1.0
    for r in top:
        r["score"] = round(r["rrf"] / max_rrf, 4)

    return top


# ── Route ─────────────────────────────────────────────────────────────────────

@router.get("/search", response_model=SearchResponse)
async def search(
    q:     str = Query(..., min_length=1, description="Search query"),
    mode:  str = Query("hybrid", description="hybrid | vector | keyword"),
    limit: int = Query(DEFAULT_SEARCH_LIMIT, ge=1, le=50),
):
    mode = mode.lower()
    if mode not in {"hybrid", "vector", "keyword"}:
        raise HTTPException(status_code=400, detail="mode must be hybrid, vector, or keyword")

    logger.info("Search: q=%r mode=%s limit=%d", q, mode, limit)

    results: List[dict] = []

    try:
        if mode in {"hybrid", "vector"}:
            vec = embed_query(q)
            vector_hits = search_vector(vec, limit=limit * 2)
        else:
            vector_hits = []

        if mode in {"hybrid", "keyword"}:
            fts_hits = search_fts(q, limit=limit * 2)
            # Normalise fts field name
            for h in fts_hits:
                h.setdefault("chunk_text", h.pop("chunk_text", ""))
        else:
            fts_hits = []

        if mode == "hybrid":
            raw = _rrf_fuse(vector_hits, fts_hits, limit=limit)
            for r in raw:
                r["score"] = round(r.pop("rrf"), 4)
                r["mode"]  = "hybrid"
            results = raw

        elif mode == "vector":
            for r in vector_hits[:limit]:
                r["mode"] = "vector"
            results = vector_hits[:limit]

        else:  # keyword
            # FTS5 rank is negative BM25; most-negative = best.
            # Normalise so best result = 1.0, worst = 0.0.
            # If only one result (or all same), give it 1.0.
            if fts_hits:
                best_abs  = abs(fts_hits[0].get("rank",  -1)) or 1.0
                worst_abs = abs(fts_hits[-1].get("rank", -1)) or 1.0
                span      = best_abs - worst_abs
                for r in fts_hits:
                    bm25 = round((abs(r.get("rank", 0)) - worst_abs) / span, 4) if span else 1.0
                    r["score"]      = bm25
                    r["bm25_score"] = bm25
                    r["mode"]       = "keyword"
            results = fts_hits[:limit]

    except Exception as exc:
        logger.exception("Search error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    return SearchResponse(
        query=q,
        mode=mode,
        total=len(results),
        results=[
            SearchResult(
                doc_id=r.get("doc_id", ""),
                filename=r.get("filename", ""),
                filepath=r.get("filepath", ""),
                chunk_text=r.get("chunk_text", ""),
                page=r.get("page"),
                score=r.get("score", 0.0),
                bm25_score=r.get("bm25_score", 0.0),
                semantic_score=r.get("semantic_score", 0.0),
                mode=r.get("mode", mode),
            )
            for r in results
        ],
    )
