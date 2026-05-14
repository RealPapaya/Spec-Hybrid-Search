"""
SQLAlchemy ORM models for DocSense.

Tables
------
documents
    Tracks every ingested file: path, content hash, processing status, and
    high-level metadata (page count, chunk count).

chunks
    Stores each text chunk produced by the chunking engine, with a reference
    to the Qdrant point that holds its embedding vector.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


class Document(Base):
    """Represents a single ingested file."""

    __tablename__ = "documents"

    id: str = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename: str = Column(String(512), nullable=False)
    filepath: str = Column(String(2048), nullable=False, unique=True)
    file_type: str = Column(String(10), nullable=False)      # .pdf / .docx / .xlsx / .pptx
    file_size: int = Column(Integer, nullable=False, default=0)
    file_hash: str = Column(String(64), nullable=False)       # SHA-256 for change detection
    status: str = Column(
        SAEnum("pending", "processing", "indexed", "error", name="doc_status"),
        nullable=False,
        default="pending",
    )
    error_message: str | None = Column(Text, nullable=True)
    page_count: int | None = Column(Integer, nullable=True)
    chunk_count: int = Column(Integer, nullable=False, default=0)
    created_at: datetime = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: datetime = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_documents_filepath", "filepath"),
        Index("ix_documents_status", "status"),
        Index("ix_documents_file_hash", "file_hash"),
    )

    def __repr__(self) -> str:
        return f"<Document id={self.id!r} filename={self.filename!r} status={self.status!r}>"


class Chunk(Base):
    """Represents a text chunk extracted from a document."""

    __tablename__ = "chunks"

    id: str = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id: str = Column(String(36), ForeignKey("documents.id"), nullable=False)
    qdrant_point_id: str | None = Column(String(36), nullable=True)  # UUID stored in Qdrant
    chunk_index: int = Column(Integer, nullable=False)                # Ordering within document
    text: str = Column(Text, nullable=False)
    token_count: int = Column(Integer, nullable=False, default=0)
    page_number: int | None = Column(Integer, nullable=True)
    section_title: str | None = Column(String(512), nullable=True)
    start_char: int = Column(Integer, nullable=False, default=0)
    end_char: int = Column(Integer, nullable=False, default=0)
    created_at: datetime = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    document = relationship("Document", back_populates="chunks")

    __table_args__ = (
        Index("ix_chunks_document_id", "document_id"),
        Index("ix_chunks_qdrant_point_id", "qdrant_point_id"),
    )

    def __repr__(self) -> str:
        return f"<Chunk id={self.id!r} doc={self.document_id!r} idx={self.chunk_index}>"
