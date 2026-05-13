// ─── Language Context ─────────────────────────────────────────────────────────
const LangCtx = React.createContext('en');
function useT() {
  const lang = React.useContext(LangCtx);
  return (key) => DICT[lang]?.[key] ?? DICT['en']?.[key] ?? key;
}

// ─── Prefs Persistence ────────────────────────────────────────────────────────
const PREFS_KEY = 'specindex_v1';
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch(e) { return {}; }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const VENDORS = ["Intel", "AMD", "TCG", "UEFI Forum", "PCI-SIG"];
const TYPES = ["ME", "TPM", "ACPI", "PCI"];
const CATEGORIES = ["BIOS", "EC", "EE"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function highlightText(text, terms) {
  if (!terms || !terms.length) return text;
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const escaped = sorted.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp('(' + escaped.join('|') + ')', 'gi');
  const parts = text.split(pattern);
  return parts.map((p, i) =>
    pattern.test(p) ? <mark key={i}>{p}</mark> : <React.Fragment key={i}>{p}</React.Fragment>
  );
}
function vendorClass(v) { return v.toLowerCase().replace(/[^a-z]/g, ''); }
function scoreClass(s) { return s >= 0.9 ? '' : s >= 0.85 ? ' mid' : ' low'; }

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  search:   () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" strokeLinecap="round" /></svg>,
  check:    () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  sun:      () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" strokeLinecap="round"/></svg>,
  moon:     () => <svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 10.5a5.5 5.5 0 11-7-7 4.5 4.5 0 007 7z" /></svg>,
  settings: () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="2.5"/><path d="M8 2.5v1M8 12.5v1M2.5 8h1M12.5 8h1M4.05 4.05l.71.71M11.24 11.24l.71.71M4.05 11.95l.71-.71M11.24 4.76l.71-.71" strokeLinecap="round"/></svg>,
  copy:     () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2"/></svg>,
  external: () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 3H3v10h10V9M9 3h4v4M13 3l-6 6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  arrow:    () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  list:     () => <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="2" rx="0.5"/><rect x="2" y="7" width="12" height="2" rx="0.5"/><rect x="2" y="11" width="12" height="2" rx="0.5"/></svg>,
  rows:     () => <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="3" rx="0.5"/><rect x="2" y="7" width="12" height="3" rx="0.5"/><rect x="2" y="11" width="12" height="2" rx="0.5"/></svg>,
  bookmark: () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 2h8v12l-4-3-4 3z" strokeLinejoin="round"/></svg>,
  download: () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v9M4 7l4 4 4-4M2 14h12" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  page:     () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 1.5h5.5L12 4v10.5H4z" strokeLinejoin="round"/><path d="M9.5 1.5V4H12M5.5 7.5h5M5.5 10h5M5.5 12.5h3" strokeLinecap="round"/></svg>,
};

// ─── Topbar ───────────────────────────────────────────────────────────────────
function Topbar({ theme, setTheme, lang, setLang, onOpenPrefs }) {
  const T = useT();
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark"></div>
        <div>
          <span className="brand-name">SPECINDEX</span>
          <span className="brand-sub">{T('brand_sub')}</span>
        </div>
      </div>
      <div className="spacer"></div>
      <div className="meta">
        <span><span className="dot"></span>{T('index_status')}</span>
      </div>
      <button
        className="iconbtn"
        onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
        title="切換語言 / Switch language"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, minWidth: 38, letterSpacing: 0 }}
      >
        {lang === 'en' ? '繁中' : 'EN'}
      </button>
      <button className="iconbtn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={T('toggle_theme')}>
        {theme === 'dark' ? <Icon.sun /> : <Icon.moon />}
      </button>
      <button className="iconbtn" onClick={onOpenPrefs} title={lang === 'zh' ? '偏好設定' : 'Preferences'}>
        <Icon.settings />
        <span style={{ fontSize: '11px' }}>{lang === 'zh' ? '偏好' : 'Prefs'}</span>
      </button>
    </div>
  );
}

