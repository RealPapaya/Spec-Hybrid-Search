"""
Base parser interface and registry.

Every format-specific parser module registers a concrete implementation via
``ParserRegistry.register()``.  Callers use the top-level ``parse_file()``
helper which delegates to the correct parser automatically.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol, runtime_checkable

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class TextBlock:
    """
    A single unit of text extracted from a document.

    Attributes
    ----------
    text:
        Raw text content of the block.
    page_number:
        1-based page (or slide) number, if available.
    section_title:
        The nearest heading / section name that contains this block.
    block_type:
        Semantic type: ``paragraph``, ``heading``, ``table``, ``note``, ``code``.
    char_offset:
        Character offset of this block within the full document text stream
        (best-effort; set to 0 if unknown).
    """

    text: str
    page_number: int | None = None
    section_title: str | None = None
    block_type: str = "paragraph"   # paragraph | heading | table | note | code
    char_offset: int = 0


@dataclass
class ParsedDocument:
    """
    The result produced by any parser.

    Attributes
    ----------
    filename:
        Base name of the source file.
    file_type:
        Lowercase extension including the dot (e.g. ``.pdf``).
    blocks:
        Ordered list of :class:`TextBlock` objects.
    page_count:
        Total number of pages / slides, if known.
    error:
        Non-``None`` when parsing failed; contains the error description.
    """

    filename: str
    file_type: str
    blocks: list[TextBlock] = field(default_factory=list)
    page_count: int | None = None
    error: str | None = None

    @property
    def full_text(self) -> str:
        """Concatenate all non-empty blocks into a single string."""
        return "\n\n".join(b.text for b in self.blocks if b.text.strip())

    @property
    def is_empty(self) -> bool:
        """Return ``True`` if no non-whitespace text was extracted."""
        return not any(b.text.strip() for b in self.blocks)


# ---------------------------------------------------------------------------
# Parser protocol & registry
# ---------------------------------------------------------------------------

@runtime_checkable
class FileParser(Protocol):
    """Protocol that all concrete parsers must satisfy."""

    def parse(self, filepath: Path) -> ParsedDocument:
        """Parse *filepath* and return a :class:`ParsedDocument`."""
        ...


class ParserRegistry:
    """Maps file extensions to :class:`FileParser` implementations."""

    _parsers: dict[str, FileParser] = {}

    @classmethod
    def register(cls, extension: str, parser: FileParser) -> None:
        """Register *parser* for the given file *extension* (e.g. ``".pdf"``)."""
        cls._parsers[extension.lower()] = parser

    @classmethod
    def get_parser(cls, extension: str) -> FileParser | None:
        """Return the parser for *extension*, or ``None`` if unsupported."""
        return cls._parsers.get(extension.lower())

    @classmethod
    def supported_extensions(cls) -> set[str]:
        """Return the set of registered extensions."""
        return set(cls._parsers.keys())


# ---------------------------------------------------------------------------
# Top-level convenience function
# ---------------------------------------------------------------------------

def parse_file(filepath: Path) -> ParsedDocument:
    """
    Parse *filepath* using the registered parser for its extension.

    Returns a :class:`ParsedDocument` whose ``error`` attribute is set if
    parsing fails.  Never raises.
    """
    ext = filepath.suffix.lower()
    parser = ParserRegistry.get_parser(ext)

    if parser is None:
        logger.warning("No parser registered for extension: %s", ext)
        return ParsedDocument(
            filename=filepath.name,
            file_type=ext,
            error=f"Unsupported file type: {ext}",
        )

    try:
        result = parser.parse(filepath)
        logger.info(
            "Parsed %s: %d block(s), %s page(s)",
            filepath.name,
            len(result.blocks),
            result.page_count or "?",
        )
        return result
    except Exception as exc:
        logger.error("Failed to parse %s: %s", filepath.name, exc, exc_info=True)
        return ParsedDocument(
            filename=filepath.name,
            file_type=ext,
            error=str(exc),
        )
