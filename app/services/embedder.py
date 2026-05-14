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


_EMBED_BATCH = int(os.environ.get("DOCSENSE_EMBED_BATCH", "64"))


def embed(texts: List[str]) -> List[List[float]]:
    """Embed a batch of strings. Returns a list of float vectors.

    Processes input in small batches so peak memory stays bounded — naively
    feeding thousands of chunks to fastembed at once accumulated intermediate
    ONNX tensors and grew the process to multi-GB on large PDFs.
    """
    if not texts:
        return []
    model = _get_model()
    out: List[List[float]] = []
    for i in range(0, len(texts), _EMBED_BATCH):
        batch = texts[i : i + _EMBED_BATCH]
        for v in model.embed(batch):
            out.append(v.tolist())
    return out


def embed_query(query: str) -> List[float]:
    """Embed a single query string."""
    return embed([query])[0]
