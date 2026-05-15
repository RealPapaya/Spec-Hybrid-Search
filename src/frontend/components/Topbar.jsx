// Topbar — brand mark, status indicator, view-mode buttons, language / theme /
// settings toggles.

function Topbar({ theme, setTheme, lang, setLang, onOpenPrefs, status, view, setView, bookmarkCount }) {
  const T = useT();
  const ok = !!status?.ok;
  const dotColor = ok ? 'var(--score-good)' : 'var(--score-low)';
  const label = ok
    ? (lang === 'zh'
        ? `就緒 · ${status.total_documents ?? 0} 文件 · ${status.total_chunks ?? 0} 區塊`
        : `ready · ${status.total_documents ?? 0} docs · ${status.total_chunks ?? 0} chunks`)
    : (lang === 'zh' ? '離線' : 'offline');
  const inBookmarks = view === 'bookmarks';
  const inDocuments = view === 'documents';
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark"></div>
        <div>
          <span className="brand-name">DocSense</span>
          <span className="brand-sub">{T('brand_sub')}</span>
        </div>
      </div>
      <div className="spacer"></div>
      <div className="meta">
        <span><span className="dot" style={{ background: dotColor }}></span>{label}</span>
      </div>
      <button
        className="iconbtn"
        onClick={() => setView(inDocuments ? 'search' : 'documents')}
        data-tip={inDocuments ? T('docs_back') : T('docs_nav')}
        style={inDocuments ? { color: 'var(--accent)' } : null}
      >
        <Icon.folder />
        <span style={{ fontSize: '11px' }}>{T('docs_nav')}</span>
      </button>
      <button
        className="iconbtn"
        onClick={() => setView(inBookmarks ? 'search' : 'bookmarks')}
        data-tip={inBookmarks ? T('bookmarks_back') : T('bookmarks_nav')}
        style={inBookmarks ? { color: 'var(--accent)' } : null}
      >
        {inBookmarks ? <Icon.bookmarkFill /> : <Icon.bookmark />}
        <span style={{ fontSize: '11px' }}>
          {T('bookmarks_nav')}{bookmarkCount > 0 ? ` · ${bookmarkCount}` : ''}
        </span>
      </button>
      <button
        className="iconbtn"
        onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
        data-tip="切換語言 / Switch language"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, minWidth: 38, letterSpacing: 0 }}
      >
        {lang === 'en' ? '繁中' : 'EN'}
      </button>
      <button className="iconbtn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} data-tip={T('toggle_theme')}>
        {theme === 'dark' ? <Icon.sun /> : <Icon.moon />}
      </button>
      <button className="iconbtn iconbtn-settings" onClick={onOpenPrefs} data-tip={lang === 'zh' ? '偏好設定' : 'Settings'}>
        <Icon.settings />
      </button>
    </div>
  );
}
