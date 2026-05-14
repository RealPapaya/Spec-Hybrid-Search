"""
Structure-aware chunking engine with sliding-window overlap.

Algorithm
---------
1. Group :class:`~docsense.parsers.base.TextBlock` objects by their section
   heading.  Heading blocks themselves open new groups.
2. Within each section, concatenate the block texts and split into chunks that
   are at most ``chunk_size`` whitespace-tokens long.
3. Splitting honours sentence boundaries (via a lightweight regex heuristic)
   so no sentence is ever cut in the middle.
4. The last ``chunk_overlap`` tokens of every finished chunk are prepended to
   the next one (sliding-window overlap), preserving cross-boundary context.
5. Blocks that already fit within ``chunk_size`` are emitted as a single chunk.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from docsense.config import get_settings
from docsense.parsers.base import ParsedDocument, TextBlock

logger = logging.getLogger(__name__)


@dataclass
class TextChunk:
    """
    A text chunk ready for embedding and indexing.

    Attributes
    ----------
    text:
        The chunk text.
    chunk_index:
        Zero-based position within the parent document.
    token_count:
        Approximate token count (whitespace words).
    page_number:
        Page / slide number of the first block that contributed to this chunk.
    section_title:
        Section heading under which this chunk falls.
    start_char / end_char:
        Approximate character offsets within the concatenated document text.
    """

    text: str
    chunk_index: int
    token_count: int
    page_number: int | None = None
    section_title: str | None = None
    start_char: int = 0
    end_char: int = 0


class ChunkingEngine:
    """
    Convert a :class:`~docsense.parsers.base.ParsedDocument` into a list of
    :class:`TextChunk` objects suitable for embedding.
    """

    def __init__(
        self,
        chunk_size: int | None = None,
        chunk_overlap: int | None = None,
    ) -> None:
        """
        Parameters
        ----------
        chunk_size:
            Target token count per chunk.  Defaults to ``settings.chunk_size``.
        chunk_overlap:
            Token overlap between adjacent chunks.
            Defaults to ``settings.chunk_overlap``.
        """
        settings = get_settings()
        self.chunk_size: int = chunk_size if chunk_size is not None else settings.chunk_size
        self.chunk_overlap: int = (
            chunk_overlap if chunk_overlap is not None else settings.chunk_overlap
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def chunk_document(self, parsed_doc: ParsedDocument) -> list[TextChunk]:
        """
        Produce an ordered list of :class:`TextChunk` from *parsed_doc*.

        Returns an empty list if the document contains no extractable text.
        """
        if parsed_doc.is_empty:
            logger.debug("Skipping empty document: %s", parsed_doc.filename)
            return []

        section_groups = self._group_by_section(parsed_doc.blocks)
        chunks: list[TextChunk] = []
        global_char_offset = 0
        chunk_index = 0

        for section_title, blocks in section_groups:
            section_text = "\n\n".join(b.text for b in blocks if b.text.strip())
            if not section_text.strip():
                continue

            page_number = next((b.page_number for b in blocks if b.page_number), None)

            section_chunks = self._split_section(
                text=section_text,
                section_title=section_title,
                page_number=page_number,
                start_offset=global_char_offset,
                start_index=chunk_index,
            )

            chunks.extend(section_chunks)
            chunk_index += len(section_chunks)
            global_char_offset += len(section_text) + 2  # +2 for separator

        logger.info(
            "Chunked '%s': %d chunk(s) (size=%d, overlap=%d)",
            parsed_doc.filename,
            len(chunks),
            self.chunk_size,
            self.chunk_overlap,
        )
        return chunks

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _group_by_section(
        self, blocks: list[TextBlock]
    ) -> list[tuple[str | None, list[TextBlock]]]:
        """
        Group consecutive blocks by their section heading.

        A ``heading`` block starts a new group.  All following non-heading
        blocks belong to that group until the next heading appears.
        """
        groups: list[tuple[str | None, list[TextBlock]]] = []
        current_section: str | None = None
        current_blocks: list[TextBlock] = []

        for block in blocks:
            if block.block_type == "heading":
                if current_blocks:
                    groups.append((current_section, current_blocks))
                current_section = block.text
                current_blocks = [block]
            else:
                current_blocks.append(block)

        if current_blocks:
            groups.append((current_section, current_blocks))

        return groups

    def _split_section(
        self,
        text: str,
        section_title: str | None,
        page_number: int | None,
        start_offset: int,
        start_index: int,
    ) -> list[TextChunk]:
        """
        Split *text* into overlapping sentence-aligned chunks.

        If the whole text fits within ``chunk_size`` it is returned as a
        single chunk.  Otherwise a greedy sentence-accumulation loop is used
        with sliding-window overlap at each boundary.
        """
        words = text.split()
        total_tokens = len(words)

        # Fast path: fits in one chunk
        if total_tokens <= self.chunk_size:
            return [TextChunk(
                text=text.strip(),
                chunk_index=start_index,
                token_count=total_tokens,
                page_number=page_number,
                section_title=section_title,
                start_char=start_offset,
                end_char=start_offset + len(text),
            )]

        # Multi-chunk path
        sentences = self._split_sentences(text)
        chunks: list[TextChunk] = []
        current_sents: list[str] = []
        current_tokens = 0
        chunk_idx = start_index
        char_pos = start_offset

        for sentence in sentences:
            sent_tokens = len(sentence.split())

            # Flush current buffer when it would exceed chunk_size
            if current_tokens + sent_tokens > self.chunk_size and current_sents:
                chunk_text = " ".join(current_sents)
                chunks.append(TextChunk(
                    text=chunk_text,
                    chunk_index=chunk_idx,
                    token_count=current_tokens,
                    page_number=page_number,
                    section_title=section_title,
                    start_char=char_pos,
                    end_char=char_pos + len(chunk_text),
                ))
                chunk_idx += 1
                char_pos += len(chunk_text) + 1

                # Carry over the overlap tail
                overlap_sents, overlap_tokens = self._overlap_tail(current_sents)
                current_sents = overlap_sents
                current_tokens = overlap_tokens

            current_sents.append(sentence)
            current_tokens += sent_tokens

        # Emit the final buffer
        if current_sents:
            chunk_text = " ".join(current_sents)
            chunks.append(TextChunk(
                text=chunk_text,
                chunk_index=chunk_idx,
                token_count=current_tokens,
                page_number=page_number,
                section_title=section_title,
                start_char=char_pos,
                end_char=char_pos + len(chunk_text),
            ))

        return chunks

    def _overlap_tail(self, sentences: list[str]) -> tuple[list[str], int]:
        """
        Return the trailing sentences that together contain at most
        ``chunk_overlap`` tokens.

        Works from the end of *sentences* backwards.
        """
        tail: list[str] = []
        token_count = 0

        for sentence in reversed(sentences):
            tokens = len(sentence.split())
            if token_count + tokens > self.chunk_overlap:
                break
            tail.insert(0, sentence)
            token_count += tokens

        return tail, token_count

    @staticmethod
    def _split_sentences(text: str) -> list[str]:
        """
        Split *text* into sentences using a lightweight regex heuristic.

        The pattern splits at punctuation (``. ! ?``) followed by whitespace
        and an uppercase letter, or at blank-line boundaries.  This deliberately
        avoids splitting on decimal numbers, abbreviations like "e.g.", etc.
        """
        pattern = re.compile(r'(?<=[.!?])\s+(?=[A-Z])|(?<=\n)\s*(?=\S)')
        parts = pattern.split(text)
        return [" ".join(p.split()) for p in parts if p.strip()]
