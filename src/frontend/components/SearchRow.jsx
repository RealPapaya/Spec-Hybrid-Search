// SearchRow — query input + mode segmented selector + search button.

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
      </div>
      <div className="mode" role="tablist">
        {[
          { id: 'bm25',     label: T('mode_keyword'),  sub: 'BM25'       },
          { id: 'hybrid',   label: T('mode_hybrid'),   sub: 'BM25 ⊕ vec' },
          { id: 'semantic', label: T('mode_semantic'),  sub: 'vec'        },
        ].map(m => (
          m.id === 'semantic'
            ? <button key={m.id} className="" disabled data-tip={T('coming_soon')} style={{ opacity: 0.4, cursor: 'not-allowed', position: 'relative' }}>
                <span className="mdot"></span>
                {m.label}
                <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.8 }}>{T('coming_soon_short')}</span>
              </button>
            : <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)} data-tip={m.sub}>
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
