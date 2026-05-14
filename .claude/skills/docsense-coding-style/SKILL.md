---
name: docsense-coding-style
description: Enforce DocSense Python coding standards, formatting, and conventions
metadata:
  type: skill
---

# DocSense Coding Style Guide

This skill enforces consistent code style and conventions across the DocSense project.

## Code Style Standards

### Python Version & Configuration
- **Target**: Python 3.11+
- **Line length**: 100 characters (configured in `pyproject.toml`)
- **Tool**: Ruff for linting and formatting

### Formatting Rules

#### Imports
```python
# Use future annotations for all files
from __future__ import annotations

# Standard library imports first
import sqlite3
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager

# Third-party imports
from fastapi import FastAPI
from pydantic import BaseModel

# Local imports
from app.config import DB_PATH
```

#### Module Structure
```python
"""
One-line summary of module.

Extended description with implementation details,
tables, or key concepts.
"""

# ── Section separator with comment ────────────────────────────

def function_name() -> ReturnType:
    """Brief docstring if needed."""
    pass
```

**Rules:**
- Use `from __future__ import annotations` at the top
- Group imports: stdlib → third-party → local
- Use module-level docstrings with triple quotes
- Use `# ──` visual separators for sections (60+ dashes)
- Minimal docstrings; code clarity is preferred over comments
- Only comment the "why" if non-obvious

#### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Functions | `snake_case` | `index_file()`, `ensure_collection()` |
| Classes | `PascalCase` | `SearchResult`, `IndexResponse` |
| Constants | `UPPER_SNAKE_CASE` | `CHUNK_SIZE = 512`, `RRF_K = 60` |
| Private | Leading `_` | `_conn()`, `_observer` |
| Modules | `snake_case` | `fts.py`, `qdrant_store.py` |

#### Type Hints
- Use type hints for all function parameters and returns
- Use `Optional[T]` for nullable values
- Use `Literal["value1", "value2"]` for enums
- Use `List[T]`, `Dict[K, V]` from typing (not `list[T]` in this project)

```python
def search(
    query: str,
    mode: Literal["hybrid", "vector", "keyword"] = "hybrid",
    limit: int = 10,
) -> List[SearchResult]:
    pass
```

#### Class Design (Pydantic Models)
```python
class SearchResult(BaseModel):
    doc_id:         str
    filename:       str
    filepath:       str
    chunk_text:     str
    page:           Optional[int] = None
    score:          float
    bm25_score:     float = 0.0
    semantic_score: float = 0.0
    mode:           str
```

**Rules:**
- Align field names and types with extra spaces for readability
- Use comments in docstring format for complex fields
- Keep models lean; use composition if needed

### Ruff Linting Configuration

The project uses Ruff with these rules:

```toml
[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "W", "I"]  # PEP 8, pyflakes, warnings, imports
ignore = ["E501"]               # Long line warnings ignored
```

**What this means:**
- E: PEP 8 style issues
- F: Pyflakes (undefined names, unused imports)
- W: Warnings
- I: Import sorting (isort-compatible)
- E501 (long lines): Ignored because line-length rule handles it

### Running Linters

```bash
# Check code style
ruff check app indexer

# Auto-fix issues
ruff format app indexer

# Fix imports
ruff check --fix app indexer
```

## Project Structure Conventions

### Module Organization
```
app/
  config.py          # All configuration constants
  main.py            # FastAPI app factory
  models.py          # Pydantic schemas
  services/          # Storage layer (DB, vector store, embeddings)
    fts.py
    qdrant_store.py
    embedder.py
  routes/            # API endpoint handlers
    search.py
    index.py

indexer/
  extractor.py       # Document parsing
  pipeline.py        # Indexing orchestration
  watcher.py         # File system monitoring
```

### Service Layer Pattern
Each service module follows:
1. Connection factory function (`_conn()`)
2. Schema/initialization function (`init_db()`)
3. Query/mutation functions
4. Clean separation of concerns

### Configuration Management
- All constants in `app/config.py`
- Environment variables via `pydantic-settings`
- No magic strings in code

## Code Quality Standards

### Error Handling
- Validate at system boundaries (user input, external APIs)
- Trust internal code and framework guarantees
- Use exceptions for exceptional cases
- Return tuples `(success: bool, reason: str)` for operations that may fail

```python
def index_file(path: Path) -> tuple[bool, str]:
    # Returns (True, "indexed"), (False, "error: msg"), etc.
    pass
```

### Testing
```bash
# Run all tests
pytest

# Run specific test
pytest tests/test_search.py::test_hybrid_search

# With asyncio support
pytest --asyncio-mode=auto
```

Test files go in `tests/` with `test_*.py` naming.

## Common Patterns in DocSense

### Async/Await
```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code
    yield
    # Cleanup code
```

### Database Operations
```python
from app.services.fts import _conn

con = _conn()
con.execute("SELECT * FROM documents WHERE doc_id = ?", (doc_id,))
con.commit()
con.close()
```

### Qdrant Vector Operations
```python
from app.services.qdrant_store import client

# Upsert points
client.upsert(
    collection_name="documents",
    points=[PointStruct(id=point_id, vector=embedding, payload={})]
)
```

### Logging
```python
import logging
logger = logging.getLogger(__name__)

logger.info("Processing file: %s", filepath)
logger.error("Failed to index: %s", reason)
```

## When to Refactor

Only refactor when:
1. Duplication is clearly harmful (3+ very similar lines)
2. The abstraction is genuinely useful
3. It improves readability, not just elegance

**Don't** refactor for:
- Hypothetical future requirements
- Code that's already working and clear
- Premature optimization

## Skill Usage

Use this skill to:
- Check code style: `ruff check app indexer`
- Auto-format code: `ruff format app indexer`
- Review code for style compliance
- Understand DocSense conventions before writing new code
