# Enterprise Document Search (Local Web) – Project Specification

## Executive Summary  
This project defines a local, web-based document search system for enterprise use. The system focuses on **semantic (meaning-based) search** across large collections of files (PDF, DOCX, XLSX, PPTX, etc.) on a single developer machine. We adopt a **hybrid retrieval** approach: combining **dense (vector)** and **sparse (keyword)** search to ensure both relevance and speed. A modern vector database (Qdrant) will index document embeddings, yielding high throughput and low latency【7†L168-L172】. Traditional full-text indexing (e.g. BM25) complements vector search for precise keyword filtering. FastAPI is chosen for the backend API (as commonly used in semantic search stacks【36†L61-L67】) and a lightweight SQLite database will hold metadata. Scalable Python libraries (e.g. python-docx, python-pptx, PyMuPDF, OCRmyPDF/Tesseract) handle content ingestion. Results will be served through a simple web UI (search box, filters, preview). This phased plan leads to a production-ready MVP, with optional enhancements like reranking and multi-user support as later phases.

## Product Scope  
This tool is scoped as a **single-machine, local developer interface** for enterprise document search. It assumes one user or a small team browsing a shared index from a browser on the same machine. We do **not** target large-scale multi-tenant deployments (those would require authentication, user management, distributed architecture, etc.). The MVP will index files on a local filesystem (or designated folders) and serve search queries via a local web UI. Optional phases may extend it to multi-user/team scenarios, but initial scope is **desktop web app** on one host. 

## MVP Feature List  
- **Document Ingestion:** Detect and import files (PDF, DOCX, XLSX, PPTX) from a watched directory or manual upload.  
- **Text Extraction:** Use file-specific parsers to extract text: PDFs (via PyMuPDF or PDFPlumber), Word (.docx), Excel (.xlsx via OpenPyXL/Pandas), and PowerPoint (.pptx via python-pptx). Apply OCR (via OCRmyPDF + Tesseract) on scanned PDFs as a fallback【11†L49-L57】【25†L157-L164】.  
- **Chunking:** Split extracted content into semantically coherent chunks. Use **structure-aware** rules: keep headings, lists, tables, and code blocks intact when possible. Apply a sliding window overlap (e.g. 10–20% of token limit) between adjacent chunks to preserve context. Smart chunking ensures no topic cross-over (e.g. sections stay within a chunk)【15†L279-L284】.  
- **Embedding & Indexing:** Generate embeddings for each chunk (using a sentence-transformer or open model). Store vectors in Qdrant (open-source vector DB) and metadata in SQLite. Also index chunk text with a keyword search (e.g. Whoosh or Qdrant’s built-in text payload filtering). Qdrant is chosen for its high RPS/low-latency vector search【7†L168-L172】【40†L129-L134】.  
- **Search API:** Implement a RESTful search endpoint via FastAPI. On query: embed the query, retrieve nearest neighbors from Qdrant, apply any keyword filtering, and optionally rerank results.  
- **Frontend UI:** A minimal web interface with a search box, filters (file type, date, etc.), paginated results, and snippet previews. Each result shows file name, and a short highlighted excerpt.  
- **Live Updates:** A file-watcher that auto-ingests new/changed files without restarting.  
- **Basic Security:** Runs locally with no external access (no auth). Future versions may add token-based access if multi-user.  

Optional enhancements (post-MVP) include multi-user support, LLM-based reranking, multi-modal search (image OCR), and more.

## Phased Implementation Plan  

### Phase 1: Core Ingestion & Parsing (2 weeks)  
- **Deliverables:** File-watch service; parsers for PDF (text layer only), DOCX, XLSX, PPTX text; SQLite schema for file/metadata; simple full-text index for chunks.  
- **Acceptance Criteria:** Can ingest ~100 documents of each type, extract raw text and store in DB; searchable by exact keyword on file name/content; handling of plain-text PDFs.  
- **Complexity:** *Low–Medium.* Focus on standard library usage (PyMuPDF, python-docx, openpyxl, python-pptx). No embedding or UI yet.

