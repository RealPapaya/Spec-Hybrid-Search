// Preference persistence (theme, layout, density, etc.) via localStorage plus
// a backend .local file. `var` so PREFS_KEY is reachable from app.jsx.

var PREFS_KEY = 'specindex_v1';
var LOCAL_SETTINGS_ENDPOINT = '/api/local-settings';
var LOCAL_SETTINGS_PENDING = {};
var LOCAL_SETTINGS_TIMER = null;

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch(e) { return {}; }
}

function savePrefs(data) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(data)); } catch(e) {}
  saveLocalSettingsPatch({ prefs: data });
}

async function loadLocalSettingsFile() {
  const res = await fetch(LOCAL_SETTINGS_ENDPOINT, { cache: 'no-store' });
  if (!res.ok) throw new Error('local settings ' + res.status);
  return res.json();
}

function saveLocalSettingsPatch(patch) {
  try {
    LOCAL_SETTINGS_PENDING = { ...LOCAL_SETTINGS_PENDING, ...patch };
    if (LOCAL_SETTINGS_TIMER) clearTimeout(LOCAL_SETTINGS_TIMER);
    LOCAL_SETTINGS_TIMER = setTimeout(() => {
      const payload = LOCAL_SETTINGS_PENDING;
      LOCAL_SETTINGS_PENDING = {};
      LOCAL_SETTINGS_TIMER = null;
      fetch(LOCAL_SETTINGS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 120);
  } catch(e) {}
}
