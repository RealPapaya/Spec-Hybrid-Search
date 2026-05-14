"""
PDF parser — PyMuPDF with OCRmyPDF fallback for scanned documents.

Strategy
--------
1. Open the PDF with PyMuPDF and extract the text layer.
2. Compute the average character count per page.
3. If the average falls below ``OCR_THRESHOLD_CHARS_PER_PAGE`` the file is
   almost certainly scanned/image-only, so invoke ``ocrmypdf`` to add a
   searchable text layer, then re-extract from the result.
4. Return one :class:`TextBlock` per page.
"""

from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path

import fitz  # PyMuPDF

from docsense.parsers.base import ParsedDocument, ParserRegistry, TextBlock

logger = logging.getLogger(__name__)

# Pages with fewer chars than this on average are treated as image-only
OCR_THRESHOLD_CHARS_PER_PAGE = 50


class PDFParser:
    """Parse PDF files using PyMuPDF, falling back to OCR when needed."""

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def parse(self, filepath: Path) -> ParsedDocument:
        """
        Extract text from a PDF file.

        Parameters
        ----------
        filepath:
            Path to the ``.pdf`` file.

        Returns
        -------
        ParsedDocument
            One :class:`TextBlock` per page; ``error`` is set on failure.
        """
        blocks: list[TextBlock] = []
        page_count = 0

        try:
            doc = fitz.open(str(filepath))
            page_count = len(doc)
            total_chars = 0

            for page_num in range(page_count):
                page = doc[page_num]
                text = page.get_text("text").strip()
                total_chars += len(text)
                if text:
                    blocks.append(TextBlock(
                        text=text,
                        page_number=page_num + 1,
                        block_type="paragraph",
                    ))

            doc.close()

            # Fall back to OCR if the text layer is sparse
            avg_chars = total_chars / max(page_count, 1)
            if avg_chars < OCR_THRESHOLD_CHARS_PER_PAGE and page_count > 0:
                logger.info(
                    "Sparse text (%.0f chars/page avg) in %s — attempting OCR.",
                    avg_chars,
                    filepath.name,
                )
                ocr_blocks = self._ocr_fallback(filepath, page_count)
                if ocr_blocks:
                    blocks = ocr_blocks

        except Exception as exc:
            logger.error("PDF parse error for %s: %s", filepath, exc)
            return ParsedDocument(
                filename=filepath.name,
                file_type=".pdf",
                page_count=page_count,
                error=str(exc),
            )

        return ParsedDocument(
            filename=filepath.name,
            file_type=".pdf",
            blocks=blocks,
            page_count=page_count,
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _ocr_fallback(self, filepath: Path, page_count: int) -> list[TextBlock]:
        """
        Run ``ocrmypdf`` on *filepath* and re-extract text from the output PDF.

        Returns an empty list if OCR is unavailable or fails.
        """
        blocks: list[TextBlock] = []

        try:
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp_path = Path(tmp.name)

            result = subprocess.run(
                [
                    "ocrmypdf",
                    "--skip-text",          # skip pages that already have text
                    "--output-type", "pdf",
                    "--jobs", "2",
                    str(filepath),
                    str(tmp_path),
                ],
                capture_output=True,
                text=True,
                timeout=300,              # 5-minute hard limit for large PDFs
            )

            # Return code 6 means "already has text" — treat as success
            if result.returncode not in (0, 6):
                logger.warning(
                    "ocrmypdf exited %d for %s: %s",
                    result.returncode,
                    filepath.name,
                    result.stderr[:200],
                )
                return blocks

            # Re-extract from the OCR'd output
            doc = fitz.open(str(tmp_path))
            for page_num in range(len(doc)):
                text = doc[page_num].get_text("text").strip()
                if text:
                    blocks.append(TextBlock(
                        text=text,
                        page_number=page_num + 1,
                        block_type="paragraph",
                    ))
            doc.close()

        except FileNotFoundError:
            logger.error(
                "ocrmypdf not found — install it with: pip install ocrmypdf  "
                "(also requires Tesseract and Ghostscript on PATH)"
            )
        except subprocess.TimeoutExpired:
            logger.error("OCR timed out for %s", filepath.name)
        except Exception as exc:
            logger.error("OCR fallback failed for %s: %s", filepath.name, exc)
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass

        return blocks


# Register with the global parser registry
ParserRegistry.register(".pdf", PDFParser())
