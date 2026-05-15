# DocSense — 技術細節簡報筆記

> 給簡報者的工程筆記。涵蓋目前實作、選型理由、與外部研究對比後的可改進方向。
> 適用對象：後端 / Search / RAG 領域工程師。
> 來源時點：2026-05；外部資料以英文社群為主。

---

## 0. 三句話定位

- **產品**：本機文件混合搜尋（PDF / DOCX / XLSX / PPTX），單檔 `start.py` 啟動、無 Docker、無雲服務、無 PyTorch。
- **核心技術棧**：FastAPI + watchdog + fastembed (ONNX) + Qdrant binary (HTTP) + SQLite FTS5 + RRF 融合。
- **設計目標**：對企業桌機環境友善（離線、可打包成 `.exe`、~500 MB 安裝足跡），同時提供「向量 + 關鍵字 + 混合」三種檢索模式。

---

## 1. 系統架構（目前實作）

```
┌──────────────────────────────────────────────────────────────────┐
│  start.py  (single entry-point)                                  │
│    1. download Qdrant binary  (GitHub releases, first run only)  │
│    2. spawn Qdrant subprocess (HTTP :6333, env-var config)       │
│    3. uvicorn FastAPI in background thread                       │
│    4. open browser → http://localhost:8000                       │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  FastAPI lifespan                                               │
│    init_db()  ─►  ensure_collection()  ─►  start_watcher()      │
│      │                │                          │              │
│      ▼                ▼                          ▼              │
│   SQLite/FTS5      Qdrant                  watchdog observer    │
│   (db/*.db)        (qdrant_data/)          (watched_docs/)      │
│                                                                 │
│    background: index_all()  +  _prewarm_embedder()              │
└─────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Index pipeline  (indexer/pipeline.py)                          │
│    extract → chunk → embed → atomic replace (SQLite + Qdrant)   │
│      ▲              ▲           ▲                               │
│      │              │           └─ fastembed (ONNX)             │
│      │              └─ char-based 1500 / 150 overlap            │
│      └─ pymupdf / python-docx / openpyxl / python-pptx          │
└─────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Search pipeline  (app/routes/search.py)                        │
│    mode=hybrid:  vector ‖ FTS5  ─►  RRF (k=60)  ─►  normalise   │
│    mode=vector:  Qdrant cosine top-K                            │
│    mode=keyword: FTS5 BM25 (trigram tokenizer, LIKE fallback)   │
└─────────────────────────────────────────────────────────────────┘
```

### 元件職責一覽

| 元件 | 檔案 | 重點 |
|------|------|------|
| 啟動腳本 | [start.py](start.py) | Qdrant binary 自動下載 + 子程序 + uvicorn 背景執行緒 |
| FastAPI lifespan | [src/app/main.py](src/app/main.py) | `init_db → ensure_collection → start_watcher`；index/embedder 放背景，server 立即可服務 |
| 搜尋路由 | [src/app/routes/search.py](src/app/routes/search.py) | `_rrf_fuse` 同時記錄 `semantic_score` / `bm25_score` / `score` |
| 索引路由 | [src/app/routes/index.py](src/app/routes/index.py) | `/api/index`、`/api/status`、`/api/file/{doc_id}` |
| 向量儲存 | [src/app/services/qdrant_store.py](src/app/services/qdrant_store.py) | HTTP-only Qdrant client；point ID = `UUID5(DNS, "{doc_id}:{i}")` 可重現 |
| FTS5 儲存 | [src/app/services/fts.py](src/app/services/fts.py) | trigram tokenizer + 觸發器同步；schema version=2 自動 rebuild |
| Embedder | [src/app/services/embedder.py](src/app/services/embedder.py) | `fastembed.TextEmbedding` 單例，threads/batch 由 env 控制 |
| 抽取器 | [src/indexer/extractor.py](src/indexer/extractor.py) | pymupdf / python-docx / openpyxl / python-pptx |
| 索引管線 | [src/indexer/pipeline.py](src/indexer/pipeline.py) | sha256 doc_id、mtime skip、per-path lock、atomic replace |
| 檔案監看 | [src/indexer/watcher.py](src/indexer/watcher.py) | 單執行緒 worker + 1s debounce + 檔案大小穩定檢測 |

