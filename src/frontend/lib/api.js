// API result mapper — adapts /api/search response rows into the result shape
// the UI components expect (spec/specShort/vendor/type/section/excerpt/etc.).

function mapResult(r, query, index) {
  const nameNoExt = r.filename.replace(/\.[^.]+$/, '');
  const ext = (r.filename.match(/\.([^.]+)$/) || ['', ''])[1].toUpperCase();
  const highlights = query.trim().split(/\s+/).filter(w => w.length > 2);
  return {
    id:            [r.doc_id, r.page || 0, index].join(':'),
    doc_id:        r.doc_id,
    filepath:      r.filepath || '',
    filename:      r.filename,
    score:         r.score         || 0,
    bm25:          r.bm25_score    || 0,
    semantic:      r.semantic_score || 0,
    spec:          nameNoExt,
    specShort:     r.filename,
    vendor:        nameNoExt,
    type:          ext,
    category:      '',
    version:       '',
    date:          '',
    page:          r.page || 0,
    section:       r.page ? 'Page ' + r.page : '',
    excerpt:       (r.chunk_text || '').slice(0, 320),
    highlight:     highlights,
    context:       { before: '', match: r.chunk_text || '', after: '' },
  };
}
