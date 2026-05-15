// ResultRow — a single result card. ResultsPanel — list with header/sort/layout.

// File type icon component with color-coded SVG
function FileTypeIcon({ type }) {
  const colors = {
    'PDF': '#E74C3C',
    'DOCX': '#3498DB',
    'DOC': '#3498DB',
    'XLSX': '#27AE60',
    'XLS': '#27AE60',
    'PPTX': '#E67E22',
    'PPT': '#E67E22',
    'TXT': '#95A5A6',
  };
  const color = colors[type] || '#7F8C8D';
  
  return (
    <svg className="file-type-icon" viewBox="0 0 16 20" aria-hidden="true">
      <path d="M2 0C0.9 0 0 0.9 0 2v16c0 1.1 0.9 2 2 2h12c1.1 0 2-0.9 2-2V6l-6-6H2z" fill={color} opacity="0.15" />
      <path d="M2 0C0.9 0 0 0.9 0 2v16c0 1.1 0.9 2 2 2h12c1.1 0 2-0.9 2-2V6l-6-6H2z" fill="none" stroke={color} strokeWidth="1.5" />
      <path d="M10 0v6h6" fill="none" stroke={color} strokeWidth="1.5" />
      <text x="8" y="15" textAnchor="middle" fontSize="5" fontWeight="600" fill={color}>{type}</text>
    </svg>
  );
}

function ResultRow({ result, index, selected, onSelect, tagsData = { customTags: [], assignments: {} } }) {
  const T = useT();
  const score = result.score || 0;
  const sc = scoreClass(score);
  const assigned = (tagsData.assignments || {})[result.doc_id] || [];
  const assignedTags = (tagsData.customTags || []).filter(tag => assigned.includes(tag.id));
  return (
    <div className={'result' + (selected ? ' selected' : '')} onClick={() => onSelect(result.id)}>
      <div className="num">#{String(index + 1).padStart(2, '0')}</div>
      <div className="body">
        <div className="result-row1">
          {result.type && <FileTypeIcon type={result.type} />}
          <span className="specname">{result.spec}</span>
          <span className="spacer"></span>
          <span className={'score-pill' + sc}>{score.toFixed(4)}</span>
        </div>
        {assignedTags.length > 0 && (
          <div className="result-row2 result-tags">
            {assignedTags.map(tag => (
              <span key={tag.id} className="tag-pill tag-pill-custom" style={{ background: tag.color }}>{tag.name}</span>
            ))}
          </div>
        )}
        <div className="result-row3">
          {result.section && <span className="section">{result.section}</span>}
        </div>
        <div className="excerpt">{highlightText(result.excerpt, result.highlight)}</div>
        <div className="result-row4">
          <span className="scoreitem" data-tip={T('score_bm25_tip')}><span className="dot bm"></span>BM25 {(result.bm25 || 0).toFixed(2)}</span>
          <span className="scoreitem" data-tip={T('score_cos_tip')}><span className="dot sem"></span>cos {(result.semantic || 0).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function ResultsPanel({ results, selectedId, onSelect, sortKey, setSortKey, cardMode, setCardMode, totalMs, tagsData = { customTags: [], assignments: {} } }) {
  const T = useT();
  return (
    <section className="results">
      <div className="results-head">
        <span className="ct"><strong>{results.length}</strong> {T('results_n')} · <strong>{totalMs}</strong> {T('results_ms')}</span>
        <span className="spacer"></span>
        <label>{T('sort')}</label>
        <select value={sortKey} onChange={e => setSortKey(e.target.value)}>
          <option value="score">{T('sort_relevance')}</option>
          <option value="name">{T('sort_name')}</option>
          <option value="date">{T('sort_date')}</option>
        </select>
        <div className="layout-toggle">
          <button className={cardMode === 'detailed' ? 'on' : ''} onClick={() => setCardMode('detailed')} data-tip={T('layout_detailed')}><Icon.rows /></button>
          <button className={cardMode === 'compact'  ? 'on' : ''} onClick={() => setCardMode('compact')}  data-tip={T('layout_compact')} ><Icon.list /></button>
        </div>
      </div>
      <div className="result-list">
        {results.map((r, i) => (
          <ResultRow key={r.id} result={r} index={i} selected={r.id === selectedId} onSelect={onSelect} tagsData={tagsData} />
        ))}
      </div>
    </section>
  );
}
