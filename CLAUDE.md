# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DocSense** is a local document hybrid search system for PDF, DOCX, XLSX, and PPTX files. It runs fully offline with no Docker or cloud dependencies — Qdrant runs as a subprocess binary, embeddings use ONNX via fastembed (no PyTorch).

## Commands

```bash
# Setup (Python 3.11+)
python -m venv .venv
.venv\Scripts\activate           # Windows
pip install -r requirements.txt

# Run the app (downloads Qdrant binary on first run)
python start.py

# Dev dependencies
pip install -e ".[dev]"

# Lint
ruff check app indexer
ruff format app indexer

# Tests
pytest
pytest tests/test_search.py::test_hybrid_search   # single test
```

## Architecture

### Startup sequence (`start.py`)
1. Downloads Qdrant binary from GitHub releases if missing (~35 MB, platform-specific)
2. Launches Qdrant subprocess, polls `/healthz`
3. Starts Uvicorn (FastAPI) in a background thread
4. Opens browser, blocks until Ctrl-C

Qdrant is configured via environment variables (`QDRANT__STORAGE__STORAGE_PATH`, `QDRANT__SERVICE__HTTP_PORT`) rather than CLI flags.

### FastAPI app (`app/main.py`)
Lifespan handler runs: `init_db()` → `ensure_collection()` → `index_all()` → `start_watcher()`. Routes are prefixed at `/api`; static frontend is mounted at `/`.

### Search pipeline (`app/routes/search.py`)
Three modes: `hybrid` (default), `vector`, `keyword`.

- **Hybrid**: runs both vector + FTS5 in parallel, fuses with Reciprocal Rank Fusion (`RRF_K=60`), normalises final score so top result = 1.0. Also tracks `semantic_score` and `bm25_score` per result.
- **Vector**: cosine similarity via Qdrant, using `BAAI/bge-small-en-v1.5` (384-dim).
- **Keyword**: SQLite FTS5 BM25; negative rank normalised to 0–1.

FTS5 rank is negative (most-negative = best), so normalisation is `(abs(rank) - worst_abs) / span`.

### Indexing pipeline (`indexer/pipeline.py`)
`index_file(path)` → `(success, reason)`:
- Doc ID: `sha256(abs_filepath)[:16]` — stable across re-runs.
- Skip if `abs(existing_mtime - current_mtime) < 1.0` second.
- **Atomic replace**: deletes SQLite rows + Qdrant vectors, then inserts fresh data.
- Returns `"indexed"`, `"skipped"`, `"empty"`, or `"error:<msg>"`.

`index_all()` recursively walks `WATCHED_DOCS_DIR`, returns `(indexed, skipped)`.

### File watcher (`indexer/watcher.py`)
Watchdog `FileSystemEventHandler` monitors `WATCHED_DOCS_DIR` recursively. Move events delete old doc_id and re-index at new path.

### Storage layer
| Service | File | Details |
|---------|------|---------|
| Vector DB | `app/services/qdrant_store.py` | HTTP-only client; collection `documents`, 384-dim cosine; point IDs are `UUID5(DNS, f"{doc_id}:{chunk_index}")` |
| Full-text | `app/services/fts.py` | SQLite FTS5 with Porter stemmer; `chunks_fts` virtual table synced via triggers on `chunks` |
| Embeddings | `app/services/embedder.py` | Lazy singleton `fastembed.TextEmbedding`; model auto-cached on first call |

### Configuration (`app/config.py`)
All tuneable constants live here. PyInstaller support: user data dirs (`watched_docs/`, `db/`, `qdrant_*`) are placed next to the `.exe`, not inside `_internal/`.

Key constants:
- `EMBED_MODEL` — fastembed model name
- `CHUNK_SIZE` / `CHUNK_OVERLAP` — character-based chunking (512 / 64)
- `RRF_K` — RRF constant (60)
- `QDRANT_PORT` (6333) / `API_PORT` (8000)
- `WATCHED_DOCS_DIR` — monitored folder

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/search?q=…&mode=hybrid&limit=10` | Search (modes: hybrid, vector, keyword) |
| `POST` | `/api/index` | Trigger manual re-index of `watched_docs/` |
| `GET` | `/api/status` | Index statistics |
| `GET` | `/docs` | Swagger / OpenAPI UI |

## Agent Working Rules

Use the `karpathy-guidelines` skill for non-trivial coding, review, and refactor tasks in this repo.

DocSense-specific success criteria:
- Keep changes surgical: preserve the offline-first, no-Docker, no-cloud design.
- Prefer existing modules and patterns in `app/`, `indexer/`, and `frontend/` over new abstractions.
- Verify backend changes with `pytest` when tests exist, or with the narrowest runnable check for the touched path.
- Verify formatting/lint-sensitive Python changes with `ruff check app indexer` when practical.
- Do not delete or rewrite user data directories such as `watched_docs/`, `db/`, `qdrant_data/`, `qdrant_bin/`, `snapshots/`, or `logs/` unless explicitly requested.
