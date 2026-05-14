"""
Central configuration — all paths and tuneable constants live here.
Edit this file to change ports, model, chunk size, etc.
"""
import platform
from pathlib import Path

# ── Directories ───────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent   # docsense/

QDRANT_BIN_DIR   = BASE_DIR / "qdrant_bin"
QDRANT_DATA_DIR  = BASE_DIR / "qdrant_data"
DB_DIR           = BASE_DIR / "db"
WATCHED_DOCS_DIR = BASE_DIR / "watched_docs"
FRONTEND_DIR     = BASE_DIR / "frontend"

# ── Qdrant ────────────────────────────────────────────────────────────────────
QDRANT_HOST       = "localhost"
QDRANT_PORT       = 6333
QDRANT_COLLECTION = "documents"
QDRANT_VECTOR_SIZE = 384          # matches BAAI/bge-small-en-v1.5

# ── Embedding model ───────────────────────────────────────────────────────────
EMBED_MODEL = "BAAI/bge-small-en-v1.5"   # ~130 MB, ONNX, fast CPU inference

# ── Chunking ──────────────────────────────────────────────────────────────────
CHUNK_SIZE    = 512   # characters per chunk
CHUNK_OVERLAP = 64    # character overlap between consecutive chunks

# ── SQLite ────────────────────────────────────────────────────────────────────
DB_PATH = DB_DIR / "docsense.db"

# ── API server ────────────────────────────────────────────────────────────────
API_HOST = "0.0.0.0"
API_PORT = 8000

# ── Search ────────────────────────────────────────────────────────────────────
DEFAULT_SEARCH_LIMIT = 10
RRF_K = 60   # Reciprocal Rank Fusion constant

# ── Qdrant binary (auto-downloaded by start.py) ───────────────────────────────
_sys     = platform.system()
_machine = platform.machine()

if _sys == "Windows":
    QDRANT_BIN_NAME    = "qdrant.exe"
    QDRANT_ASSET_SUFFIX = "x86_64-pc-windows-msvc.zip"
elif _sys == "Darwin":
    QDRANT_BIN_NAME    = "qdrant"
    QDRANT_ASSET_SUFFIX = (
        "aarch64-apple-darwin.tar.gz"
        if _machine == "arm64"
        else "x86_64-apple-darwin.tar.gz"
    )
else:   # Linux
    QDRANT_BIN_NAME    = "qdrant"
    QDRANT_ASSET_SUFFIX = "x86_64-unknown-linux-musl.tar.gz"

QDRANT_BIN_PATH = QDRANT_BIN_DIR / QDRANT_BIN_NAME
