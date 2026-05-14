"""
SQLite + FTS5 metadata store.

Tables
------
documents  — one row per indexed file
chunks     — one row per text chunk
chunks_fts — FTS5 virtual table (content= mode, mirroring chunks.text)

FTS5 triggers keep the virtual table in sync automatically.
Trigram tokenizer gives substring-friendly recall for English AND CJK text
(falls back to unicode61 if trigram is not compiled into SQLite).
"""
from __future__ import annotations
import logging
import sqlite3
from typing import List, Dict, Any, Optional

from app.config import DB_PATH

logger = logging.getLogger(__name__)

# Bump this when FTS schema / tokenizer changes — triggers a one-time rebuild.
_FTS_SCHEMA_VERSION = 2


# ── Connection factory ────────────────────────────────────────────────────────

def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    return con


# ── Schema bootstrap ──────────────────────────────────────────────────────────

def _create_fts_table(con: sqlite3.Connection) -> str:
    """Create chunks_fts with trigram tokenizer, falling back to unicode61.

    Returns the tokenizer name that was actually used (for logging).
    """
    for tokenizer in ("trigram", "unicode61 remove_diacritics 2"):
        try:
            con.execute(
                f"""CREATE VIRTUAL TABLE chunks_fts USING fts5(
                        text,
                        content=chunks,
                        content_rowid=id,
                        tokenize='{tokenizer}'
                    )"""
            )
            return tokenizer
        except sqlite3.OperationalError as exc:
            logger.warning("FTS5 tokenizer %r unavailable: %s", tokenizer, exc)
            continue
    raise RuntimeError("No usable FTS5 tokenizer (tried trigram, unicode61)")


def init_db() -> None:
    con = _conn()
    con.executescript("""
        CREATE TABLE IF NOT EXISTS documents (
            doc_id       TEXT    PRIMARY KEY,
            filepath     TEXT    NOT NULL UNIQUE,
            filename     TEXT    NOT NULL,
            file_size    INTEGER,
            modified_at  REAL,
            indexed_at   REAL    DEFAULT (unixepoch()),
            chunk_count  INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS chunks (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id       TEXT    NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
            chunk_index  INTEGER NOT NULL,
            text         TEXT    NOT NULL,
            page         INTEGER
        );
    """)

    current_version = con.execute("PRAGMA user_version").fetchone()[0]
    fts_exists = con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='chunks_fts'"
    ).fetchone() is not None

    if not fts_exists:
        tokenizer = _create_fts_table(con)
        logger.info("Created chunks_fts with tokenizer=%s", tokenizer)
    elif current_version < _FTS_SCHEMA_VERSION:
        logger.info(
            "FTS schema v%d → v%d: rebuilding chunks_fts with new tokenizer",
            current_version, _FTS_SCHEMA_VERSION,
        )
        con.execute("DROP TABLE chunks_fts")
        tokenizer = _create_fts_table(con)
        # Re-populate from the content table (chunks) — does not re-parse documents.
        con.execute("INSERT INTO chunks_fts(chunks_fts) VALUES ('rebuild')")
        logger.info("Rebuilt chunks_fts with tokenizer=%s", tokenizer)

    con.executescript("""
        -- Keep FTS5 in sync with chunks
        CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
            INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
        END;

        CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
            INSERT INTO chunks_fts(chunks_fts, rowid, text)
            VALUES ('delete', old.id, old.text);
        END;

        CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
            INSERT INTO chunks_fts(chunks_fts, rowid, text)
            VALUES ('delete', old.id, old.text);
            INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
        END;
    """)

    con.execute(f"PRAGMA user_version = {_FTS_SCHEMA_VERSION}")
    con.commit()
    con.close()


# ── Write operations ──────────────────────────────────────────────────────────

def upsert_document(
    doc_id: str,
    filepath: str,
    filename: str,
    file_size: int,
    modified_at: float,
) -> None:
    con = _conn()
    con.execute(
        """INSERT OR REPLACE INTO documents
               (doc_id, filepath, filename, file_size, modified_at)
           VALUES (?, ?, ?, ?, ?)""",
        (doc_id, filepath, filename, file_size, modified_at),
    )
    con.commit()
    con.close()