---

## 2. 關鍵技術選型與理由

### 2.1 Embedding：`BAAI/bge-small-en-v1.5` (384-dim, ONNX)
- **檔案**：[src/app/config.py:35](src/app/config.py#L35)、[src/app/services/embedder.py](src/app/services/embedder.py)
- **選它的原因**：~130 MB、ONNX、CPU 推論可接受、MTEB v1 中小型模型 SOTA、向量維度小 → Qdrant 儲存便宜。
- **執行細節**：threads 上限 = `min(4, cores/2)`、batch 預設 64；用 env `DOCSENSE_EMBED_THREADS / DOCSENSE_EMBED_BATCH` 覆蓋；以「小批次串流」避免 ONNX 暫存張量在大 PDF 上膨脹到多 GB。
- **限制**：英文導向（CJK 表現遠遜於專用模型）、512 token 視窗、固定維度無法做 Matryoshka 截斷。

### 2.2 Chunking：固定字元數 1500 / overlap 150
- **檔案**：[src/app/config.py:42-43](src/app/config.py#L42-L43)、[src/indexer/extractor.py:19](src/indexer/extractor.py#L19)
- **理由**：1500 字 ≈ 350–500 token，安全壓在 bge-small 的 512 上限以內；對 6 MB 技術 PDF 由舊版 ~7000 chunk 降到 ~2000，embedding 速度約 3 倍。
- **缺點**：純字元切，沒看句子 / 段落 / 標題邊界，跨 chunk 的代名詞與表格列容易斷裂。

### 2.3 向量儲存：Qdrant 二進位 + HTTP
- **檔案**：[src/app/services/qdrant_store.py](src/app/services/qdrant_store.py)、[start.py:140](start.py#L140)
- **理由**：不要 Docker、不要 gRPC（少一條依賴鏈）、Cosine + 384-dim、Filter 走 payload key（`doc_id`）支援刪除整份文件。
- **設計亮點**：point ID 用 `UUID5(DNS, "{doc_id}:{chunk_index}")`，重新索引時可冪等覆蓋；search 失敗只 log warning、回傳空陣列，讓 hybrid 自動退化成 keyword-only。

### 2.4 關鍵字檢索：SQLite FTS5 + trigram tokenizer
- **檔案**：[src/app/services/fts.py](src/app/services/fts.py)
- **理由**：FTS5 內建 BM25；trigram tokenizer 對中文（CJK）友善（unicode61 對純中文幾乎不能用）；用 `content=chunks` 模式 + 觸發器同步，免維護兩份資料。
- **小細節**：
  - 不裝 trigram 的環境會 fallback 到 `unicode61 remove_diacritics 2`，並用 `PRAGMA user_version` 做一次性 rebuild（`_FTS_SCHEMA_VERSION = 2`）。
  - 1–2 字 token（如 `AI`、`中文`）trigram 無法索引，退化到 `LIKE '%...%'` 子字串掃描，保持召回率。
  - 查詢字串用 `"phrase"` 形式包起來，避免 FTS5 運算子注入導致 syntax error。

### 2.5 混合融合：Reciprocal Rank Fusion (k=60)
- **檔案**：[src/app/routes/search.py:28](src/app/routes/search.py#L28)
- **理由**：rank-based，免去 cosine 與 BM25 分數尺度不一致的麻煩；對極端值不敏感；產業常用 k=60 經驗值。
- **附加處理**：fuse 完再把最頂分數歸一化為 1.0，並同時保留 `semantic_score`（cosine）與 `bm25_score`（normalised BM25）讓 UI 解釋來源。
- **fallback 行為**：當 Qdrant 斷線，`search_vector()` 回空陣列 → RRF 還是會工作（只是 dense 那條沒貢獻）→ 等同 keyword-only。

### 2.6 增量索引與檔案監看
- **檔案**：[src/indexer/pipeline.py](src/indexer/pipeline.py)、[src/indexer/watcher.py](src/indexer/watcher.py)
- **doc_id**：`sha256(absolute_path)[:16]`，跨 rerun 穩定。
- **skip 判斷**：`abs(existing_mtime - file_mtime) < 1.0s`；`index_all()` 用一次 SQL 拉所有 mtime 進記憶體，避免 N 次 round-trip。
- **atomic replace**：先 `DELETE FROM documents`（CASCADE → chunks → FTS triggers）+ Qdrant `delete_doc` → 再 insert，避免「半新半舊」狀態。
- **watcher debounce**：events 入單一 queue → 1 秒 debounce → 等檔案大小穩定（防止 Word/Excel 還在寫盤）。
- **per-path lock**：同檔多 event 不會並行 embed，否則大 PDF 雙倍記憶體。

### 2.7 打包與啟動
- **檔案**：[start.py](start.py)、[DocSense.spec](DocSense.spec)、[docsense_launcher.py](docsense_launcher.py)、[docsense.bat](docsense.bat)
- PyInstaller 把使用者資料目錄（`watched_docs/`、`db/`、`qdrant_*`）放在 `.exe` 旁，而不是 `_internal/`，便於使用者管理。
- `start.py` 用 GitHub Releases API 抓對應平台 Qdrant 二進位（Windows/macOS/Linux x86_64/arm64），首跑 ~35 MB。

---

## 3. 數據與容量觀感（既有設定）

| 項目 | 設定 / 數量 |
|------|-------------|
| Chunk size / overlap | 1500 字 / 150 字 |
| Embedding 維度 | 384（Cosine） |
| RRF k | 60 |
| 預設 `limit` | 10，最大 50 |
| 候選池 | hybrid 模式每路抓 `limit * 2 = 20` 再融合 |
| Qdrant port | 6333 |
| API port | 8000 |
| FTS5 schema version | 2（trigram） |

---

## 4. 已知限制與痛點（簡報時可主動點出）

1. **Embedding 只擅長英文**：bge-small-en-v1.5 對中文表現弱，混合中英文文件的語意檢索品質受限。
2. **固定 chunk 切壞語意邊界**：表格列、條列項、跨頁段落會被切碎。
3. **沒有 reranker 第二階段**：top-20 候選直接 RRF 出 top-10，沒有 cross-encoder 重排，相關性天花板較低。
4. **沒有 OCR**：掃描型 PDF 完全抓不到字（pymupdf 直接拿不到 text layer 就空）。
5. **沒有 query 改寫**：使用者輸入一字不動丟向量化；模糊查詢或自然語言問句召回率較差。
6. **沒有自動評估指標**：沒有 recall@k / NDCG / MRR 的 ground truth，調整參數靠肉眼。
7. **Qdrant 為獨立 process**：需要 ~35 MB 二進位 + 額外 port + 子程序生命週期；對「真正單檔」的純粹性是妥協。
8. **`pyproject.toml` 與 `requirements.txt` 嚴重不一致**：`pyproject.toml` 列了 `sentence-transformers`、`ocrmypdf`、`sqlalchemy` 等實際未使用的依賴。

---

## 5. 可改進方向（依「投入 / 效益 / 風險」排序）

> 排序原則：先列可立即拿到顯著召回率／相關性收益的改動，再列工程性優化。

### 5.A 多語言 embedding 升級 → `BAAI/bge-m3` 或 multilingual-e5
**痛點**：bge-small-en-v1.5 對中文 / 中英混合場景顯著弱化。
**做法**：
- 換成 `BAAI/bge-m3`（支援 100+ 語言、最長 8192 token、可同時產出 dense / sparse / multi-vector 三種表示）。
- 或更輕量的 `intfloat/multilingual-e5-small`（384-dim）以保留現有 Qdrant collection 維度。
**評估**：bge-m3 MTEB 多語成績明顯優於 bge-small，但模型大小較高（~570 MB）、需要重新 embed 全部既有文件。
**風險**：維度若改變需要 Qdrant collection 重建。建議先在 `EMBED_MODEL` 旁加 `EMBED_VERSION`，並在啟動時偵測維度不符就自動 rebuild collection。
**參考**：[BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)、[Choosing Embedding Models 2025](https://app.ailog.fr/en/blog/guides/choosing-embedding-models)

### 5.B 第二階段 Cross-encoder Reranker
**痛點**：similarity ≠ relevance，目前 top-20 直接出 top-10，相關性沒有 cross-encoder 級的判斷。
**做法**：
- 在 `_rrf_fuse` 後追加 reranker 步驟，對前 20–50 名做 query-doc pair scoring，重新排序到最後 10 名。
- 候選模型：`BAAI/bge-reranker-v2-m3`（278M、CPU 可跑、多語）、或 `mxbai-rerank-base-v2`（0.5B，RL 訓練，2026 SOTA 級之一）。
**效益**：產業界普遍報告 RAG retrieval P@k 大幅提升（Mixedbread 自報 v2 比 v1 +8 點以上）。
**成本**：每次查詢多一次 cross-encoder forward；CPU 上 20 pair 大約 200–500 ms，可接受。
**風險**：模型體積增加會影響 PyInstaller 打包尺寸；建議做成可選 feature flag。
**參考**：[mxbai-rerank-v2 blog](https://www.mixedbread.com/blog/mxbai-rerank-v2)、[BAAI/bge-reranker-v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3)、[Top Rerankers for RAG](https://www.analyticsvidhya.com/blog/2025/06/top-rerankers-for-rag/)

### 5.C 改良 Chunking 策略
**痛點**：純字元切會破壞語意邊界。
**短期低風險選項（推薦）**：
- 改用「recursive character splitting」按 `\n\n → \n → 。 → 空白` 的優先序切，仍維持 1500 字目標。Vecta 2026 benchmark 顯示 recursive 512 token 在 50 篇學術論文上 end-to-end 69% accuracy，優於 semantic chunking 的 54%（對泛用文件）。
**進階選項**：
- **Late chunking**（Jina AI 2024）：先用 long-context model 對整篇 embed，再用 token offset 切 chunk → 每個 chunk 攜帶整文上下文，對「跨頁代名詞、被切斷的論述」特別有效。
- **Domain-aware semantic chunking**：對法律、臨床等領域，semantic chunking 有顯著優勢（一篇 peer-reviewed clinical study 顯示 87% vs 13%）。
**做法**：在 `extractor.py` 抽象 `Chunker` interface，三種策略共存，並用 env 切換以利 A/B。
**參考**：[Best Chunking Strategies for RAG 2026 (Firecrawl)](https://www.firecrawl.dev/blog/best-chunking-strategies-rag)、[Weaviate Chunking Strategies](https://weaviate.io/blog/chunking-strategies-for-rag)

### 5.D Query rewriting / multi-query / HyDE
**痛點**：使用者打「OEM SLA 條件」之類短詞，dense 搜得到大致語意，但 BM25 完全打不準。
**做法**：
- **Multi-query**：對 LLM（離線可用 Phi-3-mini / Qwen2.5-3B-onnx）請它生成 3 條重寫，三條都跑 retrieval 再融合。FreshQA P@5 +14.46%、HotpotQA multi-hop +8% 的研究數據可佐證。
- **HyDE**：對「短查詢」生成一段假想答案，用該假想答案去 dense retrieval；提升「語意對齊」非「召回廣度」。
- **動態策略**：短查詢用 HyDE，模糊查詢用 multi-query，其他用 query expansion。
**風險**：引入 LLM 推論成本，與「離線無 PyTorch」設計衝突；建議用 ONNX-runtime 上的小型 LLM（如 Phi-3-mini ONNX），或將此功能設為可選。
**參考**：[DMQR-RAG paper](https://arxiv.org/html/2411.13154v1)、[Retrieval is the Bottleneck (HyDE/Multi-Query)](https://medium.com/@mudassar.hakim/retrieval-is-the-bottleneck-hyde-query-expansion-and-multi-query-rag-explained-for-production-c1842bed7f8a)

### 5.E 用稀疏向量（SPLADE）取代 / 補強 FTS5
**痛點**：FTS5 BM25 只看詞頻，無法處理同義詞（「機構」≠「組織」）。
**做法**：用 SPLADE-style 稀疏 embedding（也是 bge-m3 內建能力之一），存進 Qdrant 的 sparse vector 欄位，與 dense vector 同 collection；hybrid 改為 `dense + sparse → RRF`，省掉 SQLite FTS5 一條獨立檢索鏈。
**好處**：SPLADE 對 MS MARCO / TREC 的語意+詞彙混合查詢全面超越 BM25。
**成本**：需要重新 embed；sparse vector 儲存量大；初期可保留 FTS5 當作 fallback。
**參考**：[Hybrid Search Dense + Sparse + RRF (2026)](https://blog.gopenai.com/hybrid-search-in-rag-dense-sparse-bm25-splade-reciprocal-rank-fusion-and-when-to-use-which-fafe4fd6156e)

### 5.F 加入 OCR pipeline（掃描型 PDF）
**痛點**：純圖檔 PDF 抽出來是空字串，直接落到 `"empty"` 分支。
**選項對比**：

| OCR 引擎 | 安裝足跡 | CPU 表現 | 中文 | 評語 |
|----------|---------|---------|------|------|
| Tesseract | 中（系統相依） | 快 | 一般 | 印刷體最穩，複雜版面差 |
| **PaddleOCR** | 中（PaddlePaddle） | 中 | **強** | 多語 + 複雜版面最佳 trade-off |
| RapidOCR | **低**（ONNX） | 快 | 強 | PaddleOCR 模型 ONNX 化版，最貼近本專案「無 PyTorch」精神 |
| Surya / Marker | 高（PyTorch） | 慢 | 強 | 品質高但與離線輕量目標衝突 |

**建議**：選 **RapidOCR**，保留 ONNX-only 路線；在 `_extract_pdf` 偵測 `page.get_text()` 為空時走 fallback OCR。
**參考**：[8 Top Open-Source OCR Models](https://modal.com/blog/8-top-open-source-ocr-models-compared)、[PaddleOCR vs Tesseract](https://www.koncile.ai/en/ressources/paddleocr-analyse-avantages-alternatives-open-source)

### 5.G Embedding 量化（Int8 / Binary）
**痛點**：384-dim × float32 仍佔空間；CPU embedding 是吞吐瓶頸。
**做法**：
- **推論加速**：ONNX dynamic INT8 量化 → embedding 速度 ~3× 提升、誤差 <1.5%（retrieval 任務）。
- **儲存壓縮**：Qdrant 支援 scalar quantization (int8) / binary quantization；對 384-dim 而言 binary 可壓 32× 存量，配合 rerank 階段補回精度。
**何時做**：等改了 reranker 之後（5.B）。reranker 在量化造成的小幅精度損失上，可以把品質補回來。
**參考**：[HuggingFace embedding-quantization blog](https://huggingface.co/blog/embedding-quantization)、[FastEmbed ONNX 2025](https://johal.in/fastembed-onnx-lightweight-embedding-inference-2025/)

### 5.H 替換或內嵌向量庫（移除 Qdrant 子程序）
**動機**：消除「外掛 binary、額外 port、子程序生命週期」這層複雜度。
**候選**：

| 方案 | 模式 | 記憶體 | 延遲 | 評語 |
|------|------|--------|------|------|
| **LanceDB** | 內嵌（in-process） | 4 MB 空閒 / ~150 MB 查詢 | 40–60 ms | 「Vector DB 界的 SQLite」、columnar、磁碟友善 |
| sqlite-vec | SQLite extension | 與 SQLite 同 | 視資料量 | 與現有 FTS5 同一個 DB，工程整合最簡 |
| ChromaDB | 內嵌或 server | 中 | 中 | 開箱即用，社群大 |
| 維持 Qdrant | 子程序 | 400 MB+ | 20–30 ms | 延遲最快，但最重 |

**建議路徑**：
1. 短期：保持 Qdrant 不動，但把切換層抽出來（`VectorStore` interface）。
2. 中期：上 LanceDB 做 A/B；若可接受 +20 ms 換來移除整個 Qdrant subprocess，那就值得換。
3. 長期（最激進）：sqlite-vec + FTS5 同一個 SQLite 檔，整個系統剩下「fastembed + sqlite」兩個依賴。
**參考**：[Vector DB Benchmarks 2026](https://callsphere.ai/blog/vector-database-benchmarks-2026-pgvector-qdrant-weaviate-milvus-lancedb)、[Qdrant vs LanceDB benchmark](https://www.threads.com/@bsunter/post/DQfwyv-iX5z/more-benchmarks-evaluating-qdrant-vs-lance-db-vector-databases-qdrant-is-faster)

### 5.I 評估體系（offline metrics）
**痛點**：目前所有調整靠手感；換 reranker、改 chunk size 不知道是進步還退步。
**做法**：
- 用 RAGAS 3.2 或 DeepEval 2.3 自動從 watched_docs 抽 30–100 個 query/answer 樣本，每次 PR 跑：
  - **retrieval-side**：recall@10、MRR、NDCG@10。
  - **generation-side**（若日後接 LLM 答題）：faithfulness、contextual precision/recall。
- CI（即使本地 pytest）跑一個小型 eval，數字落入紅線就 fail。
**參考**：[RAG Evaluation 2026 (Label Your Data)](https://labelyourdata.com/articles/llm-fine-tuning/rag-evaluation)、[RAG Evaluation Metrics, Frameworks & Testing 2026](https://blog.premai.io/rag-evaluation-metrics-frameworks-testing-2026/)

### 5.J PDF 抽取升級（pymupdf4llm + 表格感知）
**痛點**：`page.get_text("text")` 不保留表格結構，技術文件裡的規格表幾乎不可搜。
**做法**：
- 換成 `pymupdf4llm.to_markdown(...)`，輸出 markdown 自帶表格、標題層級，餵 chunker 時保留結構。
- 對複雜表格密集的文件（規格書、財報）可加 `pdfplumber` 走 table extraction 補充。
**成本**：pymupdf 已在依賴內，pymupdf4llm 是同套件 wrapper，幾乎沒有額外負擔。
**參考**：[PyMuPDF features](https://pymupdf.readthedocs.io/en/latest/about.html)、[7 Python PDF Extractors compared](https://onlyoneaman.medium.com/i-tested-7-python-pdf-extractors-so-you-dont-have-to-2025-edition-c88013922257)

---

## 6. 建議的改進路線圖（漸進、不破壞既有體驗）

| 階段 | 工作 | 預期收益 | 風險 |
|------|------|----------|------|
| **P0（一週內）** | 修 `pyproject.toml`／`requirements.txt` 不一致；加 `.claude/settings.local.json` 入 `.gitignore`；CLAUDE.md 數字對齊 | 工程衛生 | 低 |
| **P1（兩週內）** | 5.J pymupdf4llm + table；5.C recursive chunker；建立 5.I retrieval eval baseline（recall@10 / MRR） | 立即可量化提升 | 低 |
| **P2（一個月）** | 5.A bge-m3 多語 embedding（先用 small 維度版本）；5.B 加上 bge-reranker-v2-m3 第二階段 rerank | 中文場景顯著提升；相關性質變 | 中（要 rebuild collection） |
| **P3（兩個月）** | 5.F RapidOCR fallback；5.D multi-query/HyDE（搭配 Phi-3-mini ONNX） | 覆蓋掃描檔 + 模糊查詢 | 中（增加打包尺寸） |
| **P4（願景）** | 5.H LanceDB 或 sqlite-vec 替換 Qdrant；5.G 量化壓縮儲存 | 架構簡化、足跡縮減 | 高（核心 IO 層改寫） |

---

## 7. 對外簡報建議講法（一頁版）

> 「DocSense 是一套**單檔啟動、完全離線**的企業文件混合搜尋系統。
> 我們把『向量檢索 + 全文檢索』分別交給 Qdrant 與 SQLite FTS5，用 Reciprocal Rank Fusion 將兩條 ranking 融合，並用 fastembed 的 ONNX runtime 把『不需要 PyTorch、不需要 GPU』這條紅線守住。
> 索引由 watchdog 即時觸發，配合 mtime skip、per-path lock、debounced worker，達成『拖檔即搜尋』。
>
> 下一步我們在三個方向投入：(1) 換多語 embedding 與 cross-encoder reranker 把**相關性**拉到 SOTA、(2) 引入 recursive/late chunking 與 query rewriting 把**召回率**打開、(3) 建立 RAGAS-based offline eval 讓上面每一步都有數字背書。」

---

## 8. 引用來源

- Embedding：
  - [BAAI/bge-m3 (Hugging Face)](https://huggingface.co/BAAI/bge-m3)
  - [Best Embedding Models 2025 leaderboard](https://app.ailog.fr/en/blog/guides/choosing-embedding-models)
  - [Choosing an Embedding Model for RAG](https://subhojyoti99.medium.com/how-to-choose-an-embedding-model-for-your-rag-application-379aec761462)
- Chunking：
  - [Best Chunking Strategies for RAG 2026 (Firecrawl)](https://www.firecrawl.dev/blog/best-chunking-strategies-rag)
  - [Chunking Strategies (Weaviate)](https://weaviate.io/blog/chunking-strategies-for-rag)
  - [Text Chunking Strategies Comprehensive Guide](https://atlassc.net/2026/03/30/text-chunking-strategies-for-rag)
- Reranker：
  - [mxbai-rerank-v2 (Mixedbread)](https://www.mixedbread.com/blog/mxbai-rerank-v2)
  - [BAAI/bge-reranker-v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3)
  - [Top 7 Rerankers for RAG (Analytics Vidhya)](https://www.analyticsvidhya.com/blog/2025/06/top-rerankers-for-rag/)
- 向量資料庫：
  - [Vector DB Benchmarks 2026 (CallSphere)](https://callsphere.ai/blog/vector-database-benchmarks-2026-pgvector-qdrant-weaviate-milvus-lancedb)
  - [Best Vector Databases in 2026 (MarkTechPost)](https://www.marktechpost.com/2026/05/10/best-vector-databases-in-2026-pricing-scale-limits-and-architecture-tradeoffs-across-nine-leading-systems/)
  - [LanceDB vs Qdrant (Zilliz)](https://zilliz.com/comparison/qdrant-vs-lancedb)
- Hybrid Fusion：
  - [OpenSearch RRF](https://opensearch.org/blog/introducing-reciprocal-rank-fusion-hybrid-search/)
  - [Hybrid Search Dense + Sparse + SPLADE 2026](https://blog.gopenai.com/hybrid-search-in-rag-dense-sparse-bm25-splade-reciprocal-rank-fusion-and-when-to-use-which-fafe4fd6156e)
  - [Hybrid Search Explained (Weaviate)](https://weaviate.io/blog/hybrid-search-explained)
- Query rewriting：
  - [DMQR-RAG paper](https://arxiv.org/html/2411.13154v1)
  - [HyDE / Multi-Query / Query Expansion explained](https://medium.com/@mudassar.hakim/retrieval-is-the-bottleneck-hyde-query-expansion-and-multi-query-rag-explained-for-production-c1842bed7f8a)
- 量化：
  - [HuggingFace embedding-quantization](https://huggingface.co/blog/embedding-quantization)
  - [FastEmbed ONNX 2025](https://johal.in/fastembed-onnx-lightweight-embedding-inference-2025/)
- OCR：
  - [8 Open-Source OCR Models](https://modal.com/blog/8-top-open-source-ocr-models-compared)
  - [PaddleOCR vs Tesseract](https://www.koncile.ai/en/ressources/paddleocr-analyse-avantages-alternatives-open-source)
- PDF 解析：
  - [PyMuPDF features](https://pymupdf.readthedocs.io/en/latest/about.html)
  - [7 Python PDF Extractors compared](https://onlyoneaman.medium.com/i-tested-7-python-pdf-extractors-so-you-dont-have-to-2025-edition-c88013922257)
- 評估：
  - [RAG Evaluation 2026 (Label Your Data)](https://labelyourdata.com/articles/llm-fine-tuning/rag-evaluation)
  - [RAG Evaluation Metrics & Frameworks 2026 (PremAI)](https://blog.premai.io/rag-evaluation-metrics-frameworks-testing-2026/)
