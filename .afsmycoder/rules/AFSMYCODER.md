# AFSMYCODER.md — Project Guide: SpecIndex Hybrid Search UI

> This file is auto-loaded by AFS MyCoder to provide codebase context.
> Review, update, and commit it so your whole team benefits from the same context.

---

## 1. Project Overview

### Purpose
**SpecIndex** is a front-end prototype/demo for a **BIOS Specification Hybrid Search** tool. It provides a polished browser-based UI that simulates searching through a corpus of hardware/firmware specifications (Intel ME, AMD PSP, TCG/TPM, ACPI, PCI-SIG) using three retrieval modes:

| Mode      | Algorithm         | Description                                   |
|-----------|-------------------|-----------------------------------------------|
| Keyword   | BM25              | Traditional full-text keyword matching        |
| Hybrid    | BM25 ⊕ vector     | Fused sparse + dense retrieval (default)      |
| Semantic  | Cosine similarity | Dense embedding-only vector search            |

The UI shows per-result scoring breakdowns (fused score, BM25 component, cosine similarity), highlighted excerpts, section-level metadata, and a full preview panel with surrounding context.

### Key Technologies
- **React 18** (loaded via CDN, no build step)
- **Babel Standalone** (JSX transpiled in-browser)
- **Vanilla CSS** with CSS custom properties (design tokens)
- **Google Fonts** — Inter, JetBrains Mono, IBM Plex Sans/Mono, Source Serif 4
- No backend, no bundler, no Node.js required — purely static HTML + JSX files

### High-Level Architecture
```
SpecIndex.html  ─── loads ──►  styles.css       (design system / tokens)
                │
                ├── loads ──►  data.js          (mock spec corpus & WINDOW.SPEC_DATA)
                ├── loads ──►  tweaks-panel.jsx  (reusable devtools / live-tweak panel)
                └── loads ──►  app.jsx           (main application logic & components)

SpecIndex-standalone.html   (all of the above inlined into a single file — shareable)
app-i18n.jsx                (internationalized variant of app.jsx — EN / 繁中)
i18n.js                     (WINDOW.I18N_DICT — translation strings EN + Traditional Chinese)
```

---

## 2. Getting Started

### Prerequisites
- Any modern browser (Chrome, Edge, Firefox, Safari)
- A local static file server **or** simply open the HTML files directly (some browsers restrict `file://` CORS)

### Quickest Start (no server needed)
```
1. Clone / download the repo
2. Open SpecIndex-standalone.html directly in your browser
   — everything is inlined, no network requests needed except Google Fonts
```

### Development Start (multi-file version)
```bash
# Option A – Python (built-in)
python -m http.server 8080

# Option B – Node.js
npx serve .

# Option C – VS Code Live Server extension
# Right-click SpecIndex.html → "Open with Live Server"
```
Then navigate to `http://localhost:8080/SpecIndex.html`.

### i18n Variant
Open `SpecIndex.html` after replacing `app.jsx` with `app-i18n.jsx` in the script tag, or open the standalone equivalent. Toggle **EN ↔ 繁中** via the language button in the top-right corner.

### Running Tests
> ⚠️ *No automated test suite exists yet.* Manual testing checklist:
> - Change search mode (Keyword / Hybrid / Semantic) and verify the mode dot changes
> - Toggle dark/light theme and verify all tokens update
> - Click filter chips/checkboxes and confirm result counts update
> - Select a result row and verify the preview panel populates
> - Open the Tweaks panel (Prefs button) and cycle through accent colors, density, and layout options

---

## 3. Project Structure

```
Spec Hybrid Search/
├── SpecIndex.html            # Main entry point (multi-file version)
├── SpecIndex-standalone.html # Self-contained single-file version (shareable)
├── app.jsx                   # Core React app (English-only)
├── app-i18n.jsx              # React app with full EN/繁中 i18n support
├── styles.css                # All CSS — design tokens, layout, components
├── data.js                   # Mock data — window.SPEC_DATA (10 sample results)
├── i18n.js                   # Translation dictionary — window.I18N_DICT
├── tweaks-panel.jsx          # Reusable floating devtools / live-tweak shell
├── deep-research-report.md   # Product specification & architecture reference
└── .afsmycoder/
    └── rules/
        └── AFSMYCODER.md     # This file
```

### Key Files & Roles

