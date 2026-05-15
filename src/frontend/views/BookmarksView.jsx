// BookmarksView — full-screen list of saved bookmarks.

function BookmarksView({ bookmarks, setBookmarks, onBack }) {
  const T = useT();
  const lang = React.useContext(LangCtx);
  const confirm = useConfirm();
  const items = React.useMemo(
    () => Object.entries(bookmarks)
      .map(([key, b]) => ({ key, ...b }))
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)),
    [bookmarks],
  );

  const remove = (key) => {
    const next = { ...bookmarks };
    delete next[key];
    setBookmarks(next);
    saveBookmarks(next);
  };

    const clearAll = async () => {
    const msg = lang === 'zh'
      ? `確定要清空全部 ${items.length} 筆收藏？`
      : `Clear all ${items.length} bookmarks?`;
    const ok = await confirm(msg, { danger: true });
    if (ok) {
      setBookmarks({});
      saveBookmarks({});
    }
  };

  const openItem = (b) => {
    if (!b.doc_id) return;
    const hash = b.page ? '#page=' + b.page : '';
    window.open('/api/file/' + encodeURIComponent(b.doc_id) + hash, '_blank', 'noopener');
  };

  const downloadItem = (b) => {
    if (!b.doc_id) return;
    window.location.href = '/api/file/' + encodeURIComponent(b.doc_id) + '?download=1';
  };

  const formatDate = (ms) => {
    if (!ms) return '';
    try { return new Date(ms).toLocaleString(lang === 'zh' ? 'zh-TW' : 'en-US'); }
    catch(e) { return ''; }
  };

  return (
    <section className="results" style={{ gridColumn: '1 / -1', padding: '16px 20px 24px' }}>
      <div className="results-head">
        <button
          className="iconbtn"
          onClick={onBack}
          data-tip={T('bookmarks_back')}
          style={{ marginRight: 8 }}
        >
          <Icon.back /> {T('bookmarks_back')}
        </button>
        <span className="ct">
          <strong>{items.length}</strong> {T('bookmarks_count')}
        </span>
        <span className="spacer"></span>
        {items.length > 0 && (
          <button className="iconbtn" onClick={clearAll} data-tip={T('bookmarks_clear_all')}>
            <Icon.trash /> {T('bookmarks_clear_all')}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <div>
            <div className="ico"><Icon.bookmark /></div>
            <div className="title">{T('bookmarks_empty')}</div>
            <div className="hint">{T('bookmarks_empty_hint')}</div>
          </div>
        </div>
      ) : (
        <div className="result-list">
          {items.map((b, i) => {
            const ext = (b.filename || '').split('.').pop().toUpperCase();
            return (
              <div key={b.key} className="result">
                <div className="num">#{String(i + 1).padStart(2, '0')}</div>
                <div className="body">
                  <div className="result-row1">
                    {ext && <span className="tag">{ext}</span>}
                    <span className="specname">{b.filename || b.doc_id}</span>
                    <span className="spacer"></span>
                    {b.score > 0 && (
                      <span className={'score-pill' + scoreClass(b.score)}>
                        {b.score.toFixed(4)}
                      </span>
                    )}
                  </div>
                  <div className="result-row2">
                    {b.page > 0 && (
                      <>
                        <span className="pg">{T('page_short')} {b.page}</span>
                        <span className="sep">·</span>
                      </>
                    )}
                    <span className="section" style={{ color: 'var(--fg-muted)' }}>
                      {b.filepath || b.section}
                    </span>
                  </div>
                  {b.snippet && <div className="excerpt">{b.snippet}</div>}
                  <div className="result-row3" style={{ gap: 8 }}>
                    <button
                      className="iconbtn"
                      onClick={() => openItem(b)}
                      data-tip={b.filepath}
                    >
                      <Icon.external /> {T('bookmarks_open')}
                    </button>
                    <button className="iconbtn" onClick={() => downloadItem(b)}>
                      <Icon.download /> {T('download_pdf')}
                    </button>
                    <span className="spacer"></span>
                    <span style={{ fontSize: 11, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>
                      {formatDate(b.savedAt)}
                    </span>
                    <button
                      className="iconbtn"
                      onClick={() => remove(b.key)}
                      data-tip={T('bookmarks_remove')}
                    >
                      <Icon.trash />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
