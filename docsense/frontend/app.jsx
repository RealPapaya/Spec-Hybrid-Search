/* global React, ReactDOM */
/* DocSense frontend — uses the same design system as SpecIndex (styles.css).
   Layout: Topbar | SearchRow | (FiltersRail | ResultsPanel | PreviewPanel) | StatusBar
   Data source: DocSense FastAPI backend at the same origin (/api/*) */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─── Icons (identical to SpecIndex) ──────────────────────────────────────────
const Icon = {
  search:   () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="7" r="5"/><path d="M11 11l3 3" strokeLinecap="round"/></svg>,
  check:    () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  sun:      () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" strokeLinecap="round"/></svg>,
  moon:     () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 10.5a5.5 5.5 0 11-7-7 4.5 4.5 0 007 7z"/></svg>,
  page:     () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 1.5h5.5L12 4v10.5H4z" strokeLinejoin="round"/><path d="M9.5 1.5V4H12M5.5 7.5h5M5.5 10h5M5.5 12.5h3" strokeLinecap="round"/></svg>,
  arrow:    () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  list:     () => <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="2" rx="0.5"/><rect x="2" y="7" width="12" height="2" rx="0.5"/><rect x="2" y="11" width="12" height="2" rx="0.5"/></svg>,
  rows:     () => <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="3" rx="0.5"/><rect x="2" y="7" width="12" height="3" rx="0.5"/><rect x="2" y="11" width="12" height="2" rx="0.5"/></svg>,
  refresh:  () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 8a5.5 5.5 0 0 1 9-4.2M13.5 8a5.5 5.5 0 0 1-9 4.2" strokeLinecap="round"/><path d="M11.5 3.5l1.5 0.3-.3 1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M4.5 12.5l-1.5-.3.3-1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  copy:     () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2"/></svg>,
  pdf:      () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 1.5h6l3 3V14a.5.5 0 01-.5.5h-9A.5.5 0 013 14V2a.5.5 0 01.5-.5zM10 1.5V4.5h3" strokeLinejoin="round"/><path d="M5.5 8.5h5M5.5 11h3" strokeLinecap="round"/></svg>,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function highlightText(text, terms) {
  if (!terms || !terms.length || !text) return text;
  const sorted  = [...terms].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${sorted.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts   = text.split(pattern);
  return parts.map((p, i) =>
    pattern.test(p) ? <mark key={i}>{p}</mark> : <React.Fragment key={i}>{p}</React.Fragment>
  );
}

function scoreClass(s) { return s >= 0.7 ? "" : s >= 0.4 ? " mid" : " low"; }

function fileTypeTag(filename) {
  const ext = (filename || "").split(".").pop().toUpperCase();
  return ext || "DOC";
}

// ─── Topbar ───────────────────────────────────────────────────────────────────
function Topbar({ theme, setTheme, status }) {
  const dot    = status.ok ? "ok" : "err";
  const label  = status.ok
    ? `${status.total_documents} docs · ${status.total_chunks} chunks`
    : "offline";

  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark"></div>
        <div>
          <span className="brand-name">DOCSENSE</span>
          <span className="brand-sub">hybrid · local</span>
        </div>
      </div>
      <div className="spacer"></div>
      <div className="meta">
        <span><span className={`dot ${dot}`} style={{ background: status.ok ? "var(--score-good)" : "var(--score-low)" }}></span>{label}</span>
      </div>
      <button
        className="iconbtn"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        title="Toggle theme"
      >
        {theme === "dark" ? <Icon.sun /> : <Icon.moon />}
      </button>
    </div>
  );
}

// ─── Search row ───────────────────────────────────────────────────────────────
function SearchRow({ query, setQuery, mode, setMode, onSearch, loading }) {
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div className="searchrow">
      <div className="searchbox">
        <div className="glass"><Icon.search /></div>
        <input
          ref={ref}
          id="search-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") onSearch(); }}
          placeholder="Type to search your documents…"
          autoComplete="off"
          spellCheck="false"
        />
        <div className="pre-clear">
          {loading && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-faint)", marginRight: 6 }}>searching…</span>}
          <kbd>↵</kbd>
        </div>
      </div>

      <div className="mode" role="tablist">
        {[
          { id: "hybrid",  label: "Hybrid",   sub: "RRF fusion" },
          { id: "vector",  label: "Semantic",  sub: "cosine" },
          { id: "keyword", label: "Keyword",   sub: "BM25/FTS5" },
        ].map(m => (
          <button
            key={m.id}
            className={mode === m.id ? "active" : ""}
            onClick={() => setMode(m.id)}
            title={m.sub}
          >
            <span className="mdot"></span>
            {m.label}
          </button>
        ))}
      </div>

      <button className="searchbtn" onClick={onSearch}>
        <Icon.search /> Search
      </button>
    </div>
  );
}

