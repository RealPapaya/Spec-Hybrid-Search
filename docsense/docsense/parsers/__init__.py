"""
Parsers package.

Importing this package auto-registers all built-in parsers.  External code
should only need::

    from docsense.parsers import parse_file, ParsedDocument, ParserRegistry
"""

from docsense.parsers.base import ParsedDocument, ParserRegistry, TextBlock, parse_file

# Side-effect imports: register each parser with the registry.
from docsense.parsers import pdf_parser, docx_parser, xlsx_parser, pptx_parser  # noqa: F401

__all__ = [
    "ParsedDocument",
    "TextBlock",
    "ParserRegistry",
    "parse_file",
]
