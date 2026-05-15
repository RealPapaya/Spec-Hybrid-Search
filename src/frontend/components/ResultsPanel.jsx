// ResultRow — a single result card. ResultsPanel — list with header/sort/layout.

function ResultRow({ result, index, selected, onSelect }) {
  const T = useT();
  const score = result.score || 0;
  const sc = scoreClass(score);
  return (
    <div className={'result' + (selected ? ' selected' : '')} onClick={() => onSelect(result.id)}>
      <div className="num">#{String(index + 1).padStart(2, '0')}</div>
      <div className="body">
        <div className="result-row1">
          {result.type && <span className="tag">{result.type}</span>}
          <span className="specname">{result.spec}</span>
          <span className="spacer"></span>
          <span className={'score-pill' + sc}>{score.toFixed(4)}</span>
        </div>
        <div className="result-row2">
          {result.section && <><span className="section">{result.section}</span><span className="sep">·</span></>}
          <span className="pg">{result.page ? 'p. ' + result.page : ''}</span>
        </div>
        <div className="excerpt">{highlightText(result.excerpt, result.highlight)}</div>
        <div className="result-row3">
          <span className="scoreitem" data-tip={T('score_bm25_tip')}><span className="dot bm"></span>BM25 {(result.bm25 || 0).toFixed(2)}</span>
          <span className="scoreitem" data-tip={T('score_cos_tip')}><span className="dot sem"></span>cos {(result.semantic || 0).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function ResultsPanel({ results, selectedId, onSelect, sortKey, setSortKey, cardMode, setCardMode, totalMs }) {
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
          <ResultRow key={r.id} result={r} index={i} selected={r.id === selectedId} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
