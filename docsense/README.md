# DocSense

Local enterprise document hybrid search system.

## Quick Start

```bash
# 1. Install dependencies
pip install -e ".[dev]"

# 2. Start Qdrant (Docker)
docker run -d -p 6333:6333 --name qdrant qdrant/qdrant

# 3. Configure environment
cp .env.example .env
# Edit .env as needed

# 4. Initialise the database
python -c "from docsense.database import init_db; init_db()"

# 5. Start the API server
uvicorn docsense.api.main:app --host 0.0.0.0 --port 8000

# 6. Start the file watcher (separate terminal)
python -m docsense.watcher.daemon

# 7. Drop documents into ./watched_docs/ — they are indexed automatically.

# 8. Search
curl "http://localhost:8000/search?q=firmware+boot&mode=hybrid"
# Swagger UI: http://localhost:8000/docs
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/search` | Hybrid / keyword / semantic search |
| GET | `/docs` | List all documents |
| GET | `/docs/{id}` | Document detail + chunks |
| DELETE | `/docs/{id}` | Remove document from index |
| GET | `/admin/stats` | Index statistics |
| POST | `/admin/ingest` | Manually ingest a file |
| POST | `/admin/reindex` | Re-index all documents |
| GET | `/admin/health` | Health check |

## Supported File Types

- PDF (text layer + OCR fallback for scanned PDFs)
- DOCX (paragraphs, headings, tables)
- XLSX (all sheets, all rows)
- PPTX (slide text, tables, speaker notes)

## Architecture

```
Watchdog → Parsers → Chunker → Embedder → Qdrant
                                         ↑
                                      SQLite (metadata)
                                         ↓
                              FastAPI (/search, /docs, /admin)
```

## Search Modes

| Mode | Algorithm | Description |
|------|-----------|-------------|
| `keyword` | BM25 | Classic keyword relevance |
| `semantic` | Cosine similarity | Dense vector search |
| `hybrid` | RRF (BM25 + cosine) | Best of both (default) |