### Phase 2: Embedding & Vector Index (2 weeks)  
- **Deliverables:** Chunking module (structure-aware split); embedding pipeline (e.g. sentence-transformers or OpenAI). Qdrant setup: create collections, upload chunk vectors + metadata.  
- **Acceptance Criteria:** Each document is chunked (e.g. ~500-token pieces) and indexed into Qdrant. Vector search returns sensible results (top matches include semantically similar chunks).  
- **Complexity:** *Medium.* Requires choosing/finetuning chunk size (see chunking guidelines【15†L260-L268】) and embedding model. Write scripts to bulk-index vectors. 

### Phase 3: Search API & Basic UI (2 weeks)  
- **Deliverables:** FastAPI endpoints (`/search` with query parameter, `/docs/{id}` to fetch content). Frontend prototype (HTML/JS) with search box, result list, snippet previews.  
- **Acceptance Criteria:** User can search terms/phrases and get ranked results. Snippets should highlight query words. Filtering by metadata works (e.g. file type). Entire flow (query → API → UI) is functional.  
- **Complexity:** *Medium.* Backend (FastAPI) is straightforward and async-capable (FastAPI popular for this use【36†L61-L67】). UI can be minimal (Bootstrap or simple layout). Focus on correctness and integration testing.

### Phase 4: Advanced Ingestion & OCR (2 weeks)  
- **Deliverables:** OCR integration: run OCRmyPDF (Tesseract) on image-only PDFs, embed returned text. Improved PPTX parsing: use python-pptx to extract speaker notes, table content, slide text【23†L12-L14】【22†L69-L77】. Multi-sheet Excel text extraction. Bulk document import script.  
- **Acceptance Criteria:** Scanned PDFs yield searchable text. PPTX files return both slide text and notes in search. No data loss for tables/lists. All common file formats handled robustly.  
- **Complexity:** *High.* OCR setup can be slow (Tesseract on CPU), slides have nested shapes, notes require special API. Testing needed on varied docs.

### Phase 5: Search Enhancements & Filtering (2–3 weeks)  
- **Deliverables:** Add sparse keyword index (e.g. BM25) to complement vector search; implement hybrid ranking (combine score). Metadata model: tag chunks with filename, author, date, tags; allow UI filters. Caching layers: cache query embeddings and frequent results. Optionally integrate a light re-ranker model (e.g. MiniLM cross-encoder).  
- **Acceptance Criteria:** Hybrid search outperforms pure-vector (finds exact matches when relevant). Filters (e.g. by date, file type) narrow results correctly. Caching significantly speeds repeated queries.  
- **Complexity:** *High.* Hybrid ranking design, cache logic, and reranker integration require careful tuning. Must validate with example queries to ensure precision.

### Phase 6: Optional Advanced Features (4+ weeks)  
- **Deliverables:** Contextual retrieval (e.g. retrieval using prior queries/session). Reciprocal Rank Fusion (RRF) to combine multiple embedding models. Admin UI (index stats, logs). If multi-user, add simple token login or connect to LDAP/SSO.  
- **Acceptance Criteria:** Demonstrable improvement from reranking or multi-model fusion (e.g. benchmark queries). System scales to modest loads (tens of users) with caching. Security in place for user access if enabled.  
- **Complexity:** *Very High.* These are add-ons for an “enterprise-grade” product. Each adds significant engineering (e.g. user management, performance tuning).

