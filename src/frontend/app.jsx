// App — top-level component. Wires state (search results, filters, prefs,
// tweaks, bookmarks, view routing), data fetching (/api/search, /api/status),
// preference persistence, and the resizable layout. Must load LAST.

function App() {
  const saved = React.useMemo(loadPrefs, []);

  const [theme,    setTheme]    = React.useState(saved.theme    || 'light');
  const [lang,     setLang]     = React.useState(saved.lang     || 'en');
  const [query,    setQuery]    = React.useState('');
  const [mode,     setMode]     = React.useState('hybrid');
  const [filters,  setFilters]  = React.useState({ vendor: [], type: [], category: [], tags: [], folder: [] });
  const [selectedId, setSelectedId] = React.useState(null);
  const [sortKey,  setSortKey]  = React.useState('score');
  const [cardMode, setCardMode] = React.useState(saved.cardMode || 'detailed');
  const [totalMs, setTotalMs]   = React.useState(0);

  // Tags data (custom tags + assignments, persisted in localStorage)
  const [tagsData, setTagsData] = React.useState(loadTagsData);

  // API state
  const [results,     setResults]     = React.useState([]);
  const [loading,     setLoading]     = React.useState(false);
  const [error,       setError]       = React.useState(null);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [status,      setStatus]      = React.useState({ ok: false, total_documents: 0, total_chunks: 0, collection_points: 0 });

  // View routing: 'search' (default), 'bookmarks', or 'documents'
  const [view, setView] = React.useState('search');

  // Rail resize (left: filters | results)
  const [railW, setRailW] = React.useState(240);
  const resizerPillRef = React.useRef(null);
  React.useEffect(() => {
    document.documentElement.style.setProperty('--rail-w', railW + 'px');
  }, [railW]);
  const onResizerMouseDown = React.useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = railW;
    resizerPillRef.current?.classList.add('dragging');
    const onMove = (ev) => {
      const next = Math.max(140, Math.min(480, startW + ev.clientX - startX));
      setRailW(next);
    };
    const onUp = () => {
      resizerPillRef.current?.classList.remove('dragging');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [railW]);

  // Preview resize (right: results | preview)
  const [previewW, setPreviewW] = React.useState(460);
  const previewPillRef = React.useRef(null);
  React.useEffect(() => {
    document.documentElement.style.setProperty('--preview-w', previewW + 'px');
  }, [previewW]);
  const onPreviewResizerMouseDown = React.useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = previewW;
    previewPillRef.current?.classList.add('dragging');
    const onMove = (ev) => {
      const next = Math.max(300, Math.min(800, startW - (ev.clientX - startX)));
      setPreviewW(next);
    };
    const onUp = () => {
      previewPillRef.current?.classList.remove('dragging');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [previewW]);

  // Bookmarks (lifted up so Topbar count + Bookmarks page + PreviewPanel share one source)
  const [bookmarks, setBookmarks] = React.useState(loadBookmarks);
  const bookmarkCount = Object.keys(bookmarks).length;
  const [settingsLoaded, setSettingsLoaded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    loadLocalSettingsFile()
      .then(settings => {
        if (!alive) return;
        const hasLocalFile = !!(settings && settings._exists);
        const prefs = settings && settings.prefs && typeof settings.prefs === 'object' ? settings.prefs : {};
          if (Object.keys(prefs).length) {
          if (prefs.theme) setTheme(prefs.theme);
          if (prefs.lang) setLang(prefs.lang);
          if (prefs.cardMode) setCardMode(prefs.cardMode);
          const nextTweaks = {};
          ['layout', 'density', 'accent', 'fontSans', 'fontMono', 'fontDisplay', 'cardMode', 'highlight'].forEach(key => {
            if (prefs[key]) nextTweaks[key] = prefs[key];
          });
          // Backward compatibility: migrate old 'typeset' to individual fonts
          if (prefs.typeset && !prefs.fontSans && !prefs.fontMono && !prefs.fontDisplay) {
            if (prefs.typeset === 'inter-mono') {
              nextTweaks.fontSans = 'inter';
              nextTweaks.fontMono = 'jetbrains-mono';
              nextTweaks.fontDisplay = 'inter';
            } else if (prefs.typeset === 'ibm-plex') {
              nextTweaks.fontSans = 'ibm-plex-sans';
              nextTweaks.fontMono = 'ibm-plex-mono';
              nextTweaks.fontDisplay = 'ibm-plex-sans';
            } else if (prefs.typeset === 'serif-mono') {
              nextTweaks.fontSans = 'inter';
              nextTweaks.fontMono = 'jetbrains-mono';
              nextTweaks.fontDisplay = 'source-serif';
            }
          }
          setTweakState(prev => ({ ...prev, ...nextTweaks }));
        }
        if (settings && settings.tags && Array.isArray(settings.tags.customTags)) {
          const hasTags = settings.tags.customTags.length || Object.keys(settings.tags.assignments || {}).length;
          if (hasLocalFile || hasTags) {
            setTagsData(settings.tags);
            try { localStorage.setItem(TAGS_KEY, JSON.stringify(settings.tags)); } catch(e) {}
          }
        }
        if (settings && settings.bookmarks && typeof settings.bookmarks === 'object') {
          if (hasLocalFile || Object.keys(settings.bookmarks).length) {
            setBookmarks(settings.bookmarks);
            try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(settings.bookmarks)); } catch(e) {}
          }
        }
      })
      .finally(() => { if (alive) setSettingsLoaded(true); });
    return () => { alive = false; };
  }, []);

  // Poll backend status so the topbar dot reflects reality.
  React.useEffect(() => {
    let alive = true;
    const fetchStatus = async () => {
      try {
        const r = await fetch('/api/status');
        if (!r.ok) throw new Error('status ' + r.status);
        const d = await r.json();
        if (alive) setStatus({ ok: true, ...d });
      } catch(e) {
        if (alive) setStatus(s => ({ ...s, ok: false }));
      }
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 10000);
    return () => { alive = false; clearInterval(id); };
  }, []);

        const [tweaks, setTweakState] = React.useState({
    layout:      saved.layout      || 'sidebar',
    density:     saved.density     || 'balanced',
    accent:      saved.accent      || 'indigo',
    fontSans:    saved.fontSans    || 'inter',
    fontMono:    saved.fontMono    || 'jetbrains-mono',
    fontDisplay: saved.fontDisplay || 'inter',
    cardMode:    saved.cardMode    || 'detailed',
    highlight:   saved.highlight    || 'yellow',
  });

  const setTweak = React.useCallback((keyOrObj, val) => {
    const edits = typeof keyOrObj === 'object' ? keyOrObj : { [keyOrObj]: val };
    setTweakState(prev => ({ ...prev, ...edits }));
  }, []);

  // Persist preferences to localStorage and, after startup load, to the .local file.
  React.useEffect(() => {
    const data = { theme, lang, ...tweaks };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(data)); } catch(e) {}
    if (settingsLoaded) saveLocalSettingsPatch({ prefs: data });
  }, [theme, lang, tweaks, settingsLoaded]);

  React.useEffect(() => {
    if (settingsLoaded) saveLocalSettingsPatch({ tags: tagsData });
  }, [tagsData, settingsLoaded]);

  React.useEffect(() => {
    if (settingsLoaded) saveLocalSettingsPatch({ bookmarks });
  }, [bookmarks, settingsLoaded]);

        // Apply all preferences to the document root
  React.useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme       = theme;
    r.dataset.layout      = tweaks.layout;
    r.dataset.density     = tweaks.density;
    r.dataset.accent      = tweaks.accent;
    r.dataset.fontSans    = tweaks.fontSans;
    r.dataset.fontMono    = tweaks.fontMono;
    r.dataset.fontDisplay = tweaks.fontDisplay;
    r.dataset.card        = tweaks.cardMode;
    r.dataset.highlight   = tweaks.highlight;
    r.lang                = lang === 'zh' ? 'zh-TW' : 'en';
  }, [theme, lang, tweaks]);

  const allResults = results;

  const onSearch = React.useCallback(async () => {
    if (!query.trim()) return;
    const t0 = Date.now();
    setLoading(true);
    setError(null);
    try {
      const modeParam = mode === 'bm25' ? 'keyword' : mode;
      const res = await fetch(
        '/api/search?q=' + encodeURIComponent(query) +
        '&mode=' + modeParam +
        '&limit=20'
      );
      if (!res.ok) throw new Error('Server error ' + res.status);
      const data = await res.json();
      const mapped = (data.results || []).map((r, i) => mapResult(r, query, i));
      setResults(mapped);
      setTotalMs(data.took_ms != null ? Math.round(data.took_ms) : Date.now() - t0);
      setHasSearched(true);
      setSelectedId(mapped.length > 0 ? mapped[0].id : null);
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [query, mode]);

  const watchedDir = status.watched_docs_dir || '';
  const filtered = React.useMemo(() => {
    const base = watchedDir ? watchedDir.replace(/\\/g, '/').replace(/\/$/, '') + '/' : '';
    let rs = allResults.filter(r => {
      if (filters.vendor.length && !filters.vendor.includes(r.vendor)) return false;
      if (filters.type.length   && filters.type.includes(r.type))      return false;
      if (filters.folder && filters.folder.length) {
        const fp = (r.filepath || '').replace(/\\/g, '/');
        const rel = (base && fp.startsWith(base)) ? fp.slice(base.length) : fp;
        const excluded = filters.folder.some(prefix => prefix === '' ? true : (rel === prefix || rel.startsWith(prefix + '/')));
        if (excluded) return false;
      }
      if (filters.tags && filters.tags.length) {
        const assigned = tagsData.assignments[r.doc_id] || [];
        const excluded = filters.tags.some(key => {
          if (key.startsWith('custom:')) return assigned.includes(key.slice(7));
          return false;
        });
        if (excluded) return false;
      }
      return true;
    });
    if      (sortKey === 'name') rs = [...rs].sort((a, b) => a.spec.localeCompare(b.spec));
    else                         rs = [...rs].sort((a, b) => b.score - a.score);
    return rs;
  }, [filters, sortKey, allResults, tagsData, watchedDir]);

  React.useEffect(() => {
    if (filtered.length && !filtered.find(r => r.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selected   = filtered.find(r => r.id === selectedId) || null;
  const openPrefs  = () => window.postMessage({ type: '__activate_edit_mode' }, '*');
  const prefsTitle = lang === 'zh' ? '偏好設定' : 'Preferences';

  const inBookmarks = view === 'bookmarks';
  const inDocuments = view === 'documents';
  const inSearch    = !inBookmarks && !inDocuments;

  return (
    <ConfirmDialogProvider>
    <LangCtx.Provider value={lang}>
      <div className="app">
        <Topbar
          theme={theme} setTheme={setTheme}
          lang={lang} setLang={setLang}
          onOpenPrefs={openPrefs}
          status={status}
          view={view} setView={setView}
          bookmarkCount={bookmarkCount}
        />
        {inSearch && <SearchRow query={query} setQuery={setQuery} mode={mode} setMode={setMode} onSearch={onSearch} />}
        {inSearch && <TopFilters filters={filters} setFilters={setFilters} allResults={allResults} />}
        <div className={`main ${(inSearch && !hasSearched) ? 'empty-state' : ''}`}>
          {inDocuments ? (
            <DocumentsView
              onBack={() => setView('search')}
              tagsData={tagsData}
              setTagsData={setTagsData}
              watchedDir={watchedDir}
            />
          ) : inBookmarks ? (
            <BookmarksView
              bookmarks={bookmarks}
              setBookmarks={setBookmarks}
              onBack={() => setView('search')}
            />
          ) : loading ? (
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'var(--fg2)', fontSize: 15 }}>
              <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              {lang === 'zh' ? '搜尋中...' : 'Searching...'}
            </div>
          ) : error ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--fg2)', fontSize: 15 }}>
              <div style={{ fontSize: 32 }}>⚠</div>
              <div style={{ fontWeight: 600 }}>{lang === 'zh' ? '搜尋失敗' : 'Search failed'}</div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>{error}</div>
            </div>
          ) : !hasSearched ? (
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'var(--fg2)', textAlign: 'center', padding: '0 32px' }}>
              <div style={{ fontSize: 48, opacity: 0.3 }}>🔍</div>
              <div style={{ fontSize: 18, fontWeight: 600, opacity: 0.6 }}>{lang === 'zh' ? '開始搜尋您的文件' : 'Search your documents'}</div>
              <div style={{ fontSize: 13, opacity: 0.45, maxWidth: 320 }}>
                {lang === 'zh'
                  ? '將 PDF、DOCX、XLSX、PPTX 放入 watched_docs 資料夾，輸入關鍵字即可搜尋'
                  : 'Drop PDF, DOCX, XLSX, or PPTX files into the watched_docs folder, then type a query above'}
              </div>
            </div>
          ) : (
            <>
              <FiltersRail filters={filters} setFilters={setFilters} allResults={allResults} tagsData={tagsData} watchedDir={watchedDir} />
              <div className="resizer" onMouseDown={onResizerMouseDown}>
                <div ref={resizerPillRef} className="resizer-pill" />
              </div>
              <ResultsPanel
                results={filtered}
                selectedId={selectedId}
                onSelect={setSelectedId}
                sortKey={sortKey}
                setSortKey={setSortKey}
                cardMode={cardMode}
                setCardMode={c => { setCardMode(c); setTweak('cardMode', c); }}
                totalMs={totalMs}
                tagsData={tagsData}
              />
              <div className="resizer" onMouseDown={onPreviewResizerMouseDown}>
                <div ref={previewPillRef} className="resizer-pill" />
              </div>
              <PreviewPanel result={selected} bookmarks={bookmarks} setBookmarks={setBookmarks} />
            </>
          )}
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
              label={lang === 'zh' ? '內文字型 (Sans)' : 'Body font (Sans)'}
              value={tweaks.fontSans}
              onChange={v => setTweak('fontSans', v)}
              options={[
                { value: 'inter',          label: 'Inter' },
                { value: 'ibm-plex-sans',  label: 'IBM Plex Sans' },
                { value: 'jetbrains-mono', label: 'JetBrains Mono' },
                { value: 'system',         label: lang === 'zh' ? '系統字型' : 'System' },
              ]}
            />
            <TweakSelect
              label={lang === 'zh' ? '等寬字型 (Mono)' : 'Monospace font'}
              value={tweaks.fontMono}
              onChange={v => setTweak('fontMono', v)}
              options={[
                { value: 'jetbrains-mono', label: 'JetBrains Mono' },
                { value: 'ibm-plex-mono',  label: 'IBM Plex Mono' },
                { value: 'fira-code',      label: 'Fira Code' },
                { value: 'consolas',       label: 'Consolas' },
              ]}
            />
            <TweakSelect
              label={lang === 'zh' ? '標題字型 (Display)' : 'Heading font (Display)'}
              value={tweaks.fontDisplay}
              onChange={v => setTweak('fontDisplay', v)}
              options={[
                { value: 'inter',          label: 'Inter' },
                { value: 'ibm-plex-sans',  label: 'IBM Plex Sans' },
                { value: 'source-serif',   label: 'Source Serif 4' },
                { value: 'jetbrains-mono', label: 'JetBrains Mono' },
                { value: 'system',         label: lang === 'zh' ? '系統字型' : 'System' },
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
    </ConfirmDialogProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
