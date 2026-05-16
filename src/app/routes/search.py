"""
GET /api/search  — hybrid / vector / keyword search.

Query params
------------
q          : search query (required)
mode       : "hybrid" | "vector" | "keyword"   (default: hybrid)
view       : "documents" | "occurrences"       (default: documents)
whole_word : bool                              (default: false)
limit      : optional result cap; documents view returns every match when omitted,
             occurrences view defaults to 200 per page
offset     : pagination offset (occurrences view only)
"""
from __future__ import annotations
import logging
import re
import time
from typing import Iterable, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Query

from app.models import SearchResponse, SearchResult
from app.config import RRF_K
from app.services.embedder import embed_query
from app.services.qdrant_store import search_vector, collection_point_count
from app.services.fts import search_fts

router = APIRouter()
logger = logging.getLogger(__name__)


# Hard ceiling on occurrences view to keep payloads bounded.
OCCURRENCES_HARD_CAP = 5000
# Default per-page size when the client doesn't send `limit` in occurrences view.
OCCURRENCES_DEFAULT_LIMIT = 200
# Half-window (chars) of context built around each occurrence.
SNIPPET_HALF_WINDOW = 120


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


def _find_positions(text: str, term: str, whole_word: bool) -> List[int]:
    """Return every match offset of *term* in *text* (case-insensitive).

    Whole-word mode uses regex `\\bterm\\b`. Substring mode does a casefold
    scan with `str.find` which is O(n) in C.
    """
    if not text or not term:
        return []
    if whole_word:
        pattern = re.compile(r"\b" + re.escape(term) + r"\b", re.IGNORECASE)
        return [m.start() for m in pattern.finditer(text)]
    # Substring (Ctrl+F semantics): case-insensitive, overlapping disallowed.
    needle = term.casefold()
    hay    = text.casefold()
    n      = len(needle)
    out: List[int] = []
    pos    = hay.find(needle)
    while pos != -1:
        out.append(pos)
        pos = hay.find(needle, pos + n)
    return out


def _keep_all_terms(hits: List[dict], terms: List[str], whole_word: bool) -> List[dict]:
    """Only keep chunks whose visible text contains every query term.

    In whole-word mode each term must be present as a standalone token.
    """
    if not terms:
        return hits
    if whole_word:
        patterns = [re.compile(r"\b" + re.escape(t) + r"\b", re.IGNORECASE) for t in terms]
        return [h for h in hits if all(p.search(h.get("chunk_text", "")) for p in patterns)]
    folded = [t.casefold() for t in terms]
    return [
        h for h in hits
        if all(f in h.get("chunk_text", "").casefold() for f in folded)
    ]


def _annotate_match_positions(hits: List[dict], terms: List[str], whole_word: bool) -> None:
    """Attach match_positions + occurrences_in_chunk to each hit in place."""
    for hit in hits:
        text = hit.get("chunk_text", "")
        positions: List[int] = []
        for term in terms:
            positions.extend(_find_positions(text, term, whole_word))
        positions.sort()
        hit["match_positions"]      = positions
        hit["occurrences_in_chunk"] = len(positions)


def _build_snippet(text: str, pos: int, term_len: int) -> str:
    start = max(0, pos - SNIPPET_HALF_WINDOW)
    end   = min(len(text), pos + term_len + SNIPPET_HALF_WINDOW)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return prefix + text[start:end] + suffix


def _iter_occurrences(
    candidate_chunks: Iterable[dict],
    terms: List[str],
    whole_word: bool,
    hard_cap: int,
) -> Tuple[List[dict], bool]:
    """Explode candidate chunks into one record per term occurrence.

    Returns (records, capped). Records are sorted by (filepath, chunk_index,
    match_position). The first match wins when several query terms overlap at
    the same offset (rare; AND semantics already require all terms present).
    """
    records: List[dict] = []
    capped = False
    # Sort upstream so document-order traversal is stable.
    for chunk in sorted(
        candidate_chunks,
        key=lambda c: (c.get("filepath", ""), c.get("chunk_index", 0)),
    ):
        text = chunk.get("chunk_text", "")
        if not text:
            continue
        # Collect (position, term) tuples for all terms, then sort by position.
        spans: List[Tuple[int, str]] = []
        for term in terms:
            for pos in _find_positions(text, term, whole_word):
                spans.append((pos, term))
        spans.sort(key=lambda s: s[0])
        for pos, term in spans:
            if len(records) >= hard_cap:
                capped = True
                return records, capped
            records.append({
                **chunk,
                "match_position": pos,
                "snippet": _build_snippet(text, pos, len(term)),
            })
    return records, capped


# ── Route ─────────────────────────────────────────────────────────────────────

