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

function FiltersRail({ filters, setFilters, allResults, tagsData }) {
  const T = useT();
  const { vendors, types, counts } = React.useMemo(() => {
    const c = { vendor: {}, type: {} };
    allResults.forEach(r => {
      if (r.vendor) c.vendor[r.vendor] = (c.vendor[r.vendor] || 0) + 1;
      if (r.type)   c.type[r.type]     = (c.type[r.type]     || 0) + 1;
    });
    return {
      vendors: Object.keys(c.vendor).sort(),
      types:   Object.keys(c.type).sort(),
      counts:  c,
    };
  }, [allResults]);

  const toggle = (key, id) => {
    const cur = filters[key];
    setFilters({ ...filters, [key]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
  };
  const clear = (key) => setFilters({ ...filters, [key]: [] });

  return (
    <aside className="filters-rail">
      <FilterGroup title={T('f_vendor')}    items={vendors.map(v => ({ id: v, label: v, count: counts.vendor[v] || 0 }))} selected={filters.vendor} onToggle={id => toggle('vendor', id)} onClear={() => clear('vendor')} clearLabel={T('f_clear')} />
      <FilterGroup title={T('f_spec_type')} items={types.map(t   => ({ id: t, label: t, count: counts.type[t]   || 0 }))} selected={filters.type}   onToggle={id => toggle('type',   id)} onClear={() => clear('type')}   clearLabel={T('f_clear')} />
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
