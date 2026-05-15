# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DocSense** is a local document hybrid search system for PDF, DOCX, XLSX, and PPTX files. It runs fully offline with no Docker or cloud dependencies — Qdrant runs as a subprocess binary, embeddings use ONNX via fastembed (no PyTorch).

## Layout

```
docsense/
├── src/                          ← all source code
│   ├── app/                      ← FastAPI app (routes, services, config, models)
│   ├── indexer/                  ← extraction + watchdog pipeline
│   └── frontend/                 ← split SPA (see Frontend section)
├── data/                         ← all runtime/state (gitignored)
│   ├── db/                       ← SQLite (docsense.db)
│   ├── qdrant_data/              ← Qdrant storage
│   ├── qdrant_bin/               ← downloaded Qdrant binary
│   ├── snapshots/                ← Qdrant snapshots
│   └── logs/                     ← uvicorn / qdrant / launcher logs
├── watched_docs/                 ← user-facing drop zone (gitignored, NOT under data/)
├── start.py                      ← entry point (downloads qdrant, runs uvicorn)
├── docsense_launcher.py          ← Windows TUI launcher
├── DocSense.spec                 ← PyInstaller spec
├── pyproject.toml, requirements.txt, .env.example, .gitignore, CLAUDE.md
```

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
ruff check src/app src/indexer
ruff format src/app src/indexer

