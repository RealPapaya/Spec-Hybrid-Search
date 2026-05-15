// DocumentsView — full-screen "Files" view (explorer + list, tag sidebar).

function _countFiles(node) {
  return node.files.length + Object.values(node.children).reduce((s, c) => s + _countFiles(c), 0);
}

function FileActionPanel({ doc, tagsData, setTagsData, onOpen, allowTagEdit = true }) {
  const T = useT();
  const [newName, setNewName] = React.useState('');
  const assigned = tagsData.assignments[doc.doc_id] || [];
  const assignedTags = tagsData.customTags.filter(t => assigned.includes(t.id));
  const availableTags = tagsData.customTags.filter(t => !assigned.includes(t.id));

  const setDocTags = (nextIds) => {
    const assignments = { ...(tagsData.assignments || {}) };
    if (nextIds.length) assignments[doc.doc_id] = nextIds;
    else delete assignments[doc.doc_id];
    const nd = { ...tagsData, assignments };
    setTagsData(nd);
    saveTagsData(nd);
  };

  const addTag = (tagId) => {
    if (!assigned.includes(tagId)) setDocTags([...assigned, tagId]);
  };

  const removeTag = (tagId) => {
    setDocTags(assigned.filter(id => id !== tagId));
  };

  const createAndAssignTag = () => {
    const name = newName.trim();
    if (!name) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2,5);
    const color = TAG_COLORS[tagsData.customTags.length % TAG_COLORS.length];
    const nd = {
      ...tagsData,
      customTags: [...tagsData.customTags, { id, name, color }],
      assignments: { ...(tagsData.assignments || {}), [doc.doc_id]: [...assigned, id] },
    };
    setTagsData(nd);
    saveTagsData(nd);
    setNewName('');
  };

  return (
    <div className="file-action-panel" onClick={e => e.stopPropagation()}>
      <button className="iconbtn" onClick={() => onOpen(doc)}>
        <Icon.external /> {T('docs_open')}
      </button>
      {allowTagEdit && (
        <>
          <div className="file-action-tags">
            {assignedTags.map(tag => (
              <button key={tag.id} className="tag-action-chip on" onClick={() => removeTag(tag.id)} data-tip={T('docs_remove_tag')}>
                <span style={{ background: tag.color }}></span>
                {tag.name}
                <Icon.trash />
              </button>
            ))}
            {availableTags.map(tag => (
              <button key={tag.id} className="tag-action-chip" onClick={() => addTag(tag.id)} data-tip={T('docs_add_tag')}>
                <span style={{ background: tag.color }}></span>
                {tag.name}
              </button>
            ))}
          </div>
          <div className="tag-assign-new inline">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createAndAssignTag(); e.stopPropagation(); }}
              placeholder={T('docs_new_tag')}
            />
            <button onClick={createAndAssignTag}>{T('docs_add')}</button>
          </div>
        </>
      )}
    </div>
  );
}

function ExplorerFileRow({ doc, tagsData, setTagsData, onOpen, allowTagEdit = true }) {
  const [expanded, setExpanded] = React.useState(false);
  const assigned = tagsData.assignments[doc.doc_id] || [];
  const assignedTags = tagsData.customTags.filter(t => assigned.includes(t.id));
  return (
    <div className={'explorer-file-item' + (expanded ? ' expanded' : '')}>
      <div className="explorer-file-row" onClick={() => setExpanded(prev => !prev)}>
        <svg className="caret" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
          <polyline points="3,1.5 7,5 3,8.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ flexShrink: 0, color: 'var(--fg-faint)' }}><path d="M3.5 1h5l3 3v9H3.5z" strokeLinejoin="round"/><path d="M8.5 1v3h3" strokeLinejoin="round"/></svg>
        <span className="file-name" title={doc.filepath}>{doc.filename}</span>
        <div className="file-tags">
          {assignedTags.slice(0,2).map(tag => (
            <span key={tag.id} className="tag-pill tag-pill-custom" style={{ background: tag.color, maxWidth: 64 }}>{tag.name}</span>
          ))}
        </div>
      </div>
      {expanded && <FileActionPanel doc={doc} tagsData={tagsData} setTagsData={setTagsData} onOpen={onOpen} allowTagEdit={allowTagEdit} />}
    </div>
  );
}

