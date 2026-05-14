/**
 * DocSense frontend — vanilla JS, no framework, no build step.
 * Connects to the FastAPI backend at the same origin (/api/*).
 */

const API = "";   // same origin — empty string = relative URLs

// ── DOM refs ──────────────────────────────────────────────────────────────────
const searchInput  = document.getElementById("search-input");
const spinner      = document.getElementById("search-spinner");
const resultsList  = document.getElementById("results-list");
const resultsMeta  = document.getElementById("results-meta");
const emptyState   = document.getElementById("empty-state");
const statusBadge  = document.getElementById("status-badge");
const statusText   = document.getElementById("status-text");
const reindexBtn   = document.getElementById("reindex-btn");
const limitSelect  = document.getElementById("limit-select");
const watchedPath  = document.getElementById("watched-path");
const toast        = document.getElementById("toast");
const modeTabs     = document.querySelectorAll(".mode-tab");

// ── State ─────────────────────────────────────────────────────────────────────
let currentMode    = "hybrid";
let debounceTimer  = null;
let lastQuery      = "";

// ── Utility ───────────────────────────────────────────────────────────────────
function debounce(fn, delay = 320) {
  return (...args) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wrap every occurrence of queryWords in the snippet with <mark>.
 * Simple token highlight — good enough without a full parser.
 */
function highlight(snippet, query) {
  if (!query) return escapeHtml(snippet);
  const words = query
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return escapeHtml(snippet);
  const re  = new RegExp(`(${words.join("|")})`, "gi");
  return escapeHtml(snippet).replace(re, "<mark>$1</mark>");
}

function fileExt(filename) {
  const m = filename.match(/\.(\w+)$/);
  return m ? m[1].toLowerCase() : "";
}

function fileIconClass(filename) {
  const ext = fileExt(filename);
  return ["pdf", "docx", "xlsx", "pptx"].includes(ext) ? ext : "other";
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = "ok", duration = 3500) {
  toast.textContent = msg;
  toast.className   = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = "toast"; }, duration);
}

// ── Status polling ────────────────────────────────────────────────────────────
async function fetchStatus() {
  try {
    const res  = await fetch(`${API}/api/status`);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();

    const { total_documents, total_chunks, collection_points, watched_docs_dir } = data;

    watchedPath.textContent = watched_docs_dir || "watched_docs/";

    statusBadge.className = "status-badge ok";
    statusText.textContent =
      `${total_documents} doc${total_documents !== 1 ? "s" : ""} · ${total_chunks} chunks`;
    statusBadge.title = `Qdrant: ${collection_points} vectors | SQLite: ${total_chunks} chunks`;
  } catch {
    statusBadge.className = "status-badge err";
    statusText.textContent = "Offline";
  }
}

// Poll every 10 s so the badge stays fresh during indexing
fetchStatus();
setInterval(fetchStatus, 10_000);

// ── Mode tabs ─────────────────────────────────────────────────────────────────
modeTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    modeTabs.forEach(t => { t.classList.remove("active"); t.setAttribute("aria-checked", "false"); });
    tab.classList.add("active");
    tab.setAttribute("aria-checked", "true");
    currentMode = tab.dataset.mode;
    if (lastQuery) doSearch(lastQuery);
  });
});

// ── Render results ────────────────────────────────────────────────────────────
function renderResults(data, query) {
  resultsList.innerHTML = "";

  if (!data.results || data.results.length === 0) {
    resultsMeta.hidden = true;
    emptyState.hidden  = false;
    return;
  }

  emptyState.hidden  = false;   // keep it in DOM but hide
  emptyState.hidden  = true;
  resultsMeta.hidden = false;

  const modeLabel = { hybrid: "Hybrid", vector: "Semantic", keyword: "Keyword" };
  resultsMeta.innerHTML = `
    <span>${data.total} result${data.total !== 1 ? "s" : ""} for <strong>"${escapeHtml(query)}"</strong></span>
    <span class="mode-chip">${modeLabel[data.mode] || data.mode}</span>
  `;

  data.results.forEach((r, idx) => {
    const li   = document.createElement("li");
    li.className = "result-card";
    li.style.animationDelay = `${idx * 35}ms`;
    li.setAttribute("role", "listitem");

    const ext      = fileExt(r.filename);
    const iconCls  = fileIconClass(r.filename);
    const pageInfo = r.page ? `<span class="chip">p. ${r.page}</span>` : "";
    const score    = typeof r.score === "number"
      ? `<span class="chip score">${(r.score * 100).toFixed(1)}%</span>`
      : "";
    const snippet  = highlight(r.chunk_text || "", query);

    li.innerHTML = `
      <div class="result-header">
        <div class="file-icon ${iconCls}" aria-hidden="true">${ext.toUpperCase()}</div>
        <span class="result-filename" title="${escapeHtml(r.filepath)}">${escapeHtml(r.filename)}</span>
        <div class="result-meta-chips">
          ${pageInfo}
          ${score}
        </div>
      </div>
      <p class="result-snippet">${snippet}</p>
    `;

    resultsList.appendChild(li);
  });
}

// ── Search ────────────────────────────────────────────────────────────────────
async function doSearch(query) {
  query = query.trim();
  if (!query) {
    resultsList.innerHTML = "";
    resultsMeta.hidden    = true;
    emptyState.hidden     = true;
    return;
  }

  lastQuery = query;
  spinner.classList.add("active");

  try {
    const limit = limitSelect.value;
    const url   = `${API}/api/search?q=${encodeURIComponent(query)}&mode=${currentMode}&limit=${limit}`;
    const res   = await fetch(url);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      showToast(`Search error: ${err.detail || res.statusText}`, "err");
      return;
    }

    const data = await res.json();
    renderResults(data, query);

  } catch (err) {
    showToast("Could not reach the API — is DocSense running?", "err");
    statusBadge.className = "status-badge err";
    statusText.textContent = "Offline";
  } finally {
    spinner.classList.remove("active");
  }
}

const debouncedSearch = debounce(q => doSearch(q), 350);

searchInput.addEventListener("input", e => {
  const q = e.target.value;
  if (!q.trim()) {
    resultsList.innerHTML = "";
    resultsMeta.hidden    = true;
    emptyState.hidden     = true;
    return;
  }
  spinner.classList.add("active");
  debouncedSearch(q);
});

searchInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    clearTimeout(debounceTimer);
    doSearch(e.target.value);
  }
});

// ── Re-index button ───────────────────────────────────────────────────────────
reindexBtn.addEventListener("click", async () => {
  if (reindexBtn.classList.contains("loading")) return;

  reindexBtn.classList.add("loading");
  reindexBtn.disabled = true;

  try {
    const res  = await fetch(`${API}/api/index`, { method: "POST" });
    const data = await res.json();
    showToast(data.message || "Indexing started…", "ok");
    // Refresh status after a short delay
    setTimeout(fetchStatus, 3000);
  } catch {
    showToast("Failed to trigger re-index.", "err");
  } finally {
    setTimeout(() => {
      reindexBtn.classList.remove("loading");
      reindexBtn.disabled = false;
    }, 2000);
  }
});

// ── Keyboard shortcut: "/" focuses search ─────────────────────────────────────
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === "Escape") {
    searchInput.blur();
  }
});