| File | Role |
|------|------|
| `SpecIndex.html` | HTML shell; sets `data-*` attributes that drive CSS variants; loads React + Babel + all scripts |
| `app.jsx` | All UI components: `Topbar`, `SearchRow`, `FiltersRail`, `TopFilters`, `ResultRow`, `ResultsPanel`, `PreviewPanel`, `StatusBar`, `PrefsModal` and the root `App` component |
| `app-i18n.jsx` | Drop-in replacement for `app.jsx` adding `LangCtx`, `useT()` hook, and a `PrefsModal` with full settings |
| `styles.css` | Single stylesheet; CSS custom-property design tokens; supports dark/light, 3 density levels, 4 accent colors, 3 typesets, 2 highlight modes, 2 layout modes |
| `data.js` | Exposes `window.SPEC_DATA.results` — 10 mock spec entries representing real firmware docs (Intel ME, TCG, AMD PSP, ACPI, PCIe, UEFI, etc.) |
| `i18n.js` | Exposes `window.I18N_DICT` — flat key→string dictionaries for `en` and `zh` (Traditional Chinese) |
| `tweaks-panel.jsx` | Self-contained devtools panel; exposes `useTweaks()`, `TweaksPanel`, and a full set of `Tweak*` form controls (Slider, Radio, Color, Toggle, etc.) |
| `deep-research-report.md` | Detailed product spec / architecture document covering backend design, tech-stack rationale, phased roadmap (not UI code) |

### Important Configuration
HTML `data-*` attributes on `<html>` control the visual configuration at load time:

| Attribute | Values | Effect |
|-----------|--------|--------|
| `data-theme` | `light` \| `dark` | Color scheme |
| `data-layout` | `sidebar` \| `topfilters` | Filters position (left rail vs. top bar) |
| `data-density` | `compact` \| `balanced` \| `spacious` | Spacing scale |
| `data-accent` | `indigo` \| `emerald` \| `amber` \| `slate` | Brand accent color |
| `data-typeset` | `inter-mono` \| `ibm-plex` \| `serif-mono` | Font pairing |
| `data-card` | `detailed` \| `compact` | Default result card mode |
| `data-highlight` | `yellow` \| `underline` \| `bold` | Search term highlight style |

---

## 4. Development Workflow

### Coding Standards & Conventions
- **No build step** — keep it that way. All JSX must be valid Babel-standalone-compatible (React 18 JSX transform is NOT used; `/* global React, ReactDOM */` comment at top is required for linters).
- **Component naming**: PascalCase React function components.
- **CSS**: All new variables go into `:root {}` (light mode) and `[data-theme="dark"] {}`. Follow the existing `--bg`, `--fg`, `--border`, `--accent` token naming.
- **No external packages** without explicit consideration — the whole point is zero-dependency static serving.
- **English in code and comments** — `app-i18n.jsx` uses a lookup function (`useT(key)`) for all user-visible strings; never hard-code display text in the i18n variant.
- Use `const { useState, useMemo, useEffect, useRef } = React;` at the top of JSX files (not ES module imports).

### Adding a New Component
1. Write the component function in `app.jsx` (or `app-i18n.jsx` for i18n variant).
2. If it needs translated strings, add keys to **both** `en` and `zh` objects in `i18n.js`.
3. Add styles to `styles.css` using existing token variables — never hardcode colors.
4. Test in both light and dark themes, and in all three density modes.

### Modifying the Mock Data
Edit `data.js` — `window.SPEC_DATA.results` is an array of result objects. Each object shape:

```js
{
  id: "r1",               // Unique string ID
  score: 0.9847,          // Fused hybrid score (0–1)
  bm25: 0.91,             // BM25 component score
  semantic: 0.96,         // Cosine similarity component
  spec: "Full spec name", // Display name
  specShort: "DOC-ID",    // Short identifier / code
  vendor: "Intel",        // One of: Intel, AMD, TCG, UEFI Forum, PCI-SIG
  type: "ME",             // One of: ME, TPM, ACPI, PCI
  category: "BIOS",       // One of: BIOS, EC, EE
  version: "Rev 2.4",
  date: "2025-08-12",
  page: 142,
  section: "4.3.7 — Section Title",
  excerpt: "Short text snippet shown in result list...",
  highlight: ["term1", "term2"],  // Terms to highlight in excerpt
  context: {
    before: "Preceding paragraph text...",
    match: "The matched section text...",
    after: "Following paragraph text..."
  }
}
```

### Updating the Standalone File
After making changes to the multi-file version, manually inline the updated content of `styles.css`, `data.js`, `tweaks-panel.jsx`, and `app.jsx` into `SpecIndex-standalone.html` (each in their respective `<style>` or `<script>` blocks).

### Build & Deployment
- **No build required.** Deploy by copying all files to any static host (GitHub Pages, Netlify, S3, etc.).
- For a fully offline/shareable demo, use `SpecIndex-standalone.html` only.

---

## 5. Key Concepts

### Domain Terminology

