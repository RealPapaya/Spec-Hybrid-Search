"""
SQLite + FTS5 metadata store.

Tables
------
documents  — one row per indexed file
chunks     — one row per text chunk
chunks_fts — FTS5 virtual table (content= mode, mirroring chunks.text)

FTS5 triggers keep the virtual table in sync automatically.
Porter stemmer + ASCII tokenizer give decent English recall.
"""
from __future__ import annotations
import sqlite3
from typing import List, Dict, Any, Optional

from app.config import DB_PATH


# ── Connection factory ────────────────────────────────────────────────────────

def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    return con


# ── Schema bootstrap ──────────────────────────────────────────────────────────

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

        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
            text,
            content=chunks,
            content_rowid=id,
            tokenize='porter ascii'
        );

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

def search_fts(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Full-text search via FTS5 BM25.
    Returns dicts with doc_id, filename, filepath, chunk_text, page, rank.
    """
    con = _conn()
    # Escape special FTS5 characters to avoid syntax errors
    safe_query = query.replace('"', '""')
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
    con.close()
    return [dict(r) for r in rows]


def get_document_by_path(filepath: str) -> Optional[Dict[str, Any]]:
    con = _conn()
    row = con.execute(
        "SELECT * FROM documents WHERE filepath=?", (filepath,)
    ).fetchone()
    con.close()
    return dict(row) if row else None


def get_stats() -> Dict[str, int]:
    con = _conn()
    total_docs   = con.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    total_chunks = con.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    con.close()
    return {"total_documents": total_docs, "total_chunks": total_chunks}
