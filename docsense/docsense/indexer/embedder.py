"""
Text embedder using sentence-transformers.

The model is loaded once and cached as a module-level singleton so repeated
calls across the application share the same in-memory model weights.
All embeddings are L2-normalised before being returned, which makes cosine
similarity equivalent to a dot-product and consistent with Qdrant's
``Distance.COSINE`` distance metric.
"""

from __future__ import annotations

import logging

import numpy as np
from sentence_transformers import SentenceTransformer

from docsense.config import get_settings

logger = logging.getLogger(__name__)

# Module-level singleton — loaded on first instantiation.
_model_instance: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    """Load (or return the cached) SentenceTransformer model."""
    global _model_instance
    if _model_instance is None:
        model_name = get_settings().embedding_model
        logger.info("Loading embedding model: %s", model_name)
        _model_instance = SentenceTransformer(model_name)
        logger.info("Embedding model ready.")
    return _model_instance


class Embedder:
    """
    Thin wrapper around a :class:`SentenceTransformer` model.

    Usage::

        emb = Embedder()
        vectors = emb.embed_texts(["Hello world", "firmware spec"])
        query_vec = emb.embed_query("boot sequence")
    """

    def __init__(self) -> None:
        self._model = _get_model()
        self._dim = get_settings().embedding_dim

    @property
    def dimension(self) -> int:
        """Embedding dimensionality (e.g. 768 for all-mpnet-base-v2)."""
        return self._dim

    def embed_texts(self, texts: list[str], batch_size: int = 32) -> np.ndarray:
        """
        Generate L2-normalised embeddings for a list of text strings.

        Parameters
        ----------
        texts:
            Input strings to embed.
        batch_size:
            Number of texts encoded in parallel; tune for your GPU/CPU.

        Returns
        -------
        np.ndarray
            Shape ``(len(texts), dimension)``, dtype ``float32``.
        """
        if not texts:
            return np.empty((0, self._dim), dtype=np.float32)

        vectors = self._model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=len(texts) > 100,
            normalize_embeddings=True,
            convert_to_numpy=True,
        )
        return vectors.astype(np.float32)

    def embed_query(self, query: str) -> np.ndarray:
        """
        Embed a single search query.

        Parameters
        ----------
        query:
            The search query string.

        Returns
        -------
        np.ndarray
            Shape ``(dimension,)``, dtype ``float32``.
        """
        vectors = self._model.encode(
            [query],
            normalize_embeddings=True,
            convert_to_numpy=True,
        )
        return vectors[0].astype(np.float32)