# Tests (pytest reads pythonpath = ["src"] from pyproject.toml)
pytest
pytest tests/test_search.py::test_hybrid_search   # single test
```

## Architecture

### Startup sequence (`start.py`)
1. One-shot migration: moves any pre-restructure `db/`, `qdrant_data/`, `qdrant_bin/`, `snapshots/`, `logs/` from the project root into `data/`.
2. Downloads Qdrant binary from GitHub releases if missing (~35 MB, platform-specific).
3. Launches Qdrant subprocess, polls `/healthz`.
4. Starts Uvicorn (FastAPI) in a background thread.
5. Opens browser, blocks until Ctrl-C.

`start.py` inserts `src/` onto `sys.path` so `from app.config import …` keeps working. Qdrant is configured via environment variables (`QDRANT__STORAGE__STORAGE_PATH`, `QDRANT__SERVICE__HTTP_PORT`) rather than CLI flags.

### FastAPI app (`src/app/main.py`)
Lifespan handler runs: `init_db()` → `ensure_collection()` → `index_all()` → `start_watcher()`. Routes are prefixed at `/api`; static frontend is mounted at `/`.

### Search pipeline (`src/app/routes/search.py`)
Three modes: `hybrid` (default), `vector`, `keyword`.

- **Hybrid**: runs both vector + FTS5 in parallel, fuses with Reciprocal Rank Fusion (`RRF_K=60`), normalises final score so top result = 1.0. Also tracks `semantic_score` and `bm25_score` per result.
- **Vector**: cosine similarity via Qdrant, using `BAAI/bge-small-en-v1.5` (384-dim).
- **Keyword**: SQLite FTS5 BM25; negative rank normalised to 0–1.

FTS5 rank is negative (most-negative = best), so normalisation is `(abs(rank) - worst_abs) / span`.

### Indexing pipeline (`src/indexer/pipeline.py`)
`index_file(path)` → `(success, reason)`:
- Doc ID: `sha256(abs_filepath)[:16]` — stable across re-runs.
- Skip if `abs(existing_mtime - current_mtime) < 1.0` second.
- **Atomic replace**: deletes SQLite rows + Qdrant vectors, then inserts fresh data.
- Returns `"indexed"`, `"skipped"`, `"empty"`, or `"error:<msg>"`.

`index_all()` recursively walks `WATCHED_DOCS_DIR`, returns `(indexed, skipped)`.

### File watcher (`src/indexer/watcher.py`)
Watchdog `FileSystemEventHandler` monitors `WATCHED_DOCS_DIR` recursively. Move events delete old doc_id and re-index at new path.

### Storage layer
| Service | File | Details |
|---------|------|---------|
| Vector DB | `src/app/services/qdrant_store.py` | HTTP-only client; collection `documents`, 384-dim cosine; point IDs are `UUID5(DNS, f"{doc_id}:{chunk_index}")` |
| Full-text | `src/app/services/fts.py` | SQLite FTS5 with Porter stemmer; `chunks_fts` virtual table synced via triggers on `chunks` |
| Embeddings | `src/app/services/embedder.py` | Lazy singleton `fastembed.TextEmbedding`; model auto-cached on first call |

### Configuration (`src/app/config.py`)
All tuneable constants live here. PyInstaller support: `BASE_DIR` resolves to the `.exe` directory when frozen (so `data/` and `watched_docs/` sit next to the executable, where users can find them), and to the project root in dev. `FRONTEND_DIR` points to `_MEIPASS/frontend` when frozen, `src/frontend` in dev.

Key constants:
- `EMBED_MODEL` — fastembed model name
- `CHUNK_SIZE` / `CHUNK_OVERLAP` — character-based chunking (1500 / 150)
- `RRF_K` — RRF constant (60)
- `QDRANT_PORT` (6333) / `API_PORT` (8000)
- `DATA_DIR` — `BASE_DIR / "data"`; all runtime dirs (`DB_DIR`, `LOG_DIR`, `QDRANT_*_DIR`, `SNAPSHOTS_DIR`) hang off this
- `WATCHED_DOCS_DIR` — `BASE_DIR / "watched_docs"` (kept at root by design)

### Frontend (`src/frontend/`)

Single-page React app, no build step — uses React 18 + Babel standalone via CDN.

```
src/frontend/
├── index.html                ← shell (~50 lines, loads scripts in order)
├── styles/main.css           ← all CSS (~1250 lines)
├── tooltip.js                ← vanilla JS [data-tip] delegate
├── lib/                      ← shared utilities (helpers, lang, prefs, tags,
│                                bookmarks, api)
├── tweaks/TweaksPanel.jsx    ← floating Preferences panel + Tweak* controls
├── components/               ← UI: Topbar, SearchRow, FiltersRail, ResultsPanel,
│                                PreviewPanel, StatusBar, TagAssignMenu
├── views/                    ← page-level: DocumentsView, BookmarksView
└── app.jsx                   ← App + ReactDOM.render (loads last)
```

Each `<script type="text/babel" src="…">` is transpiled in-browser. Cross-file
references rely on top-level `var`/`function` declarations becoming globals on
the window object — `const` at module top would NOT be visible across scripts,
so a handful of bindings (`Icon`, `DICT`, `LangCtx`, `PREFS_KEY`, `TAGS_KEY`,
`TAG_COLORS`, `BOOKMARKS_KEY`) are intentionally declared `var`. **Do not
introduce ES modules or a Node build step** — that would break the offline-first
philosophy.

Script load order is fixed in `index.html` (lib → tweaks → components → views →
`app.jsx`). When adding a new component, slot it into the right tier and keep
its dependencies above it.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/search?q=…&mode=hybrid&limit=10` | Search (modes: hybrid, vector, keyword) |
| `POST` | `/api/index` | Trigger manual re-index of `watched_docs/` |
| `GET` | `/api/status` | Index statistics |
| `GET` | `/api/documents` | List indexed documents (for the Files view) |
| `GET` | `/api/file/{doc_id}` | Serve original file (`?download=1` to force download) |
| `GET` | `/docs` | Swagger / OpenAPI UI |

## Agent Working Rules

Use the `karpathy-guidelines` skill for non-trivial coding, review, and refactor tasks in this repo.

DocSense-specific success criteria:
- Keep changes surgical: preserve the offline-first, no-Docker, no-cloud design.
- Prefer existing modules and patterns in `src/app/`, `src/indexer/`, and `src/frontend/` over new abstractions.
- Verify backend changes with `pytest` when tests exist, or with the narrowest runnable check for the touched path.
- Verify formatting/lint-sensitive Python changes with `ruff check src/app src/indexer` when practical.
- Do not delete or rewrite user data directories such as `watched_docs/` or anything under `data/` (`data/db/`, `data/qdrant_data/`, `data/qdrant_bin/`, `data/snapshots/`, `data/logs/`) unless explicitly requested.
