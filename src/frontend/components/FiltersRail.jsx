// Filter widgets: shared FilterGroup, sidebar FiltersRail, top-bar TopFilters.

function FilterGroup({ title, items, selected, onToggle, onClear, clearLabel }) {
  return (
    <div className="fgroup">
      <div className="fgroup-title">
        <span>{title}</span>
        {selected.length > 0 && <span className="clear" onClick={onClear}>{clearLabel}</span>}
      </div>
      {items.map(it => {
        const on = selected.includes(it.id);
        return (
          <div key={it.id} className={'fitem' + (on ? ' on' : '')} onClick={() => onToggle(it.id)}>
            <div className="checkbox"><Icon.check /></div>
            <span className="label">{it.label}</span>
            <span className="count">{it.count}</span>
          </div>
        );
      })}
    </div>
  );
}

// Dimmable (lit/dark) filter group: no checkbox; each item is colored when on,
// grayscale when off. Items may provide a custom `icon` node.
function DimmableFilterGroup({ title, items, selected, onToggle, onClear, clearLabel }) {
  return (
    <div className="fgroup">
      <div className="fgroup-title">
        <span>{title}</span>
        {selected.length > 0 && <span className="clear" onClick={onClear}>{clearLabel}</span>}
      </div>
      {items.map(it => {
        const on = selected.includes(it.id);
        return (
          <div key={it.id} className={'fitem fitem-dim' + (on ? ' on' : '')} onClick={() => onToggle(it.id)}>
            {it.icon && <span className="fitem-ico">{it.icon}</span>}
            <span className="label">{it.label}</span>
            <span className="count">{it.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function ExplorerFileNode({ name, relPath, depth, selected, onToggle }) {
  const on = selected.includes(relPath);
  const ext = (name.match(/\.([^.]+)$/) || ['',''])[1].toUpperCase();
  return (
    <div className="exf-node" style={{ paddingLeft: depth * 10 }}>
      <div className={'exf-row exf-row-file' + (on ? ' on' : '')} onClick={() => onToggle(relPath)}>
        <span className="exf-caret exf-caret-empty"></span>
        <span className="exf-label">
          <DocumentIcon ext={ext} className="exf-file-ico" />
          <span className="label" title={relPath}>{name}</span>
        </span>
      </div>
    </div>
  );
}

function ExplorerFolderNode({ name, relPath, node, depth, selected, onToggle }) {
  const [open, setOpen] = React.useState(true);
  const childEntries = Object.entries(node.children).sort(([a],[b]) => a.localeCompare(b));
  const files = (node.files || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const on = selected.includes(relPath);
  const count = node.count;
  const hasChildren = childEntries.length > 0 || files.length > 0;
  return (
    <div className="exf-node" style={{ paddingLeft: depth * 10 }}>
      <div className={'exf-row' + (on ? ' on' : '')}>
        {hasChildren ? (
          <span className="exf-caret" onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}>
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>
              <polyline points="3,1.5 7,5 3,8.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        ) : (
          <span className="exf-caret exf-caret-empty"></span>
        )}
        <span className="exf-label" onClick={() => onToggle(relPath)}>
          <DocumentIcon name="folder" className="exf-folder-ico" />
          <span className="label">{name}</span>
          <span className="count">{count}</span>
        </span>
      </div>
      {open && hasChildren && (
        <div className="exf-children">
          {childEntries.map(([n, child]) => (
            <ExplorerFolderNode
              key={'d:' + n}
              name={n}
              relPath={relPath ? (relPath + '/' + n) : n}
              node={child}
              depth={depth + 1}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
          {files.map(f => (
            <ExplorerFileNode
              key={'f:' + f.name}
              name={f.name}
              relPath={relPath ? (relPath + '/' + f.name) : f.name}
              depth={depth + 1}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExplorerFilterGroup({ title, allResults, watchedDir, selected, onToggle, onClear, clearLabel }) {
  const tree = React.useMemo(() => {
    const base = watchedDir ? watchedDir.replace(/\\/g, '/').replace(/\/$/, '') + '/' : '';
    const root = { children: {}, files: [], count: 0 };
    const seenPaths = new Set();
    allResults.forEach(r => {
      const fp = (r.filepath || '').replace(/\\/g, '/');
      if (!fp || seenPaths.has(fp)) return;
      seenPaths.add(fp);
      const rel = (base && fp.startsWith(base)) ? fp.slice(base.length) : fp;
      const parts = rel.split('/');
      const fileName = parts.pop();
      let node = root;
      node.count += 1;
      parts.forEach(part => {
        if (!part) return;
        if (!node.children[part]) node.children[part] = { children: {}, files: [], count: 0 };
        node = node.children[part];
        node.count += 1;
      });
      if (fileName) node.files.push({ name: fileName });
    });
    return root;
  }, [allResults, watchedDir]);

  const childEntries = Object.entries(tree.children).sort(([a],[b]) => a.localeCompare(b));
  const rootFiles = tree.files.slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="fgroup">
      <div className="fgroup-title">
        <span>{title}</span>
        {selected.length > 0 && <span className="clear" onClick={onClear}>{clearLabel}</span>}
      </div>
      {tree.count === 0 ? (
        <div className="exf-empty">—</div>
      ) : (
        <>
          {childEntries.map(([n, child]) => (
            <ExplorerFolderNode
              key={'d:' + n}
              name={n}
              relPath={n}
              node={child}
              depth={0}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
          {rootFiles.map(f => (
            <ExplorerFileNode
              key={'f:' + f.name}
              name={f.name}
              relPath={f.name}
              depth={0}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
        </>
      )}
    </div>
  );
}

function FiltersRail({ filters, setFilters, allResults, tagsData, watchedDir }) {
  const T = useT();
  const { types, counts } = React.useMemo(() => {
    const c = { type: {} };
    allResults.forEach(r => {
      if (r.type) c.type[r.type] = (c.type[r.type] || 0) + 1;
    });
    return {
      types:  Object.keys(c.type).sort(),
      counts: c,
    };
  }, [allResults]);

  const toggle = (key, id) => {
    const cur = filters[key] || [];
    setFilters({ ...filters, [key]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
  };
  const clear = (key) => setFilters({ ...filters, [key]: [] });

  const typeItems = types.map(t => ({
    id: t,
    label: t,
    count: counts.type[t] || 0,
    icon: <DocumentIcon ext={t} fallbackText={t} className="fitem-doc-ico" />,
  }));

  return (
    <aside className="filters-rail">
      <ExplorerFilterGroup
        title={T('f_explorer')}
        allResults={allResults}
        watchedDir={watchedDir}
        selected={filters.folder || []}
        onToggle={id => toggle('folder', id)}
        onClear={() => clear('folder')}
        clearLabel={T('f_clear')}
      />
      <DimmableFilterGroup
        title={T('f_spec_type')}
        items={typeItems}
        selected={filters.type}
        onToggle={id => toggle('type', id)}
        onClear={() => clear('type')}
        clearLabel={T('f_clear')}
      />
      <TagsFilterGroup filters={filters} setFilters={setFilters} allResults={allResults} tagsData={tagsData} />
    </aside>
  );
}

function TopFilters({ filters, setFilters, allResults }) {
  const T = useT();
  const { vendors, types, counts } = React.useMemo(() => {
    const c = { vendor: {}, type: {} };
    allResults.forEach(r => {
      if (r.vendor) c.vendor[r.vendor] = (c.vendor[r.vendor] || 0) + 1;
      if (r.type)   c.type[r.type]     = (c.type[r.type]     || 0) + 1;
    });
    return { vendors: Object.keys(c.vendor).sort(), types: Object.keys(c.type).sort(), counts: c };
  }, [allResults]);
  const toggle = (key, id) => {
    const cur = filters[key];
    setFilters({ ...filters, [key]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
  };
  return (
    <div className="topfilters">
      <div className="grp"><span className="grp-label">{T('f_vendor')}</span>
        {vendors.map(v => <button key={v} className={'chip' + (filters.vendor.includes(v) ? ' on' : '')} onClick={() => toggle('vendor', v)}>{v}<span className="ct">{counts.vendor[v] || 0}</span></button>)}
      </div>
      <div className="grp"><span className="grp-label">{T('f_spec_type')}</span>
        {types.map(v => <button key={v} className={'chip' + (filters.type.includes(v) ? ' on' : '')} onClick={() => toggle('type', v)}>{v}<span className="ct">{counts.type[v] || 0}</span></button>)}
      </div>
    </div>
  );
}
