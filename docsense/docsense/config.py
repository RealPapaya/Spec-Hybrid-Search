"""
DocSense configuration module.

Loads all settings from environment variables (prefixed DOCSENSE_) or a .env file.
Every application constant is centralised here — import ``get_settings()`` anywhere
you need configuration values.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application-wide settings resolved from environment / .env file."""

    model_config = SettingsConfigDict(
        env_prefix="DOCSENSE_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Filesystem ──────────────────────────────────────────────────────────
    watch_dir: Path = Path("./watched_docs")

    # ── Database ────────────────────────────────────────────────────────────
    sqlite_url: str = "sqlite:///./docsense.db"

    # ── Qdrant ──────────────────────────────────────────────────────────────
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_collection: str = "docsense_chunks"

    # ── Embedding ───────────────────────────────────────────────────────────
    embedding_model: str = "sentence-transformers/all-mpnet-base-v2"
    embedding_dim: int = 768

    # ── Chunking ────────────────────────────────────────────────────────────
    chunk_size: int = 512    # target tokens (whitespace words) per chunk
    chunk_overlap: int = 64  # overlap tokens between adjacent chunks

    # ── Search ──────────────────────────────────────────────────────────────
    bm25_weight: float = 0.4
    semantic_weight: float = 0.6
    top_k: int = 20

    # ── API Server ──────────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"

    # ── Derived ─────────────────────────────────────────────────────────────
    @property
    def supported_extensions(self) -> set[str]:
        """Set of file extensions that the ingestion pipeline handles."""
        return {".pdf", ".docx", ".xlsx", ".pptx"}


@lru_cache
def get_settings() -> Settings:
    """Return a cached singleton ``Settings`` instance."""
    return Settings()