@router.get("/search", response_model=SearchResponse)
async def search(
    q:          str           = Query(..., min_length=1, description="Search query"),
    mode:       str           = Query("hybrid", description="hybrid | vector | keyword"),
    view:       str           = Query("documents", description="documents | occurrences"),
    whole_word: bool          = Query(False, description="Match whole words only"),
    limit:      Optional[int] = Query(None, ge=1),
    offset:     int           = Query(0, ge=0),
):
    mode = mode.lower()
    view = view.lower()
    if mode not in {"hybrid", "vector", "keyword"}:
        raise HTTPException(status_code=400, detail="mode must be hybrid, vector, or keyword")
    if view not in {"documents", "occurrences"}:
        raise HTTPException(status_code=400, detail="view must be documents or occurrences")

    logger.info(
        "Search: q=%r mode=%s view=%s whole_word=%s limit=%s offset=%s",
        q, mode, view, whole_word, limit if limit is not None else "all", offset,
    )

    t0 = time.perf_counter()
    terms = _query_terms(q)

    try:
        if view == "occurrences":
            return _run_occurrences(q, terms, whole_word, limit, offset, t0)
        return _run_documents(q, mode, terms, whole_word, limit, t0)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Search error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Documents view: existing hybrid/vector/keyword pipeline + position tags ──

def _run_documents(
    q: str,
    mode: str,
    terms: List[str],
    whole_word: bool,
    limit: Optional[int],
    t0: float,
) -> SearchResponse:
    vector_limit = limit * 2 if limit is not None else collection_point_count()

    if mode in {"hybrid", "vector"}:
        vector_hits = search_vector(embed_query(q), limit=vector_limit) if vector_limit else []
        vector_hits = _keep_all_terms(vector_hits, terms, whole_word)
    else:
        vector_hits = []

    if mode in {"hybrid", "keyword"}:
        fts_limit = limit * 2 if limit is not None else None
        fts_hits = _keep_all_terms(search_fts(q, limit=fts_limit), terms, whole_word)
    else:
        fts_hits = []

    if mode == "hybrid":
        raw = _rrf_fuse(vector_hits, fts_hits, limit=limit)
        for r in raw:
            r.pop("rrf", None)
            r["mode"] = "hybrid"
        results = raw
    elif mode == "vector":
        results = vector_hits if limit is None else vector_hits[:limit]
        for r in results:
            r["mode"] = "vector"
    else:  # keyword
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

    _annotate_match_positions(results, terms, whole_word)

    total_occurrences = sum(r.get("occurrences_in_chunk", 0) for r in results)
    total_documents   = len({r.get("doc_id") for r in results})
    took_ms = (time.perf_counter() - t0) * 1000.0

    return SearchResponse(
        query=q,
        mode=mode,
        view="documents",
        total=len(results),
        results=[_to_result(r, mode) for r in results],
        total_occurrences=total_occurrences,
        total_chunks=len(results),
        total_documents=total_documents,
        capped=False,
        offset=0,
        limit=limit,
        took_ms=round(took_ms, 2),
    )


# ── Occurrences view: explode FTS chunks into per-match records ──────────────

def _run_occurrences(
    q: str,
    terms: List[str],
    whole_word: bool,
    limit: Optional[int],
    offset: int,
    t0: float,
) -> SearchResponse:
    if not terms:
        raise HTTPException(status_code=400, detail="Empty query")

    # FTS returns every candidate chunk in milliseconds via the trigram index;
    # no cap here — the position-scan loop below enforces OCCURRENCES_HARD_CAP.
    fts_hits = search_fts(q, limit=None)
    fts_hits = _keep_all_terms(fts_hits, terms, whole_word)

    # Per-chunk BM25 score for sorting/display.
    if fts_hits:
        best_abs  = abs(fts_hits[0].get("rank",  -1)) or 1.0
        worst_abs = abs(fts_hits[-1].get("rank", -1)) or 1.0
        span      = best_abs - worst_abs
        for r in fts_hits:
            bm25 = round((abs(r.get("rank", 0)) - worst_abs) / span, 4) if span else 1.0
            r["score"]      = bm25
            r["bm25_score"] = bm25
            r["semantic_score"] = 0.0
            r["mode"]       = "keyword"

    occurrences, capped = _iter_occurrences(
        fts_hits, terms, whole_word, OCCURRENCES_HARD_CAP,
    )

    total_occurrences = len(occurrences)
    total_chunks      = len({(r["doc_id"], r.get("chunk_index", 0)) for r in occurrences})
    total_documents   = len({r["doc_id"] for r in occurrences})

    page_limit = limit if limit is not None else OCCURRENCES_DEFAULT_LIMIT
    page = occurrences[offset : offset + page_limit]

    took_ms = (time.perf_counter() - t0) * 1000.0

    return SearchResponse(
        query=q,
        mode="keyword",
        view="occurrences",
        total=len(page),
        results=[_to_result(r, "keyword") for r in page],
        total_occurrences=total_occurrences,
        total_chunks=total_chunks,
        total_documents=total_documents,
        capped=capped,
        offset=offset,
        limit=page_limit,
        took_ms=round(took_ms, 2),
    )


def _to_result(r: dict, mode: str) -> SearchResult:
    return SearchResult(
        doc_id=r.get("doc_id", ""),
        filename=r.get("filename", ""),
        filepath=r.get("filepath", ""),
        chunk_text=r.get("chunk_text", ""),
        page=r.get("page"),
        score=r.get("score", 0.0),
        bm25_score=r.get("bm25_score", 0.0),
        semantic_score=r.get("semantic_score", 0.0),
        mode=r.get("mode", mode),
        chunk_index=r.get("chunk_index"),
        match_position=r.get("match_position"),
        snippet=r.get("snippet"),
        match_positions=r.get("match_positions", []),
        occurrences_in_chunk=r.get("occurrences_in_chunk", 0),
    )