// ─── SearchRow ────────────────────────────────────────────────────────────────
function SearchRow({ query, setQuery, mode, setMode, onSearch }) {
  const T = useT();
  return (
    <div className="searchrow">
      <div className="searchbox">
        <div className="glass"><Icon.search /></div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
          placeholder={T('search_placeholder')}
        />
        <div className="pre-clear">
          <kbd>⌘</kbd><kbd>K</kbd>
        </div>
      </div>
      <div className="mode" role="tablist">
        {[
          { id: 'bm25',     label: T('mode_keyword'),  sub: 'BM25'       },
          { id: 'hybrid',   label: T('mode_hybrid'),   sub: 'BM25 ⊕ vec' },
          { id: 'semantic', label: T('mode_semantic'),  sub: 'vec'        },
        ].map(m => (
          <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)} title={m.sub}>
            <span className="mdot"></span>
            {m.label}
          </button>
        ))}
      </div>
      <button className="searchbtn" onClick={onSearch}>
        <Icon.search /> {T('btn_search')}
      </button>
    </div>
  );
}

// ─── FilterGroup ──────────────────────────────────────────────────────────────
function FilterGroup({ title, items, selected, onToggle, onClear, clearLabel }) {
  return (
    <div className="fgroup">
      <div className="fgroup-title">
        <span>{title}</span>
        {selected.length > 0 && <span className="clear" onClick={onClear}>{clearLabel}</span>}
      </div>
      {items.map(it => {
        const on = selected.includes(it.id);
        return (
          <div key={it.id} className={'fitem' + (on ? ' on' : '')} onClick={() => onToggle(it.id)}>
            <div className="checkbox"><Icon.check /></div>
            <span className="label">{it.label}</span>
            <span className="count">{it.count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── FiltersRail ──────────────────────────────────────────────────────────────
function FiltersRail({ filters, setFilters, allResults }) {
  const T = useT();
  const counts = React.useMemo(() => {
    const c = { vendor: {}, type: {}, category: {} };
    allResults.forEach(r => {
      c.vendor[r.vendor]   = (c.vendor[r.vendor]   || 0) + 1;
      c.type[r.type]       = (c.type[r.type]       || 0) + 1;
      c.category[r.category] = (c.category[r.category] || 0) + 1;
    });
    return c;
  }, [allResults]);

  const toggle = (key, id) => {
    const cur = filters[key];
    setFilters({ ...filters, [key]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
  };
  const clear = (key) => setFilters({ ...filters, [key]: [] });

  return (
    <aside className="filters-rail">
      <FilterGroup title={T('f_vendor')}    items={VENDORS.map(v => ({ id: v, label: v, count: counts.vendor[v]   || 0 }))} selected={filters.vendor}   onToggle={id => toggle('vendor',   id)} onClear={() => clear('vendor')}   clearLabel={T('f_clear')} />
      <FilterGroup title={T('f_spec_type')} items={TYPES.map(t   => ({ id: t, label: t, count: counts.type[t]     || 0 }))} selected={filters.type}     onToggle={id => toggle('type',     id)} onClear={() => clear('type')}     clearLabel={T('f_clear')} />
      <FilterGroup title={T('f_category')}  items={CATEGORIES.map(c => ({ id: c, label: c, count: counts.category[c] || 0 }))} selected={filters.category} onToggle={id => toggle('category', id)} onClear={() => clear('category')} clearLabel={T('f_clear')} />
      <div className="fgroup">
        <div className="fgroup-title"><span>{T('f_score_range')}</span></div>
        <div className="range-row">
          <input type="text" defaultValue="0.50" />
          <span className="dash">–</span>
          <input type="text" defaultValue="1.00" />
        </div>
      </div>
      <div className="fgroup">
        <div className="fgroup-title"><span>{T('f_date')}</span></div>
        <div className="range-row">
          <input type="text" defaultValue="2023" />
          <span className="dash">–</span>
          <input type="text" defaultValue="2026" />
        </div>
      </div>
    </aside>
  );
}

// ─── TopFilters ───────────────────────────────────────────────────────────────
function TopFilters({ filters, setFilters, allResults }) {
  const T = useT();
  const counts = React.useMemo(() => {
    const c = { vendor: {}, type: {}, category: {} };
    allResults.forEach(r => {
      c.vendor[r.vendor]     = (c.vendor[r.vendor]     || 0) + 1;
      c.type[r.type]         = (c.type[r.type]         || 0) + 1;
      c.category[r.category] = (c.category[r.category] || 0) + 1;
    });
    return c;
  }, [allResults]);
  const toggle = (key, id) => {
    const cur = filters[key];
    setFilters({ ...filters, [key]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
  };
  return (
    <div className="topfilters">
      <div className="grp"><span className="grp-label">{T('f_vendor')}</span>
        {VENDORS.map(v => <button key={v} className={'chip' + (filters.vendor.includes(v) ? ' on' : '')} onClick={() => toggle('vendor', v)}>{v}<span className="ct">{counts.vendor[v] || 0}</span></button>)}
      </div>
      <div className="grp"><span className="grp-label">{T('f_spec_type')}</span>
        {TYPES.map(v => <button key={v} className={'chip' + (filters.type.includes(v) ? ' on' : '')} onClick={() => toggle('type', v)}>{v}<span className="ct">{counts.type[v] || 0}</span></button>)}
      </div>
      <div className="grp"><span className="grp-label">{T('f_category')}</span>
        {CATEGORIES.map(v => <button key={v} className={'chip' + (filters.category.includes(v) ? ' on' : '')} onClick={() => toggle('category', v)}>{v}<span className="ct">{counts.category[v] || 0}</span></button>)}
      </div>
    </div>
  );
}

// ─── ResultRow ────────────────────────────────────────────────────────────────
function ResultRow({ result, index, selected, onSelect }) {
  const score = result.score;
  const sc = scoreClass(score);
  return (
    <div className={'result' + (selected ? ' selected' : '')} onClick={() => onSelect(result.id)}>
      <div className="num">#{String(index + 1).padStart(2, '0')}</div>
      <div className="body">
        <div className="result-row1">
          <span className={'tag tag-vendor ' + vendorClass(result.vendor)}>{result.vendor}</span>
          <span className="tag">{result.type}</span>
          <span className="tag tag-vendor cat">{result.category}</span>
          <span className="specname">{result.spec}</span>
          <span className="ver">{result.version}</span>
          <span className="spacer"></span>
          <span className={'score-pill' + sc}>{score.toFixed(4)}</span>
        </div>
        <div className="result-row2">
          <span className="section">§ {result.section}</span>
          <span className="sep">·</span>
          <span className="pg">p. {result.page}</span>
        </div>
        <div className="excerpt">{highlightText(result.excerpt, result.highlight)}</div>
        <div className="result-row3">
          <span className="scoreitem"><span className="dot bm"></span>BM25 {result.bm25.toFixed(2)}</span>
          <span className="scoreitem"><span className="dot sem"></span>cos {result.semantic.toFixed(2)}</span>
          <span className="date">{result.date}</span>
        </div>
      </div>
    </div>
  );
}

// ─── ResultsPanel ─────────────────────────────────────────────────────────────
function ResultsPanel({ results, selectedId, onSelect, sortKey, setSortKey, cardMode, setCardMode, totalMs }) {
  const T = useT();
  return (
    <section className="results">
      <div className="results-head">
        <span className="ct"><strong>{results.length}</strong> {T('results_n')} · <strong>{totalMs}</strong> {T('results_ms')}</span>
        <span className="spacer"></span>
        <label>{T('sort')}</label>
        <select value={sortKey} onChange={e => setSortKey(e.target.value)}>
          <option value="score">{T('sort_relevance')}</option>
          <option value="name">{T('sort_name')}</option>
          <option value="date">{T('sort_date')}</option>
        </select>
        <div className="layout-toggle">
          <button className={cardMode === 'detailed' ? 'on' : ''} onClick={() => setCardMode('detailed')} title={T('layout_detailed')}><Icon.rows /></button>
          <button className={cardMode === 'compact'  ? 'on' : ''} onClick={() => setCardMode('compact')}  title={T('layout_compact')} ><Icon.list /></button>
        </div>
      </div>
      <div className="result-list">
        {results.map((r, i) => (
          <ResultRow key={r.id} result={r} index={i} selected={r.id === selectedId} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

// ─── PreviewPanel ─────────────────────────────────────────────────────────────
function PreviewPanel({ result }) {
  const T = useT();
  const [tab, setTab] = React.useState('context');

  if (!result) {
    return (
      <section className="preview">
        <div className="empty">
          <div>
            <div className="ico"><Icon.page /></div>
            {T('empty_msg')}
          </div>
        </div>
      </section>
    );
  }

  const fused = result.score, bm = result.bm25, sem = result.semantic;
  const metaJson = [
    '{',
    '  "doc_id":      "' + result.specShort.toLowerCase() + '",',
    '  "vendor":      "' + result.vendor + '",',
    '  "spec_type":   "' + result.type + '",',
    '  "category":    "' + result.category + '",',
    '  "version":     "' + result.version + '",',
    '  "published":   "' + result.date + '",',
    '  "page":        ' + result.page + ',',
    '  "section":     "' + result.section + '",',
    '  "chunk_id":    "' + result.id + '_p' + result.page + '_s4",',
    '  "tokens":      342,',
    '  "lang":        "en-US",',
    '  "embedder":    "bge-large-en-v1.5",',
    '  "fused_score": ' + result.score,
    '}'
  ].join('\n');

  return (
    <section className="preview">
      <div className="preview-head">
        <div className="crumbs">
          <span className="crumb">{result.spec}</span>
          <span className="arr"><Icon.arrow /></span>
          <span className="crumb last">§ {result.section}</span>
        </div>
        <button className="iconbtn"><Icon.bookmark /></button>
        <button className="iconbtn"><Icon.external /> {T('open')}</button>
      </div>

      <div className="preview-meta">
        <div className="metaitem"><span className="l">{T('meta_doc')}</span><span className="v mono">{result.specShort}</span></div>
        <div className="metaitem"><span className="l">{T('meta_version')}</span><span className="v mono">{result.version}</span></div>
        <div className="metaitem"><span className="l">{T('meta_page')}</span><span className="v mono">{result.page}</span></div>
        <div className="metaitem"><span className="l">{T('meta_published')}</span><span className="v mono">{result.date}</span></div>
      </div>

      <div className="preview-scoring">
        <div className="barwrap">
          <div className="lab"><span className="name"><span className="dot fused"></span>{T('score_fused')}</span><span className="val">{fused.toFixed(4)}</span></div>
          <div className="bar"><div style={{ width: fused * 100 + '%', background: 'var(--accent)' }}></div></div>
        </div>
        <div className="barwrap">
          <div className="lab"><span className="name"><span className="dot bm"></span>BM25</span><span className="val">{bm.toFixed(4)}</span></div>
          <div className="bar"><div style={{ width: bm * 100 + '%', background: '#f59e0b' }}></div></div>
        </div>
        <div className="barwrap">
          <div className="lab"><span className="name"><span className="dot sem"></span>cos</span><span className="val">{sem.toFixed(4)}</span></div>
          <div className="bar"><div style={{ width: sem * 100 + '%', background: '#8b5cf6' }}></div></div>
        </div>
      </div>

      <div className="preview-tabs">
        <button className={tab === 'context'  ? 'active' : ''} onClick={() => setTab('context')} >{T('tab_context')}</button>
        <button className={tab === 'match'    ? 'active' : ''} onClick={() => setTab('match')}   >{T('tab_match')}</button>
        <button className={tab === 'metadata' ? 'active' : ''} onClick={() => setTab('metadata')}>{T('tab_metadata')} <span className="ctsmall">12</span></button>
        <button className={tab === 'related'  ? 'active' : ''} onClick={() => setTab('related')} >{T('tab_related')}  <span className="ctsmall">7</span></button>
      </div>

      <div className="preview-body preview-text">
        {tab === 'context' && <>
          <h3 className="section-h">{result.spec}<span className="pg">{T('page_short')} {result.page}</span></h3>
          <div className="ctx-block">
            <div className="ctx-label">{T('ctx_preceding')} · {T('page_short')} {result.page - 1}</div>
            {highlightText(result.context.before, result.highlight)}
          </div>
          <div className="ctx-block match">
            <div className="ctx-label">{T('ctx_matched')} · {T('page_short')} {result.page}</div>
            {highlightText(result.context.match, result.highlight)}
          </div>
          <div className="ctx-block">
            <div className="ctx-label">{T('ctx_following')} · {T('page_short')} {result.page + 1}</div>
            {highlightText(result.context.after, result.highlight)}
          </div>
        </>}
        {tab === 'match' && <>
          <h3 className="section-h">{T('matched_only')}</h3>
          <div style={{ whiteSpace: 'pre-wrap' }}>{highlightText(result.context.match, result.highlight)}</div>
        </>}
        {tab === 'metadata' && (
          <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{metaJson}</pre>
        )}
        {tab === 'related' && (
          <div style={{ fontSize: 12.5, fontFamily: 'var(--font-sans)', color: 'var(--fg-muted)' }}>
            <p>{T('other_chunks')} <strong style={{ color: 'var(--fg)' }}>{result.spec}</strong></p>
            <ul style={{ paddingLeft: 18, lineHeight: 1.9 }}>
              <li>§ 4.3.6 — Pre-Boot Communication Channel · {T('page_short')} {result.page - 1}</li>
              <li>§ 4.3.8 — MKHI Command Set Negotiation · {T('page_short')} {result.page + 2}</li>
              <li>§ 4.4.1 — HECI Reset and Recovery · {T('page_short')} {result.page + 5}</li>
              <li>§ 5.1 — Provisioning Flow Overview · {T('page_short')} {result.page + 18}</li>
            </ul>
          </div>
        )}
      </div>

      <div className="preview-actions">
        <button className="iconbtn"><Icon.copy /> {T('copy_citation')}</button>
        <button className="iconbtn"><Icon.copy /> {T('copy_text')}</button>
        <span className="spacer"></span>
        <button className="iconbtn"><Icon.download /> {T('download_pdf')}</button>
      </div>
    </section>
  );
}

// ─── StatusBar ────────────────────────────────────────────────────────────────
function StatusBar({ totalMs, mode, results }) {
  const T = useT();
  return (
    <div className="statusbar">
      <span className="item"><span className="ok">●</span> {T('sb_connected')}</span>
      <span className="item">{T('sb_mode')} {mode}</span>
      <span className="item">{T('sb_embedder')}</span>
      <span className="item">{T('sb_alpha')}</span>
      <span className="spacer"></span>
      <span className="item">{T('sb_cache')}</span>
      <span className="item">{results.length} {T('sb_chunks')} · {totalMs}ms</span>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const saved = React.useMemo(loadPrefs, []);

  const [theme,    setTheme]    = React.useState(saved.theme    || 'light');
  const [lang,     setLang]     = React.useState(saved.lang     || 'en');
  const [query,    setQuery]    = React.useState('HECI driver initialization timeout');
  const [mode,     setMode]     = React.useState('hybrid');
  const [filters,  setFilters]  = React.useState({ vendor: [], type: [], category: [] });
  const [selectedId, setSelectedId] = React.useState('r1');
  const [sortKey,  setSortKey]  = React.useState('score');
  const [cardMode, setCardMode] = React.useState(saved.cardMode || 'detailed');
  const [totalMs]               = React.useState(38);

  const [tweaks, setTweakState] = React.useState({
    layout:    saved.layout    || 'sidebar',
    density:   saved.density   || 'balanced',
    accent:    saved.accent    || 'indigo',
    typeset:   saved.typeset   || 'inter-mono',
    cardMode:  saved.cardMode  || 'detailed',
    highlight: saved.highlight || 'yellow',
  });

  const setTweak = React.useCallback((keyOrObj, val) => {
    const edits = typeof keyOrObj === 'object' ? keyOrObj : { [keyOrObj]: val };
    setTweakState(prev => ({ ...prev, ...edits }));
  }, []);

  // Persist preferences to localStorage
  React.useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ theme, lang, ...tweaks })); } catch(e) {}
  }, [theme, lang, tweaks]);

  // Apply all preferences to the document root
  React.useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme    = theme;
    r.dataset.layout   = tweaks.layout;
    r.dataset.density  = tweaks.density;
    r.dataset.accent   = tweaks.accent;
    r.dataset.typeset  = tweaks.typeset;
    r.dataset.card     = tweaks.cardMode;
    r.dataset.highlight = tweaks.highlight;
    r.lang             = lang === 'zh' ? 'zh-TW' : 'en';
  }, [theme, lang, tweaks]);

  const allResults = SPEC_DATA.results;

  const filtered = React.useMemo(() => {
    let rs = allResults.filter(r => {
      if (filters.vendor.length   && !filters.vendor.includes(r.vendor))   return false;
      if (filters.type.length     && !filters.type.includes(r.type))       return false;
      if (filters.category.length && !filters.category.includes(r.category)) return false;
      return true;
    });
    if      (sortKey === 'name') rs = [...rs].sort((a, b) => a.spec.localeCompare(b.spec));
    else if (sortKey === 'date') rs = [...rs].sort((a, b) => b.date.localeCompare(a.date));
    else                         rs = [...rs].sort((a, b) => b.score - a.score);
    return rs;
  }, [filters, sortKey, allResults]);

  React.useEffect(() => {
    if (filtered.length && !filtered.find(r => r.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selected   = filtered.find(r => r.id === selectedId);
  const openPrefs  = () => window.postMessage({ type: '__activate_edit_mode' }, '*');
  const prefsTitle = lang === 'zh' ? '偏好設定' : 'Preferences';

  return (
    <LangCtx.Provider value={lang}>
      <div className="app">
        <Topbar theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} onOpenPrefs={openPrefs} />
        <SearchRow query={query} setQuery={setQuery} mode={mode} setMode={setMode} onSearch={() => {}} />
        <TopFilters filters={filters} setFilters={setFilters} allResults={allResults} />
        <div className="main">
          <FiltersRail filters={filters} setFilters={setFilters} allResults={allResults} />
          <ResultsPanel
            results={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            sortKey={sortKey}
            setSortKey={setSortKey}
            cardMode={cardMode}
            setCardMode={c => { setCardMode(c); setTweak('cardMode', c); }}
            totalMs={totalMs}
          />
          <PreviewPanel result={selected} />
        </div>
        <StatusBar totalMs={totalMs} mode={mode} results={filtered} />

        <TweaksPanel title={prefsTitle}>

          <TweakSection label={lang === 'zh' ? '語言' : 'Language'}>
            <TweakRadio
              label={lang === 'zh' ? '介面語言' : 'Interface language'}
              value={lang}
              onChange={v => setLang(v)}
              options={[{ value: 'en', label: 'English' }, { value: 'zh', label: '繁中' }]}
            />
          </TweakSection>

          <TweakSection label={lang === 'zh' ? '外觀' : 'Appearance'}>
            <TweakRadio
              label={lang === 'zh' ? '主題' : 'Theme'}
              value={theme}
              onChange={v => setTheme(v)}
              options={[
                { value: 'light', label: lang === 'zh' ? '淺色' : 'Light' },
                { value: 'dark',  label: lang === 'zh' ? '深色' : 'Dark'  },
              ]}
            />
            <TweakSelect
              label={lang === 'zh' ? '強調色' : 'Accent color'}
              value={tweaks.accent}
              onChange={v => setTweak('accent', v)}
              options={[
                { value: 'indigo',  label: lang === 'zh' ? '靛藍 (預設)' : 'Indigo (default)' },
                { value: 'emerald', label: lang === 'zh' ? '翠綠'        : 'Emerald'           },
                { value: 'amber',   label: lang === 'zh' ? '琥珀'        : 'Amber'             },
                { value: 'slate',   label: lang === 'zh' ? '石板'        : 'Slate'             },
              ]}
            />
            <TweakRadio
              label={lang === 'zh' ? '標示樣式' : 'Highlight style'}
              value={tweaks.highlight}
              onChange={v => setTweak('highlight', v)}
              options={[
                { value: 'yellow',    label: lang === 'zh' ? '黃底' : 'Yellow'    },
                { value: 'underline', label: lang === 'zh' ? '底線' : 'Underline' },
                { value: 'bold',      label: lang === 'zh' ? '粗體' : 'Bold'      },
              ]}
            />
          </TweakSection>

          <TweakSection label={lang === 'zh' ? '字體' : 'Typography'}>
            <TweakSelect
              label={lang === 'zh' ? '字型配對' : 'Font pairing'}
              value={tweaks.typeset}
              onChange={v => setTweak('typeset', v)}
              options={[
                { value: 'inter-mono', label: 'Inter + JetBrains Mono'     },
                { value: 'ibm-plex',   label: 'IBM Plex Sans + Plex Mono'  },
                { value: 'serif-mono', label: 'Source Serif + JetBrains Mono' },
              ]}
            />
          </TweakSection>

          <TweakSection label={lang === 'zh' ? '版面' : 'Layout'}>
            <TweakRadio
              label={lang === 'zh' ? '篩選器' : 'Filters'}
              value={tweaks.layout}
              onChange={v => setTweak('layout', v)}
              options={[
                { value: 'sidebar',    label: lang === 'zh' ? '側欄' : 'Sidebar' },
                { value: 'topfilters', label: lang === 'zh' ? '頂部' : 'Top bar' },
              ]}
            />
            <TweakRadio
              label={lang === 'zh' ? '卡片樣式' : 'Card style'}
              value={tweaks.cardMode}
              onChange={v => { setTweak('cardMode', v); setCardMode(v); }}
              options={[
                { value: 'detailed', label: lang === 'zh' ? '詳細' : 'Detailed' },
                { value: 'compact',  label: lang === 'zh' ? '精簡' : 'Compact'  },
              ]}
            />
            <TweakSelect
              label={lang === 'zh' ? '密度' : 'Density'}
              value={tweaks.density}
              onChange={v => setTweak('density', v)}
              options={[
                { value: 'compact',  label: lang === 'zh' ? '精簡' : 'Compact'  },
                { value: 'balanced', label: lang === 'zh' ? '平衡' : 'Balanced' },
                { value: 'spacious', label: lang === 'zh' ? '寬鬆' : 'Spacious' },
              ]}
            />
          </TweakSection>

        </TweaksPanel>
      </div>
    </LangCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