| Term | Meaning |
|------|---------|
| **BM25** | Okapi BM25 — classic probabilistic keyword relevance ranking |
| **Hybrid Search** | Combination of BM25 (sparse) + cosine similarity (dense) scores |
| **Fused Score** | Weighted combination: `α × BM25 + β × cosine` (default α=0.4, β=0.6) |
| **Cosine similarity** | Vector-space similarity between query embedding and chunk embedding |
| **Chunk** | A sub-document text segment (typically ~500 tokens) stored as one search unit |
| **Spec** | A hardware/firmware specification document (e.g. Intel ME FW Guide, ACPI 6.5) |
| **PCR** | Platform Configuration Register — a TPM concept (e.g. PCR[0] for firmware) |
| **HECI** | Host Embedded Controller Interface — Intel ME communication bus |
| **PSP** | AMD Platform Security Processor |
| **CRTM** | Core Root of Trust for Measurement (TPM boot chain) |
| **AGESA** | AMD Generic Encapsulated Software Architecture (BIOS init firmware) |
| **MKHI** | Management Engine Kernel Host Interface — Intel ME command protocol |

### Core React Abstractions

| Component | Responsibility |
|-----------|----------------|
| `App` | Root state manager — owns `query`, `mode`, `filters`, `results`, `selectedId`, `sortKey`, `cardMode`, `theme`, `layout` |
| `SearchRow` | Query input, mode selector (Keyword/Hybrid/Semantic), Search button |
| `FiltersRail` | Sidebar filter checkboxes (Vendor, Type, Category, Score, Date) |
| `TopFilters` | Alternative chip-style filter bar shown when `data-layout="topfilters"` |
| `ResultsPanel` | Sorted/filtered result list with header controls |
| `ResultRow` | Single result card — score pills, tags, excerpt with highlights |
| `PreviewPanel` | Right-side detail view — score bars, context tabs, metadata JSON, related chunks |
| `PrefsModal` | (i18n variant) Settings modal — layout, accent, typography, highlight options |
| `TweaksPanel` | Floating dev panel for rapid visual iteration (ships in `tweaks-panel.jsx`) |

### Design Patterns
- **CSS Custom Properties (tokens)**: All colors, spacing, and fonts are referenced via `var(--token-name)`. Data attributes on `<html>` swap out tokens at the root level.
- **Controlled components**: All filter/search state lives in `App` and is passed down as props — no local state in filter/search sub-components.
- **Computed filtering with `useMemo`**: `filteredResults` is memoized over `results`, `filters`, and `sortKey`.
- **Highlight injection**: `highlightText(text, terms)` splits text on matched terms and wraps them in `<mark>` elements.

---

## 6. Common Tasks

### Task: Add a New Filter Dimension (e.g., "Language")
1. Add the new dimension to the `LANGUAGES` constant array in `app.jsx`.
2. Add a corresponding `FilterGroup` in `FiltersRail` and chips in `TopFilters`.
3. Update the `filters` initial state in `App`: `{ vendor: [], type: [], category: [], language: [] }`.
4. Update the `filteredResults` `useMemo` to filter on the new dimension.
5. Add sample values to each object in `data.js`.

### Task: Add a New Accent Color Variant
1. In `styles.css`, add a new `[data-accent="yourcolor"]` and `[data-accent="yourcolor"][data-theme="dark"]` block (copy an existing one and change the color values).
2. In the `PrefsModal` / Tweaks panel, add a new option to the accent color selector.
3. Update the `data-accent` attribute default in `SpecIndex.html` if desired.

### Task: Add a New Search Mode
1. Add an entry to the `mode` button list in `SearchRow`:
   ```jsx
   { id: 'rerank', label: 'Reranked', sub: 'cross-encoder' }
   ```
2. In `App`, handle the new mode value in `handleSearch` — adjust score computation logic in mock data or wire up a real API call.

### Task: Connect to a Real Backend API
The `handleSearch` function in `App` currently uses `window.SPEC_DATA`. To connect a real API:
```js
async function handleSearch() {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&mode=${mode}`);
  const data = await res.json();
  setResults(data.results);
  setTotalMs(data.took_ms);
}
```
See `deep-research-report.md` for full backend architecture using FastAPI + Qdrant.

### Task: Export Results as CSV / Citation
The `PreviewPanel` already has a "copy citation" button wired to `navigator.clipboard.writeText()`. Extend it to format a CSV row using the result metadata fields.

---

## 7. Troubleshooting

### Blank page / nothing renders
- **Cause**: Browser blocking `file://` cross-origin script loads.
- **Fix**: Serve via a local HTTP server (`python -m http.server 8080`), or use `SpecIndex-standalone.html` instead.

### JSX errors in console (`Unexpected token`)
- **Cause**: A script tag is missing `type="text/babel"`, or Babel standalone failed to load from CDN.
- **Fix**: Check network tab — ensure `babel.min.js` loaded (requires internet). Add `type="text/babel"` to all `.jsx` script tags.

