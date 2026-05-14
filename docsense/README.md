# DocSense

**Local document search — PDF, DOCX, XLSX, PPTX.**
Semantic + full-text hybrid search, fully offline, no Docker, no cloud.

---

## Quick start

```bash
# 1. Clone
git clone <repo-url>
cd docsense

# 2. Create a virtual environment (recommended)
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # macOS / Linux

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run
python start.py
```

`start.py` will:
1. Download the Qdrant binary on first run (~35 MB, one-time)
2. Start Qdrant on port **6333**
3. Index any documents already in `watched_docs/`
4. Start the API on **http://localhost:8000**
5. Open your browser automatically

---

## Adding documents

Drop any PDF, DOCX, XLSX, or PPTX file into the `watched_docs/` folder.
They are indexed automatically within seconds — no restart needed.

---

## Search modes

| Mode | How it works |
|------|-------------|
| **Hybrid** | Reciprocal Rank Fusion of Semantic + Keyword (recommended) |
| **Semantic** | Vector similarity via `BAAI/bge-small-en-v1.5` (ONNX) |
| **Keyword** | SQLite FTS5 BM25 full-text search |

---

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/search?q=…&mode=hybrid&limit=10` | Search |
| `POST` | `/api/index` | Trigger re-index of `watched_docs/` |
| `GET`  | `/api/status` | Index statistics |
| `GET`  | `/docs` | OpenAPI / Swagger UI |

---

## Project structure

```
docsense/
├── start.py              ← single entry point
├── requirements.txt
├── app/
│   ├── config.py         ← all paths, ports, model name
│   ├── models.py         ← Pydantic schemas
│   ├── main.py           ← FastAPI app factory
│   ├── routes/
│   │   ├── search.py     ← GET /api/search  (hybrid RRF)
│   │   └── index.py      ← POST /api/index, GET /api/status
│   └── services/
│       ├── embedder.py   ← fastembed (ONNX, no PyTorch)
│       ├── qdrant_store.py ← Qdrant HTTP client
│       └── fts.py        ← SQLite FTS5
├── indexer/
│   ├── extractor.py      ← PDF/DOCX/XLSX/PPTX → text chunks
│   ├── pipeline.py       ← extract → embed → store
│   └── watcher.py        ← watchdog live folder monitor
├── frontend/             ← static HTML/CSS/JS (served at /)
├── watched_docs/         ← drop your documents here
├── qdrant_bin/           ← auto-downloaded binary (gitignored)
├── qdrant_data/          ← Qdrant storage (gitignored)
└── db/                   ← SQLite database (gitignored)
```

---

## Configuration

Edit `app/config.py` to change:
- `EMBED_MODEL` — swap the embedding model
- `CHUNK_SIZE` / `CHUNK_OVERLAP` — tune chunking
- `API_PORT` / `QDRANT_PORT` — change ports
- `WATCHED_DOCS_DIR` — watch a different folder

---

## Requirements

- Python 3.10+
- Internet access on first run (downloads Qdrant binary + embedding model)
- ~500 MB disk space (model cache + Qdrant binary)

No Docker. No PyTorch. No GPU required.
