"""
Qdrant vector store — collection management, point upsert/delete, and search.

Each Qdrant *point* stores:
- A 768-dimensional embedding vector (all-mpnet-base-v2).
- A *payload* dict with chunk metadata: ``chunk_id``, ``document_id``,
  ``filename``, ``file_type``, ``text`` (truncated to 1 000 chars),
  ``section_title``, ``page_number``, ``chunk_index``.

Payload indexes are created on ``document_id`` and ``file_type`` so
Qdrant can apply filters efficiently before the HNSW scan.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    SearchParams,
    VectorParams,
)

from docsense.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class VectorSearchResult:
    """A single hit returned by :meth:`QdrantStore.search`."""

    point_id: str
    score: float
    chunk_id: str
    document_id: str
    text: str
    section_title: str | None
    page_number: int | None
    filename: str
    file_type: str


class QdrantStore:
    """
    Manages the Qdrant collection used by DocSense.

    The client is created on construction and the collection is created
    (with payload indexes) if it does not yet exist.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
        self._collection = settings.qdrant_collection
        self._dim = settings.embedding_dim
        self._ensure_collection()

    # ------------------------------------------------------------------
    # Collection management
    # ------------------------------------------------------------------

    def _ensure_collection(self) -> None:
        """Create the vector collection and its payload indexes if absent."""
        existing = {c.name for c in self._client.get_collections().collections}
        if self._collection in existing:
            logger.debug("Qdrant collection '%s' already exists.", self._collection)
            return

        logger.info("Creating Qdrant collection '%s' (dim=%d).", self._collection, self._dim)
        self._client.create_collection(
            collection_name=self._collection,
            vectors_config=VectorParams(size=self._dim, distance=Distance.COSINE),
        )

        # Payload indexes for fast filtering
        for field, schema in [("document_id", "keyword"), ("file_type", "keyword")]:
            self._client.create_payload_index(
                collection_name=self._collection,
                field_name=field,
                field_schema=schema,
            )
        logger.info("Collection and payload indexes ready.")

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    def upsert_chunks(
        self,
        chunk_ids: list[str],
        vectors: np.ndarray,
        payloads: list[dict],
    ) -> list[str]:
        """
        Upsert chunk embedding vectors into Qdrant.

        Parameters
        ----------
        chunk_ids:
            Logical IDs (from SQLite ``chunks.id``).
        vectors:
            NumPy array shape ``(n, dim)`` — one row per chunk.
        payloads:
            List of metadata dicts (same order as *chunk_ids*).

        Returns
        -------
        list[str]
            The Qdrant point UUIDs assigned to each chunk (same order).
        """
        points: list[PointStruct] = []
        point_ids: list[str] = []

        for chunk_id, vector, payload in zip(chunk_ids, vectors, payloads):
            pid = str(uuid.uuid4())
            point_ids.append(pid)
            points.append(PointStruct(
                id=pid,
                vector=vector.tolist(),
                payload={
                    "chunk_id": chunk_id,
                    "document_id": payload.get("document_id", ""),
                    "filename": payload.get("filename", ""),
                    "file_type": payload.get("file_type", ""),
                    "text": payload.get("text", "")[:1000],  # truncate for payload
                    "section_title": payload.get("section_title"),
                    "page_number": payload.get("page_number"),
                    "chunk_index": payload.get("chunk_index", 0),
                },
            ))

        # Batch upsert in groups of 100 to avoid oversized requests
        batch_size = 100
        for i in range(0, len(points), batch_size):
            self._client.upsert(
                collection_name=self._collection,
                points=points[i : i + batch_size],
            )

        logger.info("Upserted %d point(s) to Qdrant.", len(points))
        return point_ids

    def delete_by_document_id(self, document_id: str) -> None:
        """
        Delete every point whose payload ``document_id`` matches.

        Parameters
        ----------
        document_id:
            The document ID whose chunks should be purged from Qdrant.
        """
        self._client.delete(
            collection_name=self._collection,
            points_selector=Filter(
                must=[FieldCondition(key="document_id", match=MatchValue(value=document_id))]
            ),
        )
        logger.info("Deleted Qdrant points for document_id=%s.", document_id)

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def search(
        self,
        query_vector: np.ndarray,
        top_k: int = 20,
        file_type_filter: str | None = None,
    ) -> list[VectorSearchResult]:
        """
        Run an approximate nearest-neighbour search.

        Parameters
        ----------
        query_vector:
            1-D array of shape ``(dimension,)``.
        top_k:
            Maximum number of results to return.
        file_type_filter:
            If set, restrict results to points whose ``file_type`` matches
            (e.g. ``".pdf"``).

        Returns
        -------
        list[VectorSearchResult]
            Ordered by cosine similarity descending.
        """
        flt: Filter | None = None
        if file_type_filter:
            flt = Filter(
                must=[FieldCondition(key="file_type", match=MatchValue(value=file_type_filter))]
            )

        hits = self._client.search(
            collection_name=self._collection,
            query_vector=query_vector.tolist(),
            query_filter=flt,
            limit=top_k,
            search_params=SearchParams(hnsw_ef=128, exact=False),
        )

        return [
            VectorSearchResult(
                point_id=str(hit.id),
                score=float(hit.score),
                chunk_id=hit.payload.get("chunk_id", ""),
                document_id=hit.payload.get("document_id", ""),
                text=hit.payload.get("text", ""),
                section_title=hit.payload.get("section_title"),
                page_number=hit.payload.get("page_number"),
                filename=hit.payload.get("filename", ""),
                file_type=hit.payload.get("file_type", ""),
            )
            for hit in hits
        ]

    # ------------------------------------------------------------------
    # Info
    # ------------------------------------------------------------------

    def get_collection_info(self) -> dict:
        """Return a summary dict of the collection's current statistics."""
        info = self._client.get_collection(self._collection)
        return {
            "name": self._collection,
            "points_count": info.points_count or 0,
            "vectors_count": info.vectors_count or 0,
            "status": info.status.value if info.status else "unknown",
        }
