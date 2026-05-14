"""
Qdrant vector store — connects to the standalone binary via HTTP.
No Docker, no gRPC (pure HTTP mode).
"""
from __future__ import annotations
from typing import List, Dict, Any
import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
)

from app.config import (
    QDRANT_HOST,
    QDRANT_PORT,
    QDRANT_COLLECTION,
    QDRANT_VECTOR_SIZE,
)

# ── Singleton client ──────────────────────────────────────────────────────────

_client: QdrantClient | None = None


def get_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(
            host=QDRANT_HOST,
            port=QDRANT_PORT,
            prefer_grpc=False,   # force HTTP — no extra deps
        )
    return _client


# ── Collection bootstrap ──────────────────────────────────────────────────────

def ensure_collection() -> None:
    """Create the collection if it doesn't exist yet."""
    client = get_client()
    existing = {c.name for c in client.get_collections().collections}
    if QDRANT_COLLECTION not in existing:
        client.create_collection(
            collection_name=QDRANT_COLLECTION,
            vectors_config=VectorParams(
                size=QDRANT_VECTOR_SIZE,
                distance=Distance.COSINE,
            ),
        )


# ── Write operations ──────────────────────────────────────────────────────────

def upsert_chunks(
    doc_id: str,
    chunks: List[Dict[str, Any]],
    embeddings: List[List[float]],
) -> None:
    """Store chunk vectors + payload.  Chunk IDs are deterministic UUIDs."""
    client = get_client()
    points = []
    for i, (chunk, vector) in enumerate(zip(chunks, embeddings)):
        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{doc_id}:{i}"))
        points.append(
            PointStruct(
                id=point_id,
                vector=vector,
                payload={
                    "doc_id":      doc_id,
                    "chunk_index": i,
                    "text":        chunk["text"],
                    "page":        chunk.get("page"),
                    "filename":    chunk.get("filename"),
                    "filepath":    chunk.get("filepath"),
                },
            )
        )
    if points:
        client.upsert(collection_name=QDRANT_COLLECTION, points=points)


def delete_doc(doc_id: str) -> None:
    """Remove all vectors that belong to *doc_id*."""
    client = get_client()
    client.delete(
        collection_name=QDRANT_COLLECTION,
        points_selector=Filter(
            must=[FieldCondition(key="doc_id", match=MatchValue(value=doc_id))]
        ),
    )


# ── Read operations ───────────────────────────────────────────────────────────

def search_vector(
    query_vector: List[float],
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """Return top-*limit* nearest chunks by cosine similarity."""
    from qdrant_client.models import SearchRequest, NamedVector
    client = get_client()
    results = client.query_points(
        collection_name=QDRANT_COLLECTION,
        query=query_vector,
        limit=limit,
        with_payload=True,
    )
    hits = results.points
    return [
        {
            "doc_id":     h.payload["doc_id"],
            "filename":   h.payload.get("filename", ""),
            "filepath":   h.payload.get("filepath", ""),
            "chunk_text": h.payload.get("text", ""),
            "page":       h.payload.get("page"),
            "score":      h.score,
        }
        for h in hits
    ]


def collection_point_count() -> int:
    """Return total number of vectors in the collection."""
    try:
        info = get_client().get_collection(QDRANT_COLLECTION)
        return info.points_count or 0
    except Exception:
        return 0
