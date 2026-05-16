// SearchRow - advanced search controls panel (shown when toggled from Topbar).

function SearchRow({
  mode, setMode,
  view = 'documents', setView = () => {},
  wholeWord = false, setWholeWord = () => {},
  matchCase = false, setMatchCase = () => {},
  relatedTerms = [], setRelatedTerms = () => {},
}) {
  const T = useT();
  const [relatedDraft, setRelatedDraft] = React.useState('');
  const isOccurrences = view === 'occurrences';

  const addRelated = React.useCallback((raw) => {
    const clean = raw.trim();
    if (!clean) return;
    setRelatedTerms(prev => {
      const exists = prev.some(t => t.toLowerCase() === clean.toLowerCase());
      return exists ? prev : [...prev, clean];
    });
    setRelatedDraft('');
  }, [setRelatedTerms]);

  const removeRelated = React.useCallback((term) => {
    setRelatedTerms(prev => prev.filter(t => t !== term));
  }, [setRelatedTerms]);

  return (
    <div className="searchrow">
      <div className="advanced-panel">
        <div className="mode view-toggle" role="tablist" data-tip={T('view_tip')}>
          <button
            className={view === 'documents' ? 'active' : ''}
            onClick={() => setView('documents')}
          >
            <span className="mdot"></span>{T('view_documents')}
          </button>
          <button
            className={view === 'occurrences' ? 'active' : ''}
            onClick={() => setView('occurrences')}
          >
            <span className="mdot"></span>{T('view_occurrences')}
          </button>
        </div>

        {!isOccurrences && (
          <div className="mode" role="tablist">
            {[
              { id: 'bm25',     label: T('mode_keyword'),  sub: 'BM25'       },
              { id: 'hybrid',   label: T('mode_hybrid'),   sub: 'BM25 + vec' },
              { id: 'semantic', label: T('mode_semantic'), sub: 'vec'        },
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
        )}

        <label className="search-option" data-tip={T('whole_word_tip')}>
          <input
            type="checkbox"
            checked={wholeWord}
            onChange={(e) => setWholeWord(e.target.checked)}
          />
          <span>{T('whole_word')}</span>
        </label>

        <label className="search-option" data-tip={T('match_case_tip')}>
          <input
            type="checkbox"
            checked={matchCase}
            onChange={(e) => setMatchCase(e.target.checked)}
          />
          <span>{T('match_case')}</span>
        </label>

        <div className="related-control">
          <span className="related-label">{T('related_terms')}</span>
          <div className="related-box">
            {relatedTerms.map(term => (
              <button key={term} className="related-chip" onClick={() => removeRelated(term)} type="button">
                {term}<span aria-hidden="true">x</span>
              </button>
            ))}
            <input
              value={relatedDraft}
              onChange={e => setRelatedDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addRelated(relatedDraft.replace(/,$/, ''));
                }
              }}
              onBlur={() => addRelated(relatedDraft)}
              placeholder={T('related_placeholder')}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
