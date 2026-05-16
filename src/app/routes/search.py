"""
GET /api/search  — hybrid / vector / keyword search.

Query params
------------
q       : search query (required)
mode    : "hybrid" | "vector" | "keyword"  (default: hybrid)
limit   : optional result cap; omitted returns every exact term match
"""
from __future__ import annotations
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.models import SearchResponse, SearchResult
from app.config import RRF_K
from app.services.embedder import embed_query
from app.services.qdrant_store import search_vector, collection_point_count
from app.services.fts import search_fts

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Reciprocal Rank Fusion ────────────────────────────────────────────────────

def _rrf_fuse(
    vector_hits: List[dict],
    fts_hits:    List[dict],
    k: int = RRF_K,
    limit: Optional[int] = None,
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
    top = merged if limit is None else merged[:limit]

    # Normalise fused score: top result = 1.0
    max_rrf = top[0]["rrf"] if top else 1.0
    for r in top:
        r["score"] = round(r["rrf"] / max_rrf, 4)

    return top


def _query_terms(query: str) -> List[str]:
    return [t for t in query.split() if t]


def _keep_all_terms(hits: List[dict], terms: List[str]) -> List[dict]:
    """Only keep chunks whose visible text contains every query term."""
    folded_terms = [t.casefold() for t in terms]
    kept = []
    for hit in hits:
        text = hit.get("chunk_text", "").casefold()
        if all(term in text for term in folded_terms):
            kept.append(hit)
    return kept


# ── Route ─────────────────────────────────────────────────────────────────────

@router.get("/search", response_model=SearchResponse)
async def search(
    q:     str = Query(..., min_length=1, description="Search query"),
    mode:  str = Query("hybrid", description="hybrid | vector | keyword"),
    limit: Optional[int] = Query(None, ge=1),
):
    mode = mode.lower()
    if mode not in {"hybrid", "vector", "keyword"}:
        raise HTTPException(status_code=400, detail="mode must be hybrid, vector, or keyword")

    logger.info("Search: q=%r mode=%s limit=%s", q, mode, limit if limit is not None else "all")

    results: List[dict] = []

    try:
        terms = _query_terms(q)
        vector_limit = limit * 2 if limit is not None else collection_point_count()

        if mode in {"hybrid", "vector"}:
            vector_hits = search_vector(embed_query(q), limit=vector_limit) if vector_limit else []
            vector_hits = _keep_all_terms(vector_hits, terms)
        else:
            vector_hits = []

        if mode in {"hybrid", "keyword"}:
            fts_limit = limit * 2 if limit is not None else None
            fts_hits = _keep_all_terms(search_fts(q, limit=fts_limit), terms)
        else:
            fts_hits = []

        if mode == "hybrid":
            raw = _rrf_fuse(vector_hits, fts_hits, limit=limit)
            for r in raw:
                r.pop("rrf", None)
                r["mode"] = "hybrid"
            results = raw

        elif mode == "vector":
            vector_results = vector_hits if limit is None else vector_hits[:limit]
            for r in vector_results:
                r["mode"] = "vector"
            results = vector_results

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
            results = fts_hits if limit is None else fts_hits[:limit]

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
