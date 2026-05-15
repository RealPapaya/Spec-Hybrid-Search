// PreviewPanel — right-side panel: doc meta + score bars + tabbed body
// (context / match / metadata / related) + action buttons (open / download / copy).

function PreviewPanel({ result, bookmarks = {}, setBookmarks = () => {} }) {
  const T = useT();
  const lang = React.useContext(LangCtx);
  const [tab, setTab] = React.useState('context');
  const [flash, setFlash] = React.useState('');

  const showFlash = React.useCallback((msg) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 1200);
  }, []);

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

  const bmKey = bookmarkKey(result.doc_id, result.page);
  const isBookmarked = !!bookmarks[bmKey];

  const toggleBookmark = () => {
    const next = { ...bookmarks };
    if (next[bmKey]) delete next[bmKey];
    else             next[bmKey] = bookmarkPayload(result);
    setBookmarks(next);
    saveBookmarks(next);
  };

  const fileUrl = (download) => {
    if (!result.doc_id) return null;
    const q = download ? '?download=1' : '';
    const hash = !download && result.page ? '#page=' + result.page : '';
    return '/api/file/' + encodeURIComponent(result.doc_id) + q + hash;
  };

  const openFile = () => {
    const fp = result.filepath || '';
    const isPdf = fp.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      const url = fileUrl(false);
      if (url) window.open(url, '_blank', 'noopener');
    } else if (result.doc_id) {
      fetch('/api/open/' + encodeURIComponent(result.doc_id), { method: 'POST' });
    }
  };

  const downloadFile = () => {
    const url = fileUrl(true);
    if (url) window.location.href = url;
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(result.context.match || result.excerpt || '');
      showFlash(T('copy_text') + ' ✓');
    } catch(e) { showFlash('✗'); }
  };

  const copyCitation = async () => {
    const cite = result.spec + (result.page ? ', p. ' + result.page : '');
    try {
      await navigator.clipboard.writeText(cite);
      showFlash(T('copy_citation') + ' ✓');
    } catch(e) { showFlash('✗'); }
  };

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
        <div className="crumbs"></div>
        {flash && (
          <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            {flash}
          </span>
        )}
        <button
          className="iconbtn"
          onClick={toggleBookmark}
          data-tip={isBookmarked
            ? (lang === 'zh' ? '已加入收藏' : 'Bookmarked')
            : (lang === 'zh' ? '加入收藏'   : 'Bookmark')}
          style={isBookmarked ? { color: 'var(--accent)' } : null}
        >
          {isBookmarked ? <Icon.bookmarkFill /> : <Icon.bookmark />}
        </button>
        <button className="iconbtn" onClick={openFile} data-tip={result.filepath}>
          <Icon.external /> {T('open')}
        </button>
      </div>

      <div className="preview-meta">
        <div className="metaitem"><span className="l">{T('meta_doc')}</span><span className="v mono">{result.specShort}</span></div>
        <div className="metaitem align-right"><span className="l">{T('meta_page')}</span><span className="v mono">{result.page}</span></div>
      </div>

      <div className="preview-scoring">
        <div className="barwrap">
          <div className="lab"><span className="name" data-tip={T('score_fused_tip')}><span className="dot fused"></span>{T('score_fused')}</span><span className="val">{fused.toFixed(4)}</span></div>
          <div className="bar"><div style={{ width: fused * 100 + '%', background: 'var(--accent)' }}></div></div>
        </div>
        <div className="barwrap">
          <div className="lab"><span className="name" data-tip={T('score_bm25_tip')}><span className="dot bm"></span>BM25</span><span className="val">{bm.toFixed(4)}</span></div>
          <div className="bar"><div style={{ width: bm * 100 + '%', background: '#f59e0b' }}></div></div>
        </div>
        <div className="barwrap">
          <div className="lab"><span className="name" data-tip={T('score_cos_tip')}><span className="dot sem"></span>cos</span><span className="val">{sem.toFixed(4)}</span></div>
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
        <button className="iconbtn" onClick={copyCitation}><Icon.copy /> {T('copy_citation')}</button>
        <button className="iconbtn" onClick={copyText}><Icon.copy /> {T('copy_text')}</button>
        <span className="spacer"></span>
        <button className="iconbtn" onClick={downloadFile}><Icon.download /> {T('download_pdf')}</button>
      </div>
    </section>
  );
}