function ExplorerNode({ name, children, files, depth, tagsData, setTagsData, onOpenFile, allowTagEdit = true }) {
  const [open, setOpen] = React.useState(depth === 0);
  const childEntries = Object.entries(children).sort(([a],[b]) => a.localeCompare(b));
  const totalCount = _countFiles({ children, files });
  return (
    <div>
      <div className={'explorer-folder-row' + (open ? ' open' : '')} onClick={() => setOpen(!open)}>
        <svg className="caret" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
          <polyline points="3,1.5 7,5 3,8.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style={{ opacity: 0.55, flexShrink: 0 }}><path d="M1 2.5A1 1 0 0 1 2 1.5h3.1a1 1 0 0 1 .71.3l.69.7H12a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2.5z"/></svg>
        <span>{name}</span>
        <span className="folder-count">{totalCount}</span>
      </div>
      {open && (
        <div className="explorer-children">
          {childEntries.map(([n, node]) => (
            <ExplorerNode key={n} name={n} {...node} depth={depth+1} tagsData={tagsData} setTagsData={setTagsData} onOpenFile={onOpenFile} allowTagEdit={allowTagEdit} />
          ))}
          {files.map(doc => (
            <ExplorerFileRow key={doc.doc_id} doc={doc} tagsData={tagsData} setTagsData={setTagsData} onOpen={onOpenFile} allowTagEdit={allowTagEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocCard({ doc, tagsData, setTagsData, onOpen, allowTagEdit = true }) {
  const T = useT();
  const [expanded, setExpanded] = React.useState(false);
  const ext = (doc.filename.match(/\.([^.]+)$/) || ['',''])[1].toUpperCase();
  const folder = getFolderName(doc.filepath);
  const assigned = tagsData.assignments[doc.doc_id] || [];
  const assignedTags = tagsData.customTags.filter(t => assigned.includes(t.id));
  const sizeStr = doc.file_size ? (doc.file_size >= 1048576 ? (doc.file_size/1048576).toFixed(1)+' MB' : Math.round(doc.file_size/1024)+' KB') : '';
  const extColors = { PDF: ['#ef4444','#fef2f2'], DOCX: ['#3b82f6','#eff6ff'], XLSX: ['#10b981','#ecfdf5'], PPTX: ['#f59e0b','#fffbeb'] };
  const [fg, bg] = extColors[ext] || ['var(--fg-faint)','var(--bg-soft)'];
  return (
    <div className={'doc-card' + (expanded ? ' expanded' : '')} onClick={() => setExpanded(prev => !prev)}>
      <div className="doc-card-main">
        <svg className="caret" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
          <polyline points="3,1.5 7,5 3,8.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div className="doc-icon" style={{ color: fg, background: bg, border: '1px solid ' + fg + '33' }}>{ext || '?'}</div>
        <div className="doc-body">
          <div className="doc-name" title={doc.filepath}>{doc.filename}</div>
          <div className="doc-meta">
            {folder && <><span style={{ color: 'var(--accent)' }}>{folder}</span><span className="sep">·</span></>}
            {sizeStr && <><span>{sizeStr}</span>{doc.chunk_count > 0 && <span className="sep">·</span>}</>}
            {doc.chunk_count > 0 && <span>{doc.chunk_count} {T('docs_chunks')}</span>}
          </div>
          {(folder || assignedTags.length > 0) && (
            <div className="doc-tags">
              {folder && <span className="tag-pill tag-pill-folder">{folder}</span>}
              {assignedTags.map(tag => (
                <span key={tag.id} className="tag-pill tag-pill-custom" style={{ background: tag.color }}>{tag.name}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {expanded && <FileActionPanel doc={doc} tagsData={tagsData} setTagsData={setTagsData} onOpen={onOpen} allowTagEdit={allowTagEdit} />}
    </div>
  );
}

function DocumentsView({ onBack, tagsData, setTagsData, watchedDir }) {
  const T = useT();
  const lang = React.useContext(LangCtx);
  const [docs, setDocs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [viewMode, setViewMode] = React.useState('explorer');
  const [tagMode, setTagMode] = React.useState('manual');
  const [tagApplyMessage, setTagApplyMessage] = React.useState('');
  const [newTagName, setNewTagName] = React.useState('');
  const [filterText, setFilterText] = React.useState('');

  const fetchDocs = React.useCallback(() => {
    return fetch('/api/documents').then(r => r.json()).then(d => { setDocs(d.documents || []); }).catch(() => {});
  }, []);

  React.useEffect(() => {
    fetchDocs().finally(() => setLoading(false));
  }, [fetchDocs]);

  // Trigger a background re-index, then refresh the document list.
  const handleRefresh = React.useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetch('/api/index', { method: 'POST' });
      // Poll until the index job settles (up to ~10 s), then reload the list.
      await new Promise(resolve => setTimeout(resolve, 2000));
      await fetchDocs();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, fetchDocs]);

  const filtered = React.useMemo(() => {
    let ds = docs;
    if (filterText.trim()) { const q = filterText.toLowerCase(); ds = ds.filter(d => d.filename.toLowerCase().includes(q) || d.filepath.toLowerCase().includes(q)); }
    return ds;
  }, [docs, filterText]);

  const openDoc = (doc) => window.open('/api/file/' + encodeURIComponent(doc.doc_id), '_blank', 'noopener');

  const createTag = React.useCallback((name) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2,5);
    const color = TAG_COLORS[tagsData.customTags.length % TAG_COLORS.length];
    const nd = { ...tagsData, customTags: [...tagsData.customTags, { id, name: cleanName, color }] };
    setTagsData(nd);
    saveTagsData(nd);
    setNewTagName('');
  }, [tagsData, setTagsData]);

  const updateTag = React.useCallback((tagId, patch) => {
    const nd = {
      ...tagsData,
      customTags: tagsData.customTags.map(tag => tag.id === tagId ? { ...tag, ...patch } : tag),
    };
    setTagsData(nd);
    saveTagsData(nd);
  }, [tagsData, setTagsData]);

  const deleteTag = React.useCallback((tagId) => {
    const tag = tagsData.customTags.find(t => t.id === tagId);
    if (!tag) return;
    const msg = lang === 'zh'
      ? `確定要刪除標籤「${tag.name}」？`
      : `Delete tag "${tag.name}"?`;
    if (!window.confirm(msg)) return;

    const assignments = {};
    Object.entries(tagsData.assignments || {}).forEach(([docId, ids]) => {
      const next = Array.isArray(ids) ? ids.filter(id => id !== tagId) : [];
      if (next.length) assignments[docId] = next;
    });
    const nd = {
      ...tagsData,
      customTags: tagsData.customTags.filter(t => t.id !== tagId),
      assignments,
    };
    setTagsData(nd);
    saveTagsData(nd);
  }, [tagsData, setTagsData, lang]);

  const applyFolderTags = React.useCallback(() => {
    const msg = lang === 'zh'
      ? '確定要依子目錄套用標籤？'
      : 'Apply folder tags to all files?';
    if (!window.confirm(msg)) return;

    const customTags = [...tagsData.customTags];
    const assignments = {};
    Object.entries(tagsData.assignments || {}).forEach(([docId, ids]) => {
      assignments[docId] = Array.isArray(ids) ? [...ids] : [];
    });

    const tagByName = new Map(customTags.map(tag => [tag.name.trim().toLowerCase(), tag.id]));
    let created = 0;
    let changedDocs = 0;

    docs.forEach(doc => {
      const folder = getFolderName(doc.filepath);
      const key = folder.trim().toLowerCase();
      if (!key) return;

      let tagId = tagByName.get(key);
      if (!tagId) {
        tagId = Date.now().toString(36) + Math.random().toString(36).slice(2,5) + created;
        const color = TAG_COLORS[customTags.length % TAG_COLORS.length];
        customTags.push({ id: tagId, name: folder, color });
        tagByName.set(key, tagId);
        created += 1;
      }

      const cur = assignments[doc.doc_id] || [];
      if (!cur.includes(tagId)) {
        assignments[doc.doc_id] = [...cur, tagId];
        changedDocs += 1;
      }
    });

    const nd = { ...tagsData, customTags, assignments };
    setTagsData(nd);
    saveTagsData(nd);
    setTagApplyMessage(lang === 'zh'
      ? `已套用 ${changedDocs} 份檔案，新增 ${created} 個標籤`
      : `Applied ${changedDocs} files, created ${created} tags`);
  }, [docs, tagsData, setTagsData, lang]);

  const removeAllTags = React.useCallback(() => {
    const msg = lang === 'zh'
      ? '確定要刪除全部標籤與所有檔案指派？'
      : 'Remove all tags and all file assignments?';
    if (!window.confirm(msg)) return;

    const nd = { ...tagsData, customTags: [], assignments: {} };
    setTagsData(nd);
    saveTagsData(nd);
    setTagApplyMessage(lang === 'zh' ? '已移除全部標籤' : 'Removed all tags');
  }, [tagsData, setTagsData, lang]);

  const tree = React.useMemo(() => {
    const base = watchedDir ? watchedDir.replace(/\\/g, '/').replace(/\/$/, '') + '/' : null;
    const root = { name: lang === 'zh' ? '全部檔案' : 'All Files', children: {}, files: [] };
    filtered.forEach(doc => {
      const fullPath = doc.filepath.replace(/\\/g, '/');
      let rel = (base && fullPath.startsWith(base)) ? fullPath.slice(base.length) : doc.filename;
      const parts = rel.split('/'); parts.pop();
      let node = root;
      parts.forEach(part => {
        if (!part) return;
        if (!node.children[part]) node.children[part] = { name: part, children: {}, files: [] };
        node = node.children[part];
      });
      node.files.push(doc);
    });
    return root;
  }, [filtered, watchedDir, lang]);

  return (
    <section className="docs-view">
      <div className="docs-toolbar">
        <button className="iconbtn" onClick={onBack}><Icon.back /> <span style={{ fontSize: 11 }}>{T('docs_back')}</span></button>
        <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }}></div>
        <div className="searchbox" style={{ height: 28, flex: '0 1 260px' }}>
          <div className="glass"><Icon.search /></div>
          <input value={filterText} onChange={e => setFilterText(e.target.value)} placeholder={T('docs_search')} style={{ fontSize: 12 }} />
        </div>
        <span className="spacer"></span>
        <button
          className="iconbtn"
          onClick={handleRefresh}
          disabled={refreshing}
          data-tip={T('docs_refresh')}
          style={refreshing ? { opacity: 0.6 } : null}
        >
          <span style={refreshing ? { display: 'inline-flex', animation: 'spin 0.8s linear infinite' } : { display: 'inline-flex' }}>
            <Icon.refresh />
          </span>
          <span style={{ fontSize: 11 }}>{T('docs_refresh')}</span>
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }}></div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-faint)' }}>
          {filtered.length}{docs.length !== filtered.length ? ' / ' + docs.length : ''} {lang === 'zh' ? '份文件' : 'files'}
        </span>
        <div className="docs-view-toggle">
          <button className={viewMode === 'list' ? 'on' : ''} onClick={() => setViewMode('list')} data-tip={T('docs_list')}><Icon.rows /></button>
          <button className={viewMode === 'explorer' ? 'on' : ''} onClick={() => setViewMode('explorer')} data-tip={T('docs_explorer')}><Icon.tree /></button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Left tag sidebar */}
        <div style={{ width: 196, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg-elev)', overflowY: 'auto', padding: '4px 0' }}>
          <div className="fgroup">
            <div className="fgroup-title"><span>{T('docs_tag_mode')}</span></div>
            <div className="tag-mode-toggle">
              <button className={tagMode === 'auto' ? 'on' : ''} onClick={() => setTagMode('auto')}>{T('docs_auto_tags')}</button>
              <button className={tagMode === 'manual' ? 'on' : ''} onClick={() => setTagMode('manual')}>{T('docs_manual_tags')}</button>
            </div>
            {tagMode === 'auto' && (
              <>
                <button className="tag-manager-apply" onClick={applyFolderTags}>{T('docs_apply_folder_tags')}</button>
                <button className="tag-manager-apply danger" onClick={removeAllTags}>{T('docs_remove_all_tags')}</button>
                {tagApplyMessage && <div className="tag-manager-message">{tagApplyMessage}</div>}
              </>
            )}
          </div>
          <div className="fgroup">
            <div className="fgroup-title">
              <span>{T('docs_tags')}</span>
            </div>
            {tagsData.customTags.map(tag => {
              return (
                <div key={tag.id} className="tag-editor-row">
                  <input
                    type="color"
                    value={tag.color}
                    onChange={e => updateTag(tag.id, { color: e.target.value })}
                    data-tip={lang === 'zh' ? '顏色' : 'Color'}
                  />
                  <input
                    className="tag-editor-name"
                    defaultValue={tag.name}
                    onBlur={e => {
                      const name = e.target.value.trim();
                      if (name && name !== tag.name) updateTag(tag.id, { name });
                      else e.target.value = tag.name;
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      e.stopPropagation();
                    }}
                  />
                  <button className="iconbtn tag-delete-btn" onClick={() => deleteTag(tag.id)} data-tip={T('bookmarks_remove')}>
                    <Icon.trash />
                  </button>
                </div>
              );
            })}
            <div className="new-tag-row" style={{ paddingTop: 8 }}>
              <input
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                placeholder={lang === 'zh' ? '新增標籤...' : 'New tag...'}
                onKeyDown={e => {
                  if (e.key === 'Enter') createTag(newTagName);
                  e.stopPropagation();
                }}
              />
              <button onClick={() => createTag(newTagName)}>{T('docs_add')}</button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="docs-body" style={{ flex: 1 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <div style={{ width: 22, height: 22, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <div>
                <div className="ico"><Icon.page /></div>
                <div className="title">{T('docs_empty')}</div>
                <div className="hint">{T('docs_empty_hint')}</div>
              </div>
            </div>
          ) : viewMode === 'explorer' ? (
            <div className="explorer-root">
              {Object.entries(tree.children).sort(([a],[b]) => a.localeCompare(b)).map(([n, node]) => (
                <ExplorerNode key={n} name={n} {...node} depth={0} tagsData={tagsData} setTagsData={setTagsData} onOpenFile={openDoc} allowTagEdit={tagMode === 'manual'} />
              ))}
              {tree.files.map(doc => (
                <ExplorerFileRow key={doc.doc_id} doc={doc} tagsData={tagsData} setTagsData={setTagsData} onOpen={openDoc} allowTagEdit={tagMode === 'manual'} />
              ))}
            </div>
          ) : (
            <div className="doc-grid">
              {filtered.map(doc => (
                <DocCard key={doc.doc_id} doc={doc} tagsData={tagsData} setTagsData={setTagsData} onOpen={openDoc} allowTagEdit={tagMode === 'manual'} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
