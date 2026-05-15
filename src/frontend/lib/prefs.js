// Preference persistence (theme, layout, density, etc.) via localStorage.
// `var` so PREFS_KEY is reachable from app.jsx (which writes back on every change).

var PREFS_KEY = 'specindex_v1';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch(e) { return {}; }
}
