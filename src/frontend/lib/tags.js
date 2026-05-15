// Tags storage: custom user tags + per-document assignments, in localStorage.
// `var` for cross-file globals; `getFolderName` derives a folder label from
// a filepath (used for the "Folders" pseudo-tag group).

var TAGS_KEY = 'docsense_tags_v1';
var TAG_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'];

function loadTagsData() {
  try {
    const raw = JSON.parse(localStorage.getItem(TAGS_KEY) || 'null');
    if (raw && typeof raw === 'object' && Array.isArray(raw.customTags)) return raw;
  } catch(e) {}
  return { customTags: [], assignments: {} };
}
function saveTagsData(data) {
  try { localStorage.setItem(TAGS_KEY, JSON.stringify(data)); } catch(e) {}
}
function getFolderName(filepath) {
  if (!filepath) return '';
  const parts = filepath.replace(/\\/g, '/').split('/');
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}
