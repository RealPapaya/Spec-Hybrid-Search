// TagAssignMenu — floating popup to assign custom tags to a document.
// TagsFilterGroup — sidebar widget listing folder + custom tag filters.

function TagAssignMenu({ doc_id, tagsData, setTagsData, anchorRect, onClose }) {
  const T = useT();
  const [newName, setNewName] = React.useState('');
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) onClose(); };
    const khandler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', khandler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', khandler); };
  }, [onClose]);

  const assigned = tagsData.assignments[doc_id] || [];
  const toggle = (tagId) => {
    const cur = tagsData.assignments[doc_id] || [];
    const next = cur.includes(tagId) ? cur.filter(x => x !== tagId) : [...cur, tagId];
    const nd = { ...tagsData, assignments: { ...tagsData.assignments, [doc_id]: next } };
    setTagsData(nd); saveTagsData(nd);
  };
  const createTag = () => {
    const name = newName.trim(); if (!name) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2,5);
    const color = TAG_COLORS[tagsData.customTags.length % TAG_COLORS.length];
    const cur = tagsData.assignments[doc_id] || [];
    const nd = { customTags: [...tagsData.customTags, { id, name, color }], assignments: { ...tagsData.assignments, [doc_id]: [...cur, id] } };
    setTagsData(nd); saveTagsData(nd); setNewName('');
  };
  const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 250);
  const left = Math.min(anchorRect.left, window.innerWidth - 220);

  return (
    <div className="tag-assign-menu" ref={menuRef} style={{ top, left }}>
      {tagsData.customTags.length > 0 && (
        <>
          <div className="menu-sect">{T('docs_tags_custom')}</div>
          {tagsData.customTags.map(tag => (
            <div key={tag.id} className={'tag-assign-item' + (assigned.includes(tag.id) ? ' on' : '')} onClick={() => toggle(tag.id)}>
              <div className="chk"></div>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color, flexShrink: 0, display: 'inline-block' }}></span>
              <span>{tag.name}</span>
            </div>
          ))}
        </>
      )}
      <div className="tag-assign-new">
        <input value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { createTag(); } e.stopPropagation(); }}
          placeholder={T('docs_new_tag')} autoFocus />
        <button onClick={createTag}>{T('docs_add')}</button>
      </div>
    </div>
  );
}

function TagsFilterGroup({ filters, setFilters, allResults, tagsData, setTagsData }) {
  const T = useT();
  const [newName, setNewName] = React.useState('');

  const folderCounts = React.useMemo(() => {
    const c = {};
    allResults.forEach(r => { const f = getFolderName(r.filepath); if (f) c[f] = (c[f]||0)+1; });
    return c;
  }, [allResults]);
  const folderNames = Object.keys(folderCounts).sort();
  const activeTags = filters.tags || [];

  const toggleTag = (key) => {
    const next = activeTags.includes(key) ? activeTags.filter(x => x !== key) : [...activeTags, key];
    setFilters({ ...filters, tags: next });
  };
  const createTag = () => {
    const name = newName.trim(); if (!name) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2,5);
    const color = TAG_COLORS[tagsData.customTags.length % TAG_COLORS.length];
    const nd = { ...tagsData, customTags: [...tagsData.customTags, { id, name, color }] };
    setTagsData(nd); saveTagsData(nd); setNewName('');
  };

  return (
    <div className="fgroup">
      <div className="fgroup-title">
        <span>{T('docs_tags')}</span>
        {activeTags.length > 0 && <span className="clear" onClick={() => setFilters({ ...filters, tags: [] })}>{T('f_clear')}</span>}
      </div>

      {folderNames.length > 0 && (
        <>
          <div className="fgroup-subsect">{T('docs_tags_folder')}</div>
          {folderNames.map(f => {
            const key = 'folder:' + f;
            const on = activeTags.includes(key);
            return (
              <div key={key} className={'fitem' + (on ? ' on' : '')} onClick={() => toggleTag(key)}>
                <div className="checkbox"><Icon.check /></div>
                <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg viewBox="0 0 14 14" width="12" height="12" fill="currentColor" style={{ opacity: 0.6, flexShrink: 0 }}><path d="M1 2.5A1 1 0 0 1 2 1.5h3.1a1 1 0 0 1 .71.3l.69.7H12a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2.5z"/></svg>
                  {f}
                </span>
                <span className="count">{folderCounts[f]}</span>
              </div>
            );
          })}
        </>
      )}

      {tagsData.customTags.length > 0 && (
        <>
          <div className="fgroup-subsect" style={{ paddingTop: folderNames.length ? 8 : 0 }}>{T('docs_tags_custom')}</div>
          {tagsData.customTags.map(tag => {
            const key = 'custom:' + tag.id;
            const on = activeTags.includes(key);
            return (
              <div key={key} className={'fitem' + (on ? ' on' : '')} onClick={() => toggleTag(key)}>
                <div className="checkbox"><Icon.check /></div>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color, flexShrink: 0, display: 'inline-block' }}></span>
                <span className="label">{tag.name}</span>
              </div>
            );
          })}
        </>
      )}

      <div className="new-tag-row">
        <input value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { createTag(); e.stopPropagation(); } e.stopPropagation(); }}
          placeholder={T('docs_new_tag')} />
        <button onClick={createTag}>{T('docs_add')}</button>
      </div>
    </div>
  );
}
