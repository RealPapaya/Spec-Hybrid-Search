// Topbar — brand mark, integrated search input, view-mode buttons, settings.

function Topbar({
  onOpenPrefs, view, setView, bookmarkCount,
  query, setQuery, onSearch,
  advancedOpen, setAdvancedOpen,
}) {
  const T = useT();
  const inBookmarks = view === 'bookmarks';
  const inDocuments = view === 'documents';
  const inSearch = !inBookmarks && !inDocuments;
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark"></div>
        <div>
          <span className="brand-name">DocSense</span>
          <span className="brand-sub">{T('brand_sub')}</span>
        </div>
      </div>

      {inSearch && (
        <div className="topbar-search">
          <div className="searchbox">
            <div className="glass"><Icon.search /></div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
              placeholder={T('search_placeholder')}
            />
          </div>
          <button
            className={'advanced-btn' + (advancedOpen ? ' active' : '')}
            onClick={() => setAdvancedOpen(open => !open)}
            type="button"
          >
            {T('advanced')}
          </button>
          <button className="searchbtn" onClick={onSearch}>
            <Icon.search /> {T('btn_search')}
          </button>
        </div>
      )}

      {!inSearch && <div className="spacer"></div>}

      <button
        className="iconbtn"
        onClick={() => setView(inDocuments ? 'search' : 'documents')}
        data-tip={inDocuments ? T('docs_back') : T('docs_nav')}
        style={inDocuments ? { color: 'var(--accent)' } : null}
      >
        <Icon.tag />
        <span style={{ fontSize: '14px' }}>{T('docs_nav')}</span>
      </button>
      <button
        className="iconbtn"
        onClick={() => setView(inBookmarks ? 'search' : 'bookmarks')}
        data-tip={inBookmarks ? T('bookmarks_back') : T('bookmarks_nav')}
        style={inBookmarks ? { color: 'var(--accent)' } : null}
      >
        {inBookmarks ? <Icon.bookmarkFill /> : <Icon.bookmark />}
        <span style={{ fontSize: '14px' }}>
          {T('bookmarks_nav')}{bookmarkCount > 0 ? ` · ${bookmarkCount}` : ''}
        </span>
      </button>
      <button className="iconbtn iconbtn-settings" onClick={onOpenPrefs} data-tip={T('settings')}>
        <Icon.settings />
      </button>
    </div>
  );
}