def insert_chunks(doc_id: str, chunks: List[Dict[str, Any]]) -> None:
    con = _conn()
    con.executemany(
        "INSERT INTO chunks (doc_id, chunk_index, text, page) VALUES (?,?,?,?)",
        [(doc_id, i, c["text"], c.get("page")) for i, c in enumerate(chunks)],
    )
    con.execute(
        "UPDATE documents SET chunk_count=? WHERE doc_id=?",
        (len(chunks), doc_id),
    )
    con.commit()
    con.close()


def delete_document(doc_id: str) -> None:
    con = _conn()
    # ON DELETE CASCADE handles chunks + triggers handle FTS cleanup
    con.execute("DELETE FROM documents WHERE doc_id=?", (doc_id,))
    con.commit()
    con.close()


# ── Read operations ───────────────────────────────────────────────────────────

# Trigram FTS5 cannot index n-grams shorter than 3 characters, so queries
# containing a 1- or 2-char token (e.g. "AI", "中文") must fall back to LIKE.
_TRIGRAM_MIN = 3


def _sanitize_fts_query(tokens: List[str]) -> str:
    """Wrap each token as a double-quoted FTS5 phrase so operators, special
    characters, and CJK are treated as literal text. Phrases are AND-ed."""
    return " ".join('"' + t.replace('"', '""') + '"' for t in tokens)


def _like_fallback(tokens: List[str], limit: int) -> List[Dict[str, Any]]:
    """Substring scan over chunks.text for queries trigram can't index."""
    where = " AND ".join(["c.text LIKE ?"] * len(tokens))
    params: list = [f"%{t}%" for t in tokens]
    params.append(limit)
    con = _conn()
    try:
        rows = con.execute(
            f"""
            SELECT c.doc_id, c.chunk_index, c.text AS chunk_text, c.page,
                   d.filename, d.filepath,
                   0.0 AS rank
            FROM   chunks    c
            JOIN   documents d ON c.doc_id = d.doc_id
            WHERE  {where}
            LIMIT  ?
            """,
            params,
        ).fetchall()
    finally:
        con.close()
    return [dict(r) for r in rows]


def search_fts(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Full-text search via FTS5 BM25.
    Returns dicts with doc_id, filename, filepath, chunk_text, page, rank.

    For tokens shorter than the trigram minimum (3 chars) the query degrades
    to a LIKE substring scan, so 2-char Chinese terms like "中文" still match.
    Returns an empty list on FTS syntax errors rather than raising.
    """
    tokens = [t for t in query.split() if t]
    if not tokens:
        return []

    if any(len(t) < _TRIGRAM_MIN for t in tokens):
        return _like_fallback(tokens, limit)

    safe_query = _sanitize_fts_query(tokens)
    con = _conn()
    try:
        rows = con.execute(
            """
            SELECT c.doc_id, c.chunk_index, c.text AS chunk_text, c.page,
                   d.filename, d.filepath,
                   rank
            FROM   chunks_fts
            JOIN   chunks    c ON chunks_fts.rowid = c.id
            JOIN   documents d ON c.doc_id = d.doc_id
            WHERE  chunks_fts MATCH ?
            ORDER  BY rank
            LIMIT  ?
            """,
            (safe_query, limit),
        ).fetchall()
    except sqlite3.OperationalError as exc:
        logger.warning("FTS5 query failed for %r (sanitised: %r): %s", query, safe_query, exc)
        rows = []
    finally:
        con.close()
    return [dict(r) for r in rows]


def get_document_by_path(filepath: str) -> Optional[Dict[str, Any]]:
    con = _conn()
    row = con.execute(
        "SELECT * FROM documents WHERE filepath=?", (filepath,)
    ).fetchone()
    con.close()
    return dict(row) if row else None


def get_all_documents_mtimes() -> Dict[str, float]:
    """Return {filepath: modified_at} for every indexed document.

    Used by index_all() to do skip-checks without one SQL round-trip per file.
    """
    con = _conn()
    rows = con.execute(
        "SELECT filepath, modified_at FROM documents"
    ).fetchall()
    con.close()
    return {r["filepath"]: r["modified_at"] for r in rows}


def get_stats() -> Dict[str, int]:
    con = _conn()
    total_docs   = con.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    total_chunks = con.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    con.close()
    return {"total_documents": total_docs, "total_chunks": total_chunks}