## Architecture Diagram  
```mermaid
graph LR
  %% Ingestion Pipeline
  A[File System Watcher] --> B[Parser (PDF, DOCX, PPTX, XLSX)]
  B --> C[Content Chunks]
  C --> D[Embedding Model]
  C --> E[SQLite (Metadata)]
  D --> F[Qdrant (Vector DB)]
  E --> F

  %% Query Flow
  U[User Web UI] -->|Query| API[FastAPI Backend]
  API --> F
  API --> E
  F --> API
  E --> API
  API --> U

  %% Storage
  style F fill:#ffffcc,stroke:#333,stroke-width:1px
  style E fill:#ccffcc,stroke:#333,stroke-width:1px
  style D fill:#ffcccc,stroke:#333,stroke-width:1px
  style B fill:#e0e0ff,stroke:#333,stroke-width:1px
```
- **Components:** The watcher detects new/changed files and triggers parsing. Each file’s text is broken into chunks (preserving headings, lists, etc.)【15†L279-L284】. Chunks are embedded via a Python model (e.g. Sentence-BERT or similar) and loaded into Qdrant. The SQLite DB stores chunk metadata (source file, chunk boundaries, any file tags) for filtering.  
- **Query:** The user’s query hits the FastAPI backend, which generates a query embedding and retrieves nearest neighbors from Qdrant, applying any metadata filters. The payload from Qdrant (text snippets) is returned alongside any keyword search results. The frontend displays them in ranked order.

## Recommended Tech Stack  
- **Language:** Python (well-supported ML and parsing libraries).  
- **Backend:** **FastAPI** (Python) – high-performance async API framework, widely used for semantic search (e.g. tutorials combine FastAPI + embeddings【36†L61-L67】). Enables quick development and easy Dockerization.  
- **Vector DB:** **Qdrant** – open-source, purpose-built Rust-based vector database. Benchmarks show Qdrant achieves highest throughput and lowest latency among peers【7†L168-L172】. It supports HNSW indexing and payload filtering. *Alternative:* Elasticsearch (has vector plugin) is viable if already in use【40†L129-L134】, but it has slower vector indexing (10× slower on large loads【7†L170-L173】) and heavier overhead. Other options (Milvus, Weaviate) are also open-source but Qdrant strikes a good performance–ease balance.  
- **Keyword Search:** Lightweight inverted-index (e.g. Whoosh or SQLite FTS) for sparse matching. Qdrant itself now supports hybrid search, so we may use it for text payload filters.  
- **Storage:** SQLite (file DB) for metadata (file references, chunk IDs) – zero setup and reliable for single-user. If scaling up, replace with PostgreSQL or Elasticsearch for text queries.  
- **Ingestion Libraries:**  
  - *PDF:* PyMuPDF or PDFPlumber for text; **OCRmyPDF** + Tesseract for images/PDFs【11†L49-L57】【25†L157-L164】.  
  - *DOCX:* `python-docx` for Word docs.  
  - *XLSX:* `openpyxl` or `pandas` for Excel sheets, converting cells to text.  
  - *PPTX:* `python-pptx` – supports slide shapes, tables, and notes. (Speaker notes can be accessed via `slide.notes_slide`【22†L69-L77】.) For example, tutorials show extracting shapes, tables, and notes text with python-pptx【23†L12-L14】.  
- **Embeddings:** Sentence-Transformer models (e.g. all-mpnet-base-v2) or cloud (e.g. OpenAI). The MVP can start with an open model; later you may swap to a commercial API for higher quality.  
- **Caching:** Use in-memory or Redis cache for query embeddings and frequent results to speed up repeated queries. Embed results (chunks) may be cached in SQLite or local disk to avoid recomputing.

## Ingestion Pipeline Details  
- **File Watcher:** Monitor target folders for new/deleted files (e.g. using `watchdog`). On change, enqueue for processing.  
- **Parsing:** Based on extension:  
  - *PDF:* Use PyMuPDF or PDFPlumber to extract text if PDF has text layer. If not (scanned), invoke OCRmyPDF (Python) which uses Tesseract under the hood【11†L49-L57】【25†L157-L164】. OCRmyPDF adds a searchable text layer to PDFs.  
  - *DOCX/XLSX:* Use `python-docx` and `openpyxl/pandas` to extract paragraph and table text.  
  - *PPTX:* Use `python-pptx`: loop through `presentation.slides`, then through `slide.shapes`. For each shape with text frame, extract text. Also extract `slide.notes_slide.notes_text_frame.text` for speaker notes【22†L69-L77】. Concatenate slide title, bullet text, and notes as one logical chunk if needed.  