### Styles not applying / tokens broken
- **Cause**: The `data-*` attribute on `<html>` may have been removed or misspelled.
- **Fix**: Ensure `<html data-theme="light" data-layout="sidebar" ...>` attributes are present.

### Dark mode not persisting across refresh
- **Cause**: Theme state is in-memory only (React `useState`). No `localStorage` persistence in `app.jsx`.
- **Fix** (i18n variant): `app-i18n.jsx` includes `loadPrefs()` / `savePrefs()` backed by `localStorage` under the key `specindex_v1`.

### Filter counts show 0 after search
- **Cause**: `allResults` (the unfiltered set) must be passed to `FiltersRail`, not `results` (the filtered set).
- **Fix**: Confirm the `allResults` prop is wired to the pre-filter results array in `App`.

### Tweaks panel not appearing
- **Cause**: `TweaksPanel` listens for a `__activate_edit_mode` `postMessage` from a parent frame (AFS MyCoder / Omelette host).
- **Fix**: In a standalone browser context, trigger it manually: `window.postMessage({ type: '__activate_edit_mode' }, '*')` from the browser console, or click the **Prefs** button in the topbar (i18n variant).

### Google Fonts not loading (offline environment)
- **Cause**: Font `<link>` tags in `<head>` require internet access.
- **Fix**: Download the fonts and self-host them, or remove the `<link>` tags and rely on system font fallbacks (`system-ui, sans-serif`).

---

## 8. Backend Architecture Reference

> The `deep-research-report.md` file in this repo contains a full product specification for the **planned production backend**. Key highlights:

- **Backend**: Python + FastAPI
- **Vector DB**: Qdrant (open-source, highest RPS/lowest latency per benchmarks)
- **Keyword Index**: BM25 via Whoosh or Qdrant full-text payload filtering
- **Embeddings**: `bge-large-en-v1.5` (1024-dim) shown in UI status bar; alternatives include `all-mpnet-base-v2`, OpenAI `text-embedding-3-small`
- **Parsers**: PyMuPDF (PDF), python-docx (DOCX), openpyxl (XLSX), python-pptx (PPTX), OCRmyPDF + Tesseract (scanned PDFs)
- **Metadata Store**: SQLite
- **Hybrid scoring**: `score = α × BM25_norm + β × cosine` with α=0.4, β=0.6 (configurable)
- **Phased delivery**: 6 phases from core ingestion → full enterprise features

---

## 9. References

| Resource | Description |
|----------|-------------|
| `deep-research-report.md` | Full product spec, backend architecture, tech-stack comparison |
| [React 18 Docs](https://react.dev) | React framework reference |
| [Babel Standalone](https://babeljs.io/docs/babel-standalone) | In-browser JSX transpilation |
| [Qdrant Docs](https://qdrant.tech/documentation/) | Vector database used in planned backend |
| [TCG PC Client Platform Spec](https://trustedcomputinggroup.org/) | TPM measurement specification referenced in mock data |
| [ACPI Specification 6.5](https://uefi.org/specifications) | ACPI power management spec referenced in mock data |
| [PCI Express Base Spec 6.1](https://pcisig.com/) | PCIe spec referenced in mock data |
| [Intel ME/CSME Documentation](https://www.intel.com/content/www/us/en/design/products/platforms/details/management-engine.html) | ME firmware documentation (requires NDA access) |
| [AMD PSP/AGESA Documentation](https://www.amd.com/en/developer/amd-software-eula-overview.html) | AMD platform security processor docs |
| [CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/--*) | MDN reference for design token approach used |

---

## 10. Additional Notes for AI Assistants

When working on this codebase, keep these rules in mind:

1. **No build toolchain** — do not introduce `package.json`, `webpack`, `vite`, or any bundler. All code must run directly in the browser via Babel standalone.
2. **CDN React pattern** — use `const { useState, ... } = React;` destructuring, never `import React from 'react'`.
3. **Two variants** — `app.jsx` (simple) and `app-i18n.jsx` (i18n). When adding features, consider whether both variants need updating.
4. **Standalone sync** — after significant changes to the multi-file version, `SpecIndex-standalone.html` needs manual inlining of updated file contents.
5. **CSS tokens first** — before adding any inline styles, check if an existing CSS custom property can be used.
6. **Mock data is the "backend"** — `window.SPEC_DATA` in `data.js` is the source of truth for all search results. The scoring, metadata, and text context are all defined there.
7. **Vendor colors** — each vendor tag uses a dedicated CSS class (`intel`, `amd`, `tcg`, `uefiforum`, `pcisig`) mapped to `--tag-*` tokens. Follow this pattern for any new vendors.
