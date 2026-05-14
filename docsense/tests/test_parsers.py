"""
Tests for the file parser base infrastructure.
"""

from __future__ import annotations

from docsense.parsers.base import ParsedDocument, ParserRegistry, TextBlock, parse_file
# Trigger registration
from docsense.parsers import pdf_parser, docx_parser, xlsx_parser, pptx_parser  # noqa: F401


class TestParserRegistry:
    def test_all_four_parsers_registered(self):
        supported = ParserRegistry.supported_extensions()
        assert ".pdf" in supported
        assert ".docx" in supported
        assert ".xlsx" in supported
        assert ".pptx" in supported

    def test_unsupported_extension_returns_error_doc(self, tmp_path):
        fake = tmp_path / "file.xyz"
        fake.write_text("data")
        result = parse_file(fake)
        assert result.error is not None
        assert result.is_empty

    def test_parsed_document_full_text(self):
        doc = ParsedDocument(
            filename="x.docx",
            file_type=".docx",
            blocks=[
                TextBlock(text="Hello"),
                TextBlock(text="World"),
            ],
        )
        assert "Hello" in doc.full_text
        assert "World" in doc.full_text

    def test_parsed_document_is_empty_true(self):
        doc = ParsedDocument(filename="x.pdf", file_type=".pdf", blocks=[TextBlock(text="  ")])
        assert doc.is_empty

    def test_parsed_document_is_empty_false(self):
        doc = ParsedDocument(filename="x.pdf", file_type=".pdf", blocks=[TextBlock(text="hi")])
        assert not doc.is_empty