- **Chunking Strategy:** Use structure-aware splitting. First partition by headings, slides, or sections. Then further split large sections into 512–1024 token chunks. Apply overlap (e.g. 50–100 tokens) between chunks. This avoids breaking sentences and keeps related content together【15†L279-L284】. For example, a PowerPoint slide might become one chunk with its notes; a long doc chapter might be broken at subheadings.  
- **Embeddings:** After chunking, feed each chunk into a transformer encoder (e.g. `sentence-transformers/all-mpnet-base-v2`). Cache embeddings (e.g. in SQLite) so re-indexing the same chunk is skipped. Choose dimension ~768 for good balance. (For a quick start, one can use OpenAI’s `text-embedding-3-small` which has 1536 dimensions【2†L67-L70】.)  
- **Indexing:** Bulk-insert chunk vectors into Qdrant. Also store chunk ID and file metadata as “payload” in Qdrant points for filtering. In SQLite, record file path, file type, chunk start/end positions, etc., to support UI preview and filtering.

## Chunking Strategy  
Chunking deeply impacts search quality【15†L260-L268】. We will use **“smart chunking”**:  
- **Content-aware splits:** Keep each chunk within one document section or slide. For example, a slide’s text and notes form one chunk, so results from Qdrant don’t mix unrelated topics【15†L279-L284】.  
- **Size & Overlap:** Aim for ~500 tokens per chunk (512 BPE tokens) as a starting point. Apply a sliding window overlap (e.g. 50–100 tokens or ~10–20%) between chunks. Overlap is a blunt but effective way to prevent splitting relevant content at boundaries【15†L260-L268】.  
- **Hierarchical splitting:** First split by explicit boundaries (headings, pages, slides), then further if too large. Merge very small blocks (e.g. isolated bullet points) with adjacent text if needed.  
This approach ensures no mid-sentence cuts and preserves semantic coherence, improving retrieval precision【15†L260-L268】.

## Indexing & Search Design  
- **Hybrid Retrieval:** Implement both dense (semantic) and sparse (keyword) search. For dense search, use cosine or dot-product in Qdrant. For sparse, use a simple inverted index (like Whoosh or Qdrant’s full-text payload filtering). At query time, fetch top-*k* from both methods and merge/rerank. Hybrid approaches often yield better relevance.  
- **Embedding Models:** Table below compares candidates:

  | Model                  | License       | Dim | Characteristics                             |
  |------------------------|---------------|-----|---------------------------------------------|
  | **OpenAI text-embedding-3-small** | Closed (OpenAI) | 1536 | Widely used baseline【2†L67-L70】 (English, high quality).            |
  | **EmbeddingGemma-300M** (Google) | Apache-2.0    | 768  | Multilingual (100+ langs); MRL dims 768→256【27†L108-L116】. Lightweight. |
  | **Jina Embeddings v4** | CC-BY-NC-4.0  | 2048 | Multimodal, 30+ langs; supports images and text【27†L146-L153】. Non-commercial. |
  | **all-mpnet-base-v2**  | Apache-2.0    | 768  | Open (Sentence-Transformers); strong English performance【30†L215-L223】. |
  | **Nomic Embed Text V2** | Apache-2.0   | 768  | Multilingual (~100 langs); MoE architecture, open weights【30†L280-L288】. |

  (Source: vendor blogs【27†L108-L116】【30†L215-L223】 and RAG guides【2†L67-L70】.) Choose one or more; dimensionality 768–1536 is typical. Precompute embeddings and consider PCA/quantization for storage if needed.  
