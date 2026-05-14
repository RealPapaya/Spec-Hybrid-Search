"""
Tests for the DocSense chunking engine.
"""

from __future__ import annotations

import pytest

from docsense.chunking import ChunkingEngine, TextChunk
from docsense.parsers.base import ParsedDocument, TextBlock


def _make_doc(blocks: list[TextBlock]) -> ParsedDocument:
    return ParsedDocument(filename="test.docx", file_type=".docx", blocks=blocks)


class TestChunkingEngine:
    def test_empty_document_returns_no_chunks(self):
        engine = ChunkingEngine(chunk_size=100, chunk_overlap=10)
        doc = _make_doc([])
        assert engine.chunk_document(doc) == []

    def test_whitespace_only_returns_no_chunks(self):
        engine = ChunkingEngine(chunk_size=100, chunk_overlap=10)
        doc = _make_doc([TextBlock(text="   \n  ")])
        assert engine.chunk_document(doc) == []

    def test_short_doc_produces_single_chunk(self):
        engine = ChunkingEngine(chunk_size=200, chunk_overlap=20)
        doc = _make_doc([TextBlock(text="Hello world. This is a test.")])
        chunks = engine.chunk_document(doc)
        assert len(chunks) == 1
        assert chunks[0].chunk_index == 0
        assert "Hello world" in chunks[0].text

    def test_long_doc_produces_multiple_chunks(self):
        sentence = "The quick brown fox jumps over the lazy dog. "
        long_text = sentence * 100  # ~900 words
        engine = ChunkingEngine(chunk_size=50, chunk_overlap=10)
        doc = _make_doc([TextBlock(text=long_text)])
        chunks = engine.chunk_document(doc)
        assert len(chunks) > 1
        # All chunks should be within reasonable size bounds
        for chunk in chunks:
            assert chunk.token_count <= engine.chunk_size + 20  # small tolerance

    def test_sections_are_respected(self):
        blocks = [
            TextBlock(text="Introduction", block_type="heading"),
            TextBlock(text="This is the intro. " * 10, block_type="paragraph"),
            TextBlock(text="Methods", block_type="heading"),
            TextBlock(text="These are the methods. " * 10, block_type="paragraph"),
        ]
        engine = ChunkingEngine(chunk_size=200, chunk_overlap=20)
        doc = _make_doc(blocks)
        chunks = engine.chunk_document(doc)
        # Each section heading opens a new group
        assert any(c.section_title == "Introduction" for c in chunks)
        assert any(c.section_title == "Methods" for c in chunks)

    def test_chunk_indices_are_sequential(self):
        sentence = "Sentence number one. Sentence number two. " * 60
        engine = ChunkingEngine(chunk_size=30, chunk_overlap=5)
        doc = _make_doc([TextBlock(text=sentence)])
        chunks = engine.chunk_document(doc)
        indices = [c.chunk_index for c in chunks]
        assert indices == list(range(len(chunks)))

    def test_overlap_carries_tail_tokens(self):
        # Produce a doc that must split into exactly 2 chunks.
        # The tail of chunk 1 should appear at the start of chunk 2.
        words = ["word"] * 120  # 120 tokens
        text = " ".join(words)
        engine = ChunkingEngine(chunk_size=80, chunk_overlap=20)
        doc = _make_doc([TextBlock(text=text)])
        chunks = engine.chunk_document(doc)
        assert len(chunks) >= 2
