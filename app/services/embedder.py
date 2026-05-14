"""
Thin wrapper around fastembed.TextEmbedding.

fastembed uses ONNX Runtime — no PyTorch required.
The model (~130 MB) is downloaded once on first use and cached by fastembed.
"""
from __future__ import annotations
import os
from typing import List

from app.config import EMBED_MODEL

# Module-level singleton — initialised lazily on first call
_model = None

# Cap ONNX intra/inter-op threads so the embedder doesn't saturate the CPU.
# Default: half the logical cores (min 1, max 4). Overridable via env var so
# users can trade indexing speed for system responsiveness.
_DEFAULT_THREADS = max(1, min(4, (os.cpu_count() or 4) // 2))
_EMBED_THREADS = int(os.environ.get("DOCSENSE_EMBED_THREADS", _DEFAULT_THREADS))


def _get_model():
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        _model = TextEmbedding(
            model_name=EMBED_MODEL,
            threads=_EMBED_THREADS,
        )
    return _model


def embed(texts: List[str]) -> List[List[float]]:
    """Embed a batch of strings. Returns a list of float vectors."""
    if not texts:
        return []
    model  = _get_model()
    result = list(model.embed(texts))
    return [v.tolist() for v in result]


def embed_query(query: str) -> List[float]:
    """Embed a single query string."""
    return embed([query])[0]