- **Vector DB Choice:** Qdrant is prioritized for high-performance semantic search. Benchmarks show Qdrant “achieves highest RPS and lowest latencies” across scenarios【7†L168-L172】. Elasticsearch is an alternative (it supports vector fields and RBAC), but it lags in indexing speed【7†L170-L173】【40†L129-L134】. If an organization already has Elastic-stack infrastructure, integration is possible, but it’s not vector-specialized. Other vector DBs (Milvus, Weaviate, Pinecone) are noted in surveys, but Qdrant’s open-source license and ease of local deployment suit this scope. A brief comparison:

  | Vector DB    | License    | Strengths                                    | Notes                           |
  |--------------|------------|----------------------------------------------|---------------------------------|
  | **Qdrant**   | Apache-2.0 | Purpose-built for vectors; very high RPS & low latency【7†L168-L172】. Good filtering.  | Excellent performance on large vector loads. |
  | **Elasticsearch** | Elastic (Apache + proprietary) | Mature full-text search; RBAC; supports streaming + batch vectors【40†L83-L88】【40†L109-L113】. | Slower indexing (10× slower on >10M vectors)【7†L170-L173】.  |
  | **Weaviate** | BSD        | Vector + metadata; GraphQL API; filters.   | Still improving; good semantic features. |
  | **Milvus**   | LF-Milvus  | High indexing throughput; GPU acceleration. | Fast indexing but may need more tuning. |
  | **SQLite (fts)** | Public Domain | Built-in full-text; trivial setup.  | For keyword fallback or small corpora only. |

- **Re-ranking (Optional):** A small transformer (e.g. MiniLM cross-encoder) can rerank top results for higher precision. This is computationally heavier and can be phase 6.  

## Metadata Model & Filtering  
Each chunk in Qdrant will carry a payload (metadata) that includes: source filename, file type (PDF/DOCX/etc.), creation/modification dates, and any manually added tags (e.g. department, project). These enable faceted filtering. For example, a user could limit search to PDFs or to documents from the last year. We store the same metadata in SQLite for quick front-end filters and lookups. Qdrant allows filtering by payload fields before/after vector search, so combination filters (e.g. “business” tag AND similar to query) are supported.

## Incremental Auto-Ingest (File Watcher)  
Implement a background daemon (or thread) monitoring designated folders (via inotify/watchdog). When new files appear, it automatically runs the ingestion pipeline (parsing, chunking, indexing). If files are modified or deleted, the index is updated/deleted accordingly. This keeps the search index in sync with the filesystem. Checkpointing (e.g. time-stamps or database of processed files) ensures idempotence.  

## Caching Strategy  
- **Embedding Cache:** Maintain a cache of chunk text → embedding (e.g. in SQLite or files), so re-running ingestion or duplicate content isn’t recomputed. This speeds up incremental updates.  
- **Query Cache:** Cache recent query embeddings and top-k results. If a new query is very similar to a cached one (cosine distance above a threshold), reuse results【2†L67-L70】. This “semantic caching” can cut repeated latency.  
- **Front-end Cache:** Browser-side caching of static assets and maybe last search results (with ETag) to improve responsiveness.  

## Storage Choices  
- **Vector Store:** Qdrant (on-disk or in a container) stores vectors and payload.  
- **Metadata:** SQLite DB (file-based) with tables for files, chunks, and optionally user settings. SQLite suffices for single-user; if scaling, PostgreSQL or Elasticsearch are alternatives.  
- **Static Files:** Files remain on disk; only extracted text/chunks are stored in DBs. Previews are fetched from source files or stored in a minimal cache.  

## Security / Auth Assumptions  
Assuming a **single-user local deployment**, we do not implement formal authentication. The service runs on `localhost` and is not network-exposed by default. For future multi-user scenarios, consider adding simple token-based auth or integrating with corporate SSO. Ensure any API keys (e.g. for external embedding APIs) are kept in a secure config file, and use HTTPS if hosting on a network-accessible server. 