// ─── Filters rail ─────────────────────────────────────────────────────────────
function FiltersRail({ filters, setFilters, allResults, onReindex }) {
  // Derive type counts from live results
  const types = useMemo(() => {
    const c = {};
    allResults.forEach(r => { c[r.file_type] = (c[r.file_type] || 0) + 1; });
    return c;
  }, [allResults]);

  const FILE_TYPES = ["PDF", "DOCX", "XLSX", "PPTX"];

  const toggleType = id => {
    const cur = filters.types;
    setFilters({ ...filters, types: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
  };

  return (
    <aside className="filters-rail">
      <div className="fgroup">
        <div className="fgroup-title">
          <span>File Type</span>
          {filters.types.length > 0 && (
            <span className="clear" onClick={() => setFilters({ ...filters, types: [] })}>clear</span>
          )}
        </div>
        {FILE_TYPES.map(t => {
          const on = filters.types.includes(t);
          return (
            <div key={t} className={`fitem ${on ? "on" : ""}`} onClick={() => toggleType(t)}>
              <div className="checkbox"><Icon.check /></div>
              <span className="label">{t}</span>
              <span className="count">{types[t] || 0}</span>
            </div>
          );
        })}
      </div>

      <div className="fgroup">
        <div className="fgroup-title"><span>Score Range</span></div>
        <div className="range-row">
          <input
            type="text"
            value={filters.scoreMin}
            onChange={e => setFilters({ ...filters, scoreMin: e.target.value })}
          />
          <span className="dash">–</span>
          <input
            type="text"
            value={filters.scoreMax}
            onChange={e => setFilters({ ...filters, scoreMax: e.target.value })}
          />
        </div>
      </div>

      <div className="fgroup">
        <div className="fgroup-title"><span>Index</span></div>
        <div style={{ paddingBottom: 10 }}>
          <button className="iconbtn" style={{ width: "100%", justifyContent: "center", gap: 6 }} onClick={onReindex}>
            <Icon.refresh /> Re-index watched_docs
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Result row ───────────────────────────────────────────────────────────────
function ResultRow({ result, index, selected, onSelect, queryTerms }) {
  const sc = scoreClass(result.score);
  return (
    <div className={`result ${selected ? "selected" : ""}`} onClick={() => onSelect(result.id)}>
      <div className="num" style={{ textAlign: "left" }}>#{String(index + 1).padStart(2, "0")}</div>
      <div className="body">
        <div className="result-row1">
          <span className={`tag tag-vendor ${result.file_type.toLowerCase()}`}
            style={{ background: "var(--bg-soft)", color: "var(--fg-muted)", border: "1px solid var(--border)" }}>
            {result.file_type}
          </span>
          <span className="specname">{result.filename}</span>
          <span className="spacer"></span>
          <span className={`score-pill${sc}`}>{result.score.toFixed(4)}</span>
        </div>

        <div className="result-row2">
          {result.page && <><span className="pg">p. {result.page}</span><span className="sep">·</span></>}
          <span className="section" style={{ color: "var(--fg-muted)", fontWeight: 400 }}>
            {result.filepath}
          </span>
        </div>

        <div className="excerpt">
          {highlightText(result.chunk_text, queryTerms)}
        </div>

        <div className="result-row3">
          <span className="scoreitem">
            <span className="dot" style={{ background: "var(--accent)" }}></span>
            {result.mode}
          </span>
          <span className="scoreitem">
            <span className="dot bm" style={{ background: "#f59e0b" }}></span>
            score {result.score.toFixed(3)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Results panel ────────────────────────────────────────────────────────────
function ResultsPanel({ results, selectedId, onSelect, sortKey, setSortKey, cardMode, setCardMode, totalMs, queryTerms }) {
  return (
    <section className="results">
      <div className="results-head">
        <span className="ct"><strong>{results.length}</strong> results · <strong>{totalMs}</strong> ms</span>
        <span className="spacer"></span>
        <label>SORT</label>
        <select value={sortKey} onChange={e => setSortKey(e.target.value)}>
          <option value="score">Relevance</option>
          <option value="name">Filename (A–Z)</option>
        </select>
        <div className="layout-toggle">
          <button className={cardMode === "detailed" ? "on" : ""} onClick={() => setCardMode("detailed")} title="Detailed"><Icon.rows /></button>
          <button className={cardMode === "compact"  ? "on" : ""} onClick={() => setCardMode("compact")}  title="Compact"><Icon.list /></button>
        </div>
      </div>

      <div className="result-list">
        {results.length === 0 ? (
          <div className="empty">
            <div className="ico"><Icon.page /></div>
            No results — try a different query or mode
          </div>
        ) : (
          results.map((r, i) => (
            <ResultRow
              key={r.id}
              result={r}
              index={i}
              selected={r.id === selectedId}
              onSelect={onSelect}
              queryTerms={queryTerms}
            />
          ))
        )}
      </div>
    </section>
  );
}

// ─── Preview panel ────────────────────────────────────────────────────────────
function PreviewPanel({ result, queryTerms }) {
  const [tab, setTab] = useState("context");

  if (!result) {
    return (
      <section className="preview">
        <div className="empty">
          <div className="ico"><Icon.page /></div>
          Select a result to preview
        </div>
      </section>
    );
  }

  return (
    <section className="preview">
      <div className="preview-head">
        <div className="crumbs">
          <span className="crumb">{result.filename}</span>
          {result.page && <><span className="arr"><Icon.arrow /></span><span className="crumb last">p. {result.page}</span></>}
        </div>
        <button className="iconbtn" onClick={() => navigator.clipboard?.writeText(result.chunk_text)}>
          <Icon.copy /> copy
        </button>
      </div>

      <div className="preview-meta">
        <div className="metaitem">
          <span className="l">Document</span>
          <span className="v mono">{result.filename}</span>
        </div>
        <div className="metaitem">
          <span className="l">Type</span>
          <span className="v mono">{result.file_type}</span>
        </div>
        <div className="metaitem">
          <span className="l">Page</span>
          <span className="v mono">{result.page ?? "—"}</span>
        </div>
        <div className="metaitem">
          <span className="l">Mode</span>
          <span className="v mono">{result.mode}</span>
        </div>
      </div>

      <div className="preview-scoring">
        <div className="barwrap">
          <div className="lab">
            <span className="name"><span className="dot fused" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", marginRight: 5, verticalAlign: "middle" }}></span>SCORE</span>
            <span className="val">{result.score.toFixed(4)}</span>
          </div>
          <div className="bar"><div style={{ width: `${Math.min(result.score * 100, 100)}%`, background: "var(--accent)", height: "100%", borderRadius: 2 }}></div></div>
        </div>
      </div>

      <div className="preview-tabs">
        <button className={tab === "context"  ? "active" : ""} onClick={() => setTab("context")}>Matched chunk</button>
        <button className={tab === "metadata" ? "active" : ""} onClick={() => setTab("metadata")}>Metadata</button>
      </div>

      <div className="preview-body preview-text">
        {tab === "context" && (
          <>
            <h3 className="section-h">
              {result.filename}
              {result.page && <span className="pg">p. {result.page}</span>}
            </h3>
            <div className="ctx-block match">
              <div className="ctx-label">★ Matched chunk</div>
              {highlightText(result.chunk_text, queryTerms)}
            </div>
          </>
        )}
        {tab === "metadata" && (
          <pre style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 12 }}>
{`{
  "doc_id":    "${result.doc_id}",
  "filename":  "${result.filename}",
  "filepath":  "${result.filepath}",
  "page":      ${result.page ?? "null"},
  "mode":      "${result.mode}",
  "score":     ${result.score.toFixed(6)}
}`}
          </pre>
        )}
      </div>

      <div className="preview-actions">
        <button className="iconbtn" onClick={() => navigator.clipboard?.writeText(result.chunk_text)}>
          <Icon.copy /> copy text
        </button>
        <button className="iconbtn" onClick={() => navigator.clipboard?.writeText(result.filepath)}>
          <Icon.copy /> copy path
        </button>
        <span className="spacer"></span>
      </div>
    </section>
  );
}

// ─── Status bar ───────────────────────────────────────────────────────────────
function StatusBar({ totalMs, mode, results, status }) {
  return (
    <div className="statusbar">
      <span className="item">
        <span className={status.ok ? "ok" : ""}>●</span>
        {status.ok ? "connected" : "offline"}
      </span>
      <span className="item">mode: {mode}</span>
      <span className="item">embedder: bge-small-en-v1.5 · 384d</span>
      <span className="spacer"></span>
      <span className="item">{status.collection_points ?? 0} vectors</span>
      <span className="item">{results.length} results · {totalMs}ms</span>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [theme,     setTheme]     = useState("light");
  const [query,     setQuery]     = useState("");
  const [committed, setCommitted] = useState("");
  const [mode,      setMode]      = useState("hybrid");
  const [allResults, setAllResults] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [sortKey,   setSortKey]   = useState("score");
  const [cardMode,  setCardMode]  = useState("detailed");
  const [totalMs,   setTotalMs]   = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [status,    setStatus]    = useState({ ok: false, total_documents: 0, total_chunks: 0, collection_points: 0 });
  const [filters,   setFilters]   = useState({ types: [], scoreMin: "0.00", scoreMax: "1.00" });

  // ── Apply theme ────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.dataset.theme   = theme;
    document.documentElement.dataset.card    = cardMode;
  }, [theme, cardMode]);

  // ── Poll status ────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res  = await fetch("/api/status");
      const data = await res.json();
      setStatus({ ok: true, ...data });
    } catch {
      setStatus(s => ({ ...s, ok: false }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 10000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // ── Search ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!committed.trim()) { setAllResults([]); setTotalMs(0); return; }

    setLoading(true);
    const t0  = performance.now();
    const url = `/api/search?q=${encodeURIComponent(committed)}&mode=${mode}&limit=20`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        const ms = Math.round(performance.now() - t0);
        setTotalMs(ms);
        const mapped = (data.results || []).map((r, i) => ({
          id:         `${r.doc_id}_${i}`,
          doc_id:     r.doc_id,
          filename:   r.filename,
          filepath:   r.filepath,
          chunk_text: r.chunk_text,
          page:       r.page,
          score:      r.score,
          mode:       r.mode,
          file_type:  (r.filename || "").split(".").pop().toUpperCase() || "DOC",
        }));
        setAllResults(mapped);
        if (mapped.length) setSelectedId(mapped[0].id);
      })
      .catch(() => setAllResults([]))
      .finally(() => setLoading(false));

  }, [committed, mode]);

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rs = allResults.filter(r => {
      if (filters.types.length && !filters.types.includes(r.file_type)) return false;
      const smin = parseFloat(filters.scoreMin) || 0;
      const smax = parseFloat(filters.scoreMax) || 1;
      if (r.score < smin || r.score > smax) return false;
      return true;
    });
    if (sortKey === "name") rs = [...rs].sort((a, b) => a.filename.localeCompare(b.filename));
    else rs = [...rs].sort((a, b) => b.score - a.score);
    return rs;
  }, [allResults, filters, sortKey]);

  const selected    = filtered.find(r => r.id === selectedId) ?? null;
  const queryTerms  = committed.split(/\s+/).filter(w => w.length > 2);
  const onSearch    = () => setCommitted(query);

  const onReindex = async () => {
    try {
      await fetch("/api/index", { method: "POST" });
      setTimeout(fetchStatus, 3000);
    } catch {}
  };

  return (
    <div className="app">
      <Topbar theme={theme} setTheme={setTheme} status={status} />
      <SearchRow query={query} setQuery={setQuery} mode={mode} setMode={setMode} onSearch={onSearch} loading={loading} />
      <div className="main">
        <FiltersRail filters={filters} setFilters={setFilters} allResults={allResults} onReindex={onReindex} />
        <ResultsPanel
          results={filtered}
          selectedId={selectedId}
          onSelect={setSelectedId}
          sortKey={sortKey}
          setSortKey={setSortKey}
          cardMode={cardMode}
          setCardMode={setCardMode}
          totalMs={totalMs}
          queryTerms={queryTerms}
        />
        <PreviewPanel result={selected} queryTerms={queryTerms} />
      </div>
      <StatusBar totalMs={totalMs} mode={mode} results={filtered} status={status} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
