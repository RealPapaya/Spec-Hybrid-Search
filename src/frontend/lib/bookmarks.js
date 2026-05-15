// Bookmarks: { [doc_id:page]: { doc_id, filename, filepath, page, snippet,
// section, score, savedAt } } — mirrored to the backend .local settings file.
// `var` for cross-file BOOKMARKS_KEY.

var BOOKMARKS_KEY = 'docsense_bookmarks_v1';

function bookmarkKey(doc_id, page) { return doc_id + ':' + (page || 0); }

function loadBookmarks() {
  try {
    const raw = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '{}');
    // Migrate older array-of-keys format (no metadata) by discarding it — those
    // entries have no metadata to display anyway.
    if (Array.isArray(raw)) return {};
    return raw && typeof raw === 'object' ? raw : {};
  } catch(e) { return {}; }
}

function saveBookmarks(obj) {
  try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(obj)); } catch(e) {}
  saveLocalSettingsPatch({ bookmarks: obj });
}

// Build the metadata payload we want to keep when bookmarking a result.
function bookmarkPayload(r) {
  return {
    doc_id:   r.doc_id,
    filename: r.filename || r.specShort,
    filepath: r.filepath || '',
    page:     r.page || 0,
    section:  r.section || '',
    score:    r.score || 0,
    snippet:  ((r.context && r.context.match) || r.excerpt || '').slice(0, 280),
    savedAt:  Date.now(),
  };
}