## Testing & QA Plan  
- **Unit Tests:** For each parser (PDF, DOCX, etc.), ensure known documents produce correct text/chunks. Test OCR pipeline on sample scans.  
- **Integration Tests:** After indexing a test corpus, run known queries and verify expected documents rank highly. Use automated scripts to simulate end-to-end queries.  
- **Performance Tests:** Benchmark indexing and query latency on a realistic dataset (e.g. 10k chunks). Ensure Qdrant and API meet p50/p99 targets (e.g. <100ms per query).  
- **Safety Checks:** Handle binary or corrupted files gracefully (skip with error log). Monitor memory usage (Qdrant heavy load).  
- **Continuous Integration:** Set up automated tests on push. Include data validation (e.g. no broken JSON in payloads).  

## Minimal Frontend UI Spec  
- **Search Bar:** Text input (with optional voice search icon).  
- **Filters Panel:** Checkboxes or dropdowns for file types, date range picker, and tags.  
- **Results List:** For each hit, show filename, document type icon, date, and a highlighted snippet. Click expands context or opens the file location.  
- **Pagination or Infinite Scroll:** Show 10–20 results per page.  
- **Preview Pane:** (Optional) On selecting a result, show the full chunk or page with highlights of query terms.  
- **Layout:** Clean, responsive design; can be simple HTML/Bootstrap or React/Vue based on resources. No need for heavy frameworks for MVP.  

## Developer Deliverables  
- **API Endpoints:** Documented OpenAPI (Swagger) spec. At minimum: `/search?q=...&filters=...` and `/doc/{id}`. Provide examples of request/response.  
- **Ingestion Scripts:** Python modules for file-watcher, parsing, chunking, embedding, and indexing. Include a CLI or service entry point.  
- **Schema & Migration:** SQLite schema (and migrations if using a more advanced DB). Seed script for any initial setup.  
- **Docker/Env:** Dockerfile or environment setup (requirements.txt, caching, etc.) to run all components (FastAPI, Qdrant, SQLite).  
- **Infrastructure:** If needed, Kubernetes/Docker Compose configs (especially if separating Qdrant container). Basic cluster not required for single-machine MVP.  
- **Tests:** All test scripts and sample data; instructions to run tests.  
- **Documentation:** README detailing installation, config options, usage examples.  
- **Security:** (If applicable) Instructions for setting up SSL or auth, even if disabled by default.  

## Optional Advanced Features  
- **Re-ranker:** Use a cross-encoder (e.g. MiniLM-v2) to fine-rank top N candidates from Qdrant for better precision.  
- **Reciprocal Rank Fusion (RRF):** Combine scores from multiple retrieval models (dense vs sparse or multiple embedding models) to diversify results.  
- **Contextual/Aware Search:** Implement “search history” context or follow-up queries (like querying within a topic).  
- **Multi-User:** Multi-index or RBAC (e.g. isolate each user’s docs). This requires auth and permission checks.  
- **Analytics Dashboard:** Query logs, per-file usage stats, index size.  

## Comparison Tables  

| **Embedding Model**     | **License**  | **Dim** | **Languages / Notes**                                |
|-------------------------|--------------|---------|------------------------------------------------------|
| OpenAI text-embedding-3-small | Closed (OpenAI) | 1536    | English; widely-used baseline【2†L67-L70】                |
| EmbeddingGemma-300M     | Apache-2.0   | 768 (→128 MRL) | Multilingual (100+ langs); compact (300M params)【27†L108-L116】 |
| Jina Embeddings v4      | CC-BY-NC-4.0 | 2048    | 30+ languages; multimodal (text+images); NC license【27†L146-L153】【27†L159-L163】 |
| all-mpnet-base-v2       | Apache-2.0   | 768     | English; strong performance (sentence-transformers)【30†L215-L223】 |
| Nomic Embed Text V2     | Apache-2.0   | 768     | Multilingual (~100 langs); MoE model; open-sourced【30†L280-L288】   |

