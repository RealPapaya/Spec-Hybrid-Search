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

function TagsFilterGroup({ filters, setFilters, allResults, tagsData }) {
  const T = useT();
  const activeTags = filters.tags || [];

  const toggleTag = (key) => {
    const next = activeTags.includes(key) ? activeTags.filter(x => x !== key) : [...activeTags, key];
    setFilters({ ...filters, tags: next });
  };

  return (
    <div className="fgroup">
      <div className="fgroup-title">
        <span>{T('docs_tags')}</span>
        {activeTags.length > 0 && <span className="clear" onClick={() => setFilters({ ...filters, tags: [] })}>{T('f_clear')}</span>}
      </div>

      {tagsData.customTags.length > 0 && (
        <>
          {tagsData.customTags.map(tag => {
            const key = 'custom:' + tag.id;
            const on = activeTags.includes(key);
            return (
              <div key={key} className={'fitem fitem-dim' + (on ? ' on' : '')} onClick={() => toggleTag(key)}>
                <span className="fitem-ico">
                  <span className="fitem-dot" style={{ background: tag.color }}></span>
                </span>
                <span className="label">{tag.name}</span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