| **Vector Database**     | **License**  | **Key Strengths**                           | **Notes**                                               |
|-------------------------|--------------|--------------------------------------------|---------------------------------------------------------|
| **Qdrant**              | Apache-2.0   | High throughput, low latency【7†L168-L172】; good hybrid search | Best for large vector loads【40†L129-L134】             |
| **Elasticsearch**       | Elastic (Apache + SSPL) | Mature full-text engine; RBAC; vector support【40†L83-L88】【40†L109-L113】 | Slower vector indexing (10× on large data)【7†L170-L173】 |
| **Weaviate**            | BSD          | GraphQL API, hybrid text+vector, built-in filters | Active development; plugin-based modules             |
| **Milvus**              | LF-Milvus    | Fast indexing (esp. GPU); multi-index support | Good for very large corpora; see benchmarks【7†L170-L176】   |
| **SQLite (FTS)**       | Public domain| Embedded FTS for keywords; zero-config     | Suitable only for small corpora or caches.              |

| **OCR Option**         | **Type**     | **Language Support**  | **Notes**                                              |
|-------------------------|--------------|-----------------------|--------------------------------------------------------|
| **Tesseract OCR**       | Open (Apache-2.0) | 100+ languages       | Best for printed text on CPU; struggles on handwriting and complex layouts【25†L157-L164】. |
| **PaddleOCR**           | Open (Apache-2.0) | Multilingual        | Strong Chinese/English and table detection; GPU-accelerated【9†L63-L69】.                 |
| **OCRmyPDF**            | Open (Apache-2.0) | Uses Tesseract langs | Python tool that auto-adds searchable text layer to PDFs【11†L49-L57】 (needs Ghostscript/Tesseract). |
| **Google Vision OCR**   | Cloud (Proprietary) | Many languages     | High accuracy; cloud API (incurs cost, data privacy concerns).               |
| **AWS Textract**        | Cloud (Proprietary) | Many languages     | Structured OCR; paid.                                 |

## Prioritized TODO Checklist  
1. [ ] **Environment Setup:** Python environment, Qdrant server, SQLite.  
2. [ ] **File Watcher & Basic Parsers:** Ingest PDF/DOCX/XLSX/PPTX, extract raw text.  
3. [ ] **Initial Indexing:** Chunk text (naive split), store in SQLite.  
4. [ ] **Search API (text-only):** FastAPI endpoint returning keyword matches.  
5. [ ] **Chunking Module:** Implement structure-aware splitting (headings, slides).  
6. [ ] **Embedding Integration:** Select model; generate chunk embeddings.  
7. [ ] **Qdrant Setup:** Create collection; index vectors+payloads.  
8. [ ] **Hybrid Search Endpoint:** Return combined vector+keyword results.  
9. [ ] **Frontend UI:** Build search page with results display.  
10. [ ] **OCR Pipeline:** Integrate OCRmyPDF for scanned PDFs.  
11. [ ] **PPTX Enrichment:** Extract speaker notes and table content.  
12. [ ] **Metadata Filtering:** Add filters (type, date, tags) in API/UI.  
13. [ ] **Caching Layer:** Embed/result caching to speed queries.  
14. [ ] **Testing:** Write unit/integration tests, benchmarks.  
15. [ ] **Documentation:** Write README, diagrams, API spec.

## MVP Timeline (Weeks)  
- **Weeks 1–2:** Phases 1–2 (ingestion, parsing, vector indexing).  
- **Weeks 3–4:** Phase 3 (API + basic UI).  
- **Weeks 5–6:** Phase 4 (OCR, PPTX enhancements).  
- **Weeks 7–8:** Phase 5 (hybrid search, filtering, caching).  
- **Weeks 9+:** Optional Phase 6 (reranker, multi-user, polish).  

This schedule assumes one or two dedicated developers and may be adjusted based on team size. Early weeks focus on core functionality; later weeks add enterprise robustness and advanced features.

**Sources:** Technology choices and design patterns are based on recent best practices and official documentation【7†L168-L172】【11†L49-L57】【15†L279-L284】【36†L61-L67】. The tables above summarize comparative data from authoritative blog posts and benchmarks【25†L157-L164】【30†L215-L223】【40†L129-L134】. All cited references are from 2024–2026.