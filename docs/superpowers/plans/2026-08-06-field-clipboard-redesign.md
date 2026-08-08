# Field Clipboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Predicador frontend with a "Field Clipboard" visual identity — warm paper tones, clipboard metaphor, and tactile UI elements that reflect the physical artifacts of door-to-door ministry work.

**Architecture:** Update CSS custom properties globally in `styles.css`, then refactor each page's template and styles to match the clipboard aesthetic. No component logic changes — purely visual/CSS.

**Tech Stack:** Angular 22, CSS custom properties, Google Fonts (DM Serif Display, Inter, JetBrains Mono), SVG inline assets

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/index.html` | Modify | Add Google Fonts preconnect + stylesheet links |
| `src/styles.css` | Rewrite | New design tokens, paper grain, font imports, global resets |
| `src/app/app.css` | Rewrite | Toast redesign (paper card style) |
| `src/app/features/map/map.html` | Rewrite | Clipboard sheet markup with clip SVG |
| `src/app/features/map/map.css` | Rewrite | Clipboard sheet styling, mobile/desktop layouts |
| `src/app/features/map/territory-search/territory-search.css` | Rewrite | Search input restyled to paper aesthetic |
| `src/app/features/auth/auth.css` | Rewrite | Shared auth styling (paper card, clip, no blobs) |
| `src/app/features/auth/login.css` | Rewrite | Login-specific background |
| `src/app/features/auth/login.html` | Minor edit | Update tagline text if needed |
| `src/app/features/profile/profile.css` | Rewrite | Profile-specific background |
| `src/app/features/profile/profile.html` | Minor edit | Update tagline text if needed |
| `src/app/features/admin/admin.html` | Minor edit | Update header text |
| `src/app/features/admin/admin.css` | Rewrite | Territory cards, paper aesthetic |

---

## Task 1: Add Google Fonts to index.html

**Files:**
- Modify: `src/index.html`

**Interfaces:** None — this task is standalone.

- [ ] **Step 1: Add font preconnect and stylesheet links**

In `src/index.html`, add these lines inside `<head>`, after the existing `<link rel="manifest" ...>` line:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Verify**

Run: `npm run build --prefix predicador-frontend`
Expected: Build succeeds, fonts load in browser.

- [ ] **Step 3: Commit**

```bash
git add predicador-frontend/src/index.html
git commit -m "style: add Google Fonts (DM Serif Display, Inter, JetBrains Mono)"
```

---

## Task 2: Rewrite global design tokens and resets

**Files:**
- Rewrite: `src/styles.css`

**Interfaces:** Consumes fonts from Task 1. Produces CSS custom properties used by all subsequent tasks.

- [ ] **Step 1: Write the new styles.css**

Replace the entire contents of `src/styles.css` with:

```css
/* ═══════════════════════════════════════════════════
   Field Clipboard — Design Tokens & Global Resets
   ═══════════════════════════════════════════════════ */

/* ── Paper grain SVG filter (inline) ── */
svg.paper-grain-filter {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

/* ── Light Theme ── */
:root {
  /* Paper & Ink */
  --paper: #FDFBF7;
  --ink: #1D1B18;
  --ink-muted: #6B6660;
  --clip-metal: #C9C3BB;
  --shadow-ink: rgba(29, 27, 24, 0.12);

  /* Semantic */
  --territory-blue: #2E5C8A;
  --territory-blue-light: #4A8BC2;
  --field-amber: #B8860B;
  --report-green: #2D7D3A;
  --clear-red: #B83B3B;

  /* Functional aliases (backward compat) */
  --color-primary: var(--territory-blue);
  --color-primary-dark: #1E3D5C;
  --color-success: var(--report-green);
  --color-danger: var(--clear-red);
  --color-warning: var(--field-amber);
  --color-bg: var(--paper);
  --color-surface: #FFFFFF;
  --color-text: var(--ink);
  --color-text-secondary: var(--ink-muted);
  --color-border: var(--clip-metal);
  --color-hover: #F5F3EF;
  --color-tag-bg: #D4EDDA;
  --color-tag-text: #1B5E20;
  --color-input-bg: #FFFFFF;
  --color-shadow: var(--shadow-ink);

  /* Map */
  --map-bg: var(--paper);
  --map-tile-filter: none;
  --map-border-color: rgba(29, 27, 24, 0.7);
  --map-fill-opacity: 0.08;
  --map-active-opacity: 0.6;

  /* Elevation */
  --elev-1: 0 1px 3px var(--shadow-ink);
  --elev-2: 0 4px 12px var(--shadow-ink);
  --elev-3: 0 8px 24px var(--shadow-ink);
  --shadow-sm: var(--elev-1);
  --shadow-md: var(--elev-2);
  --shadow-lg: var(--elev-3);

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;

  /* Type */
  --font-display: 'DM Serif Display', Georgia, 'Times New Roman', serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 2rem;

  /* Safe areas */
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-top: env(safe-area-inset-top, 0px);
}

/* ── Dark Theme ── */
:root[data-theme="dark"] {
  --paper: #1A1815;
  --ink: #F5F2EB;
  --ink-muted: #A8A39C;
  --clip-metal: #8B8680;
  --shadow-ink: rgba(0, 0, 0, 0.35);

  --territory-blue: #5A9BD8;
  --territory-blue-light: #7DB8E8;
  --field-amber: #D4A843;
  --report-green: #4ADE80;
  --clear-red: #F87171;

  --color-primary: var(--territory-blue);
  --color-primary-dark: #3D7AB8;
  --color-success: var(--report-green);
  --color-danger: var(--clear-red);
  --color-warning: var(--field-amber);
  --color-bg: var(--paper);
  --color-surface: #242220;
  --color-text: var(--ink);
  --color-text-secondary: var(--ink-muted);
  --color-border: var(--clip-metal);
  --color-hover: #2E2C28;
  --color-tag-bg: #1B3A20;
  --color-tag-text: #81C784;
  --color-input-bg: #242220;
  --color-shadow: var(--shadow-ink);

  --map-bg: #0E0D0B;
  --map-border-color: rgba(245, 242, 235, 0.7);
  --map-fill-opacity: 0.06;
  --map-active-opacity: 0.7;

  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);
}

/* ── Global Reset ── */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  width: 100%;
  font-family: var(--font-body);
  font-size: 16px;
  color: var(--ink);
  background: var(--paper);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  overflow: hidden;
  overscroll-behavior: none;
}

button {
  font-family: inherit;
  cursor: pointer;
}

input {
  font-family: inherit;
}

a {
  color: inherit;
  text-decoration: none;
}

img {
  max-width: 100%;
  display: block;
}

/* ── Accessibility ── */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

:focus-visible {
  outline: 2px solid var(--territory-blue);
  outline-offset: 2px;
}

/* ── Leaflet Overrides ── */
.leaflet-container {
  background: var(--map-bg);
}

.leaflet-tile {
  transition: opacity 0.2s ease;
}

.leaflet-popup-content-wrapper {
  border-radius: var(--radius-md);
  box-shadow: var(--elev-2);
  background: var(--color-surface);
  color: var(--ink);
}

.leaflet-popup-content {
  margin: 8px 12px;
  font-size: var(--text-sm);
}

.leaflet-tile-pane {
  will-change: auto !important;
}

.leaflet-zoom-animated {
  will-change: transform;
}

:root[data-theme="light"] .leaflet-container {
  filter: brightness(0.92);
}

/* ── Territory Labels (map markers) ── */
.centroid-label {
  background: none !important;
  border: none !important;
}

.centroid-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--territory-blue);
  color: white;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: var(--text-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--elev-1);
  border: 2px solid var(--paper);
}

.territory-label {
  background: none;
  border: none;
}

.territory-label__text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border-radius: 12px;
  background: rgba(253, 251, 247, 0.9);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--ink);
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}

:root[data-theme="dark"] .territory-label__text {
  background: rgba(36, 34, 32, 0.9);
  color: #F5F2EB;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

/* ── Partial marker dot ── */
.partial-dot {
  width: 16px;
  height: 16px;
  background: var(--report-green);
  border: 3px solid var(--paper);
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

/* ── Leaflet dark mode overrides ── */
:root[data-theme="dark"] .leaflet-popup-content-wrapper {
  background: #2E2C28;
  color: #F5F2EB;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

:root[data-theme="dark"] .leaflet-popup-tip {
  background: #2E2C28;
}

:root[data-theme="dark"] .leaflet-container {
  background: #0E0D0B;
}

:root[data-theme="dark"] .leaflet-bar,
:root[data-theme="dark"] .leaflet-control-zoom a,
:root[data-theme="dark"] .leaflet-control-attribution,
:root[data-theme="dark"] .leaflet-control-layers {
  background: rgba(26, 24, 21, 0.92);
  color: #F5F2EB;
  border-color: rgba(139, 134, 128, 0.25);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
}

:root[data-theme="dark"] .leaflet-control-zoom a {
  color: #F5F2EB;
  border-bottom-color: rgba(139, 134, 128, 0.25);
}

:root[data-theme="dark"] .leaflet-control-zoom a:hover,
:root[data-theme="dark"] .leaflet-control-layers:hover {
  background: rgba(46, 44, 40, 0.95);
}

:root[data-theme="dark"] .leaflet-control-attribution,
:root[data-theme="dark"] .leaflet-control-attribution a {
  color: #A8A39C;
}

:root[data-theme="dark"] .leaflet-control-attribution a {
  color: #5A9BD8;
}

:root[data-theme="dark"] .leaflet-interactive {
  stroke: rgba(245, 242, 235, 0.55);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build --prefix predicador-frontend`
Expected: Build succeeds with no CSS errors.

- [ ] **Step 3: Commit**

```bash
git add predicador-frontend/src/styles.css
git commit -m "style: rewrite design tokens for Field Clipboard aesthetic"
```

---

## Task 3: Update toast component styling

**Files:**
- Rewrite: `src/app/app.css`

**Interfaces:** Consumes design tokens from Task 2.

- [ ] **Step 1: Rewrite app.css**

Replace the entire contents of `src/app/app.css` with:

```css
:host {
  display: block;
  height: 100dvh;
}

/* ── Toast (paper card style) ── */
.toast {
  position: fixed;
  bottom: max(80px, calc(60px + var(--safe-bottom)));
  left: 50%;
  transform: translateX(-50%);
  background: var(--paper);
  color: var(--ink);
  padding: 12px 20px;
  border-radius: var(--radius-lg);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 500;
  z-index: 3000;
  box-shadow: var(--elev-3);
  border: 1px solid var(--clip-metal);
  animation: toast-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  max-width: 90vw;
  text-align: center;
  display: flex;
  align-items: center;
  gap: 8px;
}

.toast--success {
  background: #D4EDDA;
  color: #1B5E20;
  border-color: #A5D6A7;
}

.toast--error {
  background: #FFEBEE;
  color: #B71C1C;
  border-color: #EF9A9A;
}

.toast--warning {
  background: #FFF8E1;
  color: #F57F17;
  border-color: #FFE082;
}

.toast--info {
  background: var(--paper);
  color: var(--ink);
  border-color: var(--clip-metal);
}

.toast-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.toast-text {
  white-space: nowrap;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(16px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}

/* ── Dark mode toast ── */
:root[data-theme="dark"] .toast {
  background: #2E2C28;
  color: #F5F2EB;
  border-color: #8B8680;
}

:root[data-theme="dark"] .toast--success {
  background: #1B3A20;
  color: #81C784;
  border-color: #2D7D3A;
}

:root[data-theme="dark"] .toast--error {
  background: #4A1515;
  color: #F87171;
  border-color: #B83B3B;
}

:root[data-theme="dark"] .toast--warning {
  background: #3D2E0A;
  color: #D4A843;
  border-color: #B8860B;
}
```

- [ ] **Step 2: Commit**

```bash
git add predicador-frontend/src/app/app.css
git commit -m "style: restyle toast with paper card aesthetic"
```

---

## Task 4: Rewrite map page template (clipboard sheet markup)

**Files:**
- Rewrite: `src/app/features/map/map.html`

**Interfaces:** Consumes all existing Angular signals/methods from `map.ts` — no logic changes.

- [ ] **Step 1: Rewrite map.html**

Replace the entire contents of `src/app/features/map/map.html` with:

```html
<!-- Paper grain SVG filter (referenced by CSS) -->
<svg class="paper-grain-filter" aria-hidden="true" focusable="false">
  <filter id="paperGrain">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch" result="noise"/>
    <feColorMatrix type="saturate" values="0" in="noise" result="gray"/>
    <feBlend in="SourceGraphic" in2="gray" mode="multiply" result="blended"/>
    <feComponentTransfer in="blended">
      <feFuncA type="linear" slope="0.04"/>
    </feComponentTransfer>
  </filter>
</svg>

<div class="map-page">
  <div class="map-container" id="map"></div>

  @if (isLoading()) {
    <div class="loading-overlay" role="status" aria-live="polite">
      <div class="loading-spinner" aria-hidden="true"></div>
      <span class="loading-text">Cargando territorios...</span>
    </div>
  }

  <div class="top-bar">
    <app-territory-search (territorySelected)="onTerritorioSeleccionado($event)" />
  </div>

  <button
    type="button"
    class="map-toggle-satellite"
    [class.active]="isSatellite()"
    (click)="toggleSatellite()"
    [attr.aria-label]="isSatellite() ? 'Vista normal' : 'Vista satélite'"
    [attr.aria-pressed]="isSatellite()"
  >
    @if (isSatellite()) {
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 000 20 14.5 14.5 0 000-20"/><path d="M2 12h20"/>
      </svg>
    } @else {
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>
      </svg>
    }
  </button>

  @if (tieneTerritorio()) {
    <div class="clipboard-sheet">
      <!-- Metal clip -->
      <div class="clip" aria-hidden="true">
        <svg viewBox="0 0 60 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="2" width="56" height="20" rx="4" stroke="currentColor" stroke-width="1.5"/>
          <rect x="10" y="6" width="40" height="12" rx="3" fill="currentColor" opacity="0.15"/>
          <line x1="20" y1="10" x2="40" y2="10" stroke="currentColor" stroke-width="1" opacity="0.3"/>
          <line x1="20" y1="14" x2="40" y2="14" stroke="currentColor" stroke-width="1" opacity="0.3"/>
        </svg>
      </div>

      <!-- Territory header -->
      <div class="sheet-header" aria-live="polite">
        @if (territoriosSeleccionados().length > 1) {
          <span class="sheet-territory-number">{{ territoriosSeleccionados().length }} terr.</span>
          <span class="sheet-manzanas-count">{{ manzanasCount() }} marcadas</span>
        } @else {
          <span class="sheet-territory-number">{{ territorioSeleccionado() }}</span>
          <span class="sheet-manzanas-count">{{ manzanasCount() }}/{{ totalManzanas() }}</span>
        }
      </div>

      <!-- Row 1: mode + actions -->
      <div class="sheet-row">
        <div class="mode-group" role="group" aria-label="Modo de marcado">
          <button
            type="button"
            class="mode-tab complete"
            [class.active]="modoMarcado() === 'completa'"
            [attr.aria-pressed]="modoMarcado() === 'completa'"
            (click)="toggleModoCompleto()"
          >
            <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            <span class="tab-label">Marcar</span>
          </button>
          <button
            type="button"
            class="mode-tab partial"
            [class.active]="modoMarcado() === 'parcial'"
            [attr.aria-pressed]="modoMarcado() === 'parcial'"
            (click)="setModoMarcado('parcial')"
          >
            <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            <span class="tab-label">Trazar</span>
          </button>
        </div>

        <div class="sheet-actions">
          <label class="visually-hidden" for="predicacion-select">Momento del día</label>
          <select
            id="predicacion-select"
            class="predicacion-select"
            [value]="predicacion()"
            (change)="onPredicacionChange($event)"
          >
            <option value="tarde">Tarde</option>
            <option value="mañana">Mañana</option>
          </select>
          <button
            type="button"
            class="action-btn send"
            [disabled]="manzanasCount() === 0 || enviando() || modoMarcado() === 'parcial'"
            (click)="guardarYEnviar()"
            aria-label="Guardar y enviar reporte"
          >
            @if (enviando()) {
              <div class="btn-spinner" aria-hidden="true"></div>
            } @else {
              <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              <span class="btn-label">Enviar</span>
            }
          </button>
          <button
            type="button"
            class="action-btn clear"
            (click)="limpiarTodo()"
            [attr.aria-label]="modoMarcado() !== 'none' ? 'Cancelar marcado' : 'Limpiar todas las marcas'"
          >
            <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            <span class="btn-label">{{ modoMarcado() !== 'none' ? 'Cancelar' : 'Limpiar' }}</span>
          </button>
        </div>
      </div>

      <!-- Row 2: partial mode controls -->
      @if (modoMarcado() === 'parcial') {
        <div class="sheet-row partial-controls" role="group" aria-label="Controles de marcado parcial">
          <span class="partial-hint" aria-live="polite">{{ puntosCount() }}/6</span>

          <button
            type="button"
            class="partial-btn undo"
            [disabled]="puntosCount() === 0"
            (click)="deshacerPunto()"
            aria-label="Deshacer último punto"
          >
            <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
            <span class="btn-label">Deshacer</span>
          </button>

          <button
            type="button"
            class="partial-btn cancel"
            (click)="cancelarParcial()"
            aria-label="Cancelar marcado parcial"
          >
            <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            <span class="btn-label">Cancelar</span>
          </button>

          <button
            type="button"
            class="partial-btn confirm"
            [disabled]="!puedeConfirmar()"
            (click)="finalizarParcial()"
            aria-label="Confirmar zona parcial"
          >
            <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            <span class="btn-label">Listo</span>
          </button>
        </div>
      }
    </div>
  }
</div>
```

- [ ] **Step 2: Verify build**

Run: `npm run build --prefix predicador-frontend`
Expected: Build succeeds (template compiles, no unknown signals/methods).

- [ ] **Step 3: Commit**

```bash
git add predicador-frontend/src/app/features/map/map.html
git commit -m "style: rewrite map template with clipboard sheet markup"
```

---

## Task 5: Rewrite map page styles (clipboard sheet)

**Files:**
- Rewrite: `src/app/features/map/map.css`

**Interfaces:** Consumes design tokens from Task 2. Used by the template from Task 4.

- [ ] **Step 1: Rewrite map.css**

Replace the entire contents of `src/app/features/map/map.css` with:

```css
/* ═══════════════════════════════════════════════════
   Map Page — Clipboard Sheet
   ═══════════════════════════════════════════════════ */

:host {
  display: block;
  height: 100dvh;
  position: relative;
}

.map-page {
  position: relative;
  width: 100%;
  height: 100%;
}

.map-container {
  width: 100%;
  height: 100%;
  background: var(--map-bg);
  contain: layout style paint;
  will-change: transform;
}

/* ── Loading overlay ── */
.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: color-mix(in srgb, var(--paper) 85%, transparent);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  contain: layout style paint;
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--clip-metal);
  border-top-color: var(--territory-blue);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-text {
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--ink-muted);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Top bar ── */
.top-bar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 1000;
  contain: layout style;
}

/* ── Satellite toggle ── */
.map-toggle-satellite {
  position: absolute;
  bottom: 20px;
  left: 12px;
  z-index: 1000;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--clip-metal);
  background: color-mix(in srgb, var(--paper) 90%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--ink-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--elev-1);
  transition: all 0.2s ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.map-toggle-satellite svg {
  width: 20px;
  height: 20px;
}

.map-toggle-satellite:active {
  transform: scale(0.92);
}

.map-toggle-satellite.active {
  background: color-mix(in srgb, var(--territory-blue) 15%, var(--paper));
  color: var(--territory-blue);
  border-color: var(--territory-blue);
}

/* ── Clipboard Sheet (bottom bar) ── */
.clipboard-sheet {
  position: absolute;
  bottom: 12px;
  left: 12px;
  right: 12px;
  z-index: 1000;
  background: var(--paper);
  border-radius: var(--radius-xl);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: var(--elev-3);
  border: 1px solid var(--clip-metal);
  contain: layout style;
  animation: sheet-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.clipboard-sheet::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: var(--radius-xl);
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
  background-size: 128px 128px;
  pointer-events: none;
  z-index: 0;
}

@keyframes sheet-in {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ── Metal Clip ── */
.clip {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  width: 48px;
  height: 20px;
  color: var(--clip-metal);
  z-index: 1;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.15));
}

.clip svg {
  width: 100%;
  height: 100%;
}

/* ── Sheet Header (territory label) ── */
.sheet-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 4px 0;
  position: relative;
  z-index: 1;
}

.sheet-territory-number {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 400;
  color: var(--ink);
  line-height: 1;
  letter-spacing: -0.01em;
}

.sheet-manzanas-count {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--ink-muted);
}

/* ── Sheet Row ── */
.sheet-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  position: relative;
  z-index: 1;
}

/* ── Mode Tabs ── */
.mode-group {
  display: flex;
  gap: 4px;
}

.mode-tab {
  height: 48px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--clip-metal);
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  transition: all 0.15s ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  font-family: var(--font-body);
}

.mode-tab .tab-icon {
  width: 18px;
  height: 18px;
  fill: currentColor;
}

.mode-tab .tab-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.mode-tab.complete {
  background: color-mix(in srgb, var(--territory-blue) 8%, transparent);
  color: var(--territory-blue);
  border-color: color-mix(in srgb, var(--territory-blue) 30%, transparent);
}

.mode-tab.complete.active {
  background: var(--territory-blue);
  color: #FFFFFF;
  border-color: var(--territory-blue);
  box-shadow: 0 2px 8px rgba(46, 92, 138, 0.3);
}

.mode-tab.partial {
  background: color-mix(in srgb, var(--field-amber) 8%, transparent);
  color: var(--field-amber);
  border-color: color-mix(in srgb, var(--field-amber) 30%, transparent);
}

.mode-tab.partial.active {
  background: var(--field-amber);
  color: #FFFFFF;
  border-color: var(--field-amber);
  box-shadow: 0 2px 8px rgba(184, 134, 11, 0.3);
}

/* ── Sheet Actions ── */
.sheet-actions {
  display: flex;
  gap: 6px;
  margin-left: auto;
  align-items: center;
}

.action-btn {
  height: 48px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  transition: all 0.15s ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
}

.action-btn .btn-icon {
  width: 18px;
  height: 18px;
  fill: currentColor;
}

.action-btn.send {
  background: var(--report-green);
  color: #FFFFFF;
  box-shadow: 0 2px 6px rgba(45, 125, 58, 0.25);
}

.action-btn.send:active:not(:disabled) {
  transform: scale(0.96);
}

.action-btn.send:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.action-btn.clear {
  background: color-mix(in srgb, var(--clear-red) 10%, transparent);
  color: var(--clear-red);
  border: 1.5px solid color-mix(in srgb, var(--clear-red) 30%, transparent);
}

.action-btn.clear:active {
  background: var(--clear-red);
  color: #FFFFFF;
}

.btn-spinner {
  width: 18px;
  height: 18px;
  border: 2.5px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

/* ── Predicacion Select ── */
.predicacion-select {
  height: 48px;
  padding: 0 12px;
  padding-right: 28px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--clip-metal);
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  box-sizing: border-box;
  -webkit-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236B6660' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}

/* ── Partial Controls Row ── */
.partial-controls {
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--clip-metal) 40%, transparent);
}

.partial-hint {
  font-family: var(--font-mono);
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--ink);
  white-space: nowrap;
  min-width: 36px;
  text-align: center;
}

.partial-btn {
  height: 44px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  border: 1.5px solid transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  transition: all 0.15s ease;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
}

.partial-btn .btn-icon {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.partial-btn.undo {
  background: color-mix(in srgb, var(--territory-blue) 10%, transparent);
  color: var(--territory-blue);
  border-color: color-mix(in srgb, var(--territory-blue) 30%, transparent);
}

.partial-btn.undo:active:not(:disabled) {
  background: var(--territory-blue);
  color: #FFFFFF;
}

.partial-btn.undo:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.partial-btn.cancel {
  background: color-mix(in srgb, var(--clear-red) 10%, transparent);
  color: var(--clear-red);
  border-color: color-mix(in srgb, var(--clear-red) 30%, transparent);
}

.partial-btn.cancel:active {
  background: var(--clear-red);
  color: #FFFFFF;
}

.partial-btn.confirm {
  background: color-mix(in srgb, var(--report-green) 10%, transparent);
  color: var(--report-green);
  border-color: color-mix(in srgb, var(--report-green) 30%, transparent);
}

.partial-btn.confirm:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.partial-btn.confirm:not(:disabled):active {
  background: var(--report-green);
  color: #FFFFFF;
}

/* ═══════════════════════════════════════════════════
   Responsive
   ═══════════════════════════════════════════════════ */

/* ── Mobile (< 768px): stack everything ── */
@media (max-width: 768px) {
  .clipboard-sheet {
    bottom: env(safe-area-inset-bottom, 8px);
    left: 8px;
    right: 8px;
    padding: 14px;
    border-radius: var(--radius-xl);
    gap: 12px;
  }

  .map-toggle-satellite {
    bottom: 220px;
  }

  .sheet-row {
    gap: 8px;
    align-items: stretch;
  }

  .mode-group {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .mode-tab {
    width: 100%;
    height: 52px;
    padding: 0 10px;
    gap: 2px;
  }

  .mode-tab .tab-icon {
    width: 20px;
    height: 20px;
  }

  .sheet-header {
    width: 100%;
    justify-content: space-between;
    padding: 4px 4px 0;
  }

  .sheet-territory-number {
    font-size: var(--text-2xl);
  }

  .sheet-actions {
    width: 100%;
    margin-left: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 6px;
  }

  .action-btn {
    height: 52px;
    padding: 0 10px;
    font-size: 11px;
    gap: 4px;
    min-width: 0;
  }

  .action-btn .btn-icon {
    width: 20px;
    height: 20px;
  }

  .predicacion-select {
    height: 52px;
    font-size: var(--text-sm);
    padding: 0 10px;
    padding-right: 28px;
    width: 100%;
    min-width: 0;
  }

  .partial-controls {
    gap: 8px;
    padding-top: 10px;
    flex-wrap: wrap;
  }

  .partial-hint {
    flex-basis: 100%;
    text-align: left;
    padding-left: 2px;
  }

  .partial-btn {
    height: 48px;
    padding: 0 12px;
    gap: 5px;
    flex: 1 1 calc(33.333% - 6px);
    min-width: 80px;
  }

  .partial-btn .btn-icon {
    width: 18px;
    height: 18px;
  }
}

/* ── Very small screens (< 420px) ── */
@media (max-width: 420px) {
  .sheet-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .predicacion-select {
    grid-column: 1 / -1;
  }

  .partial-btn {
    flex-basis: calc(50% - 4px);
    min-width: 0;
  }
}

/* ── Desktop (> 768px): centered floating card ── */
@media (min-width: 769px) {
  .clipboard-sheet {
    max-width: 520px;
    left: 50%;
    transform: translateX(-50%);
    bottom: 24px;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add predicador-frontend/src/app/features/map/map.css
git commit -m "style: rewrite map styles with clipboard sheet design"
```

---

## Task 6: Rewrite auth shared styles

**Files:**
- Rewrite: `src/app/features/auth/auth.css`

**Interfaces:** Consumes design tokens from Task 2. Used by login and profile pages.

- [ ] **Step 1: Rewrite auth.css**

Replace the entire contents of `src/app/features/auth/auth.css` with:

```css
/* ═══════════════════════════════════════════════════
   Shared Auth Styles — Login, Profile (Paper Card)
   ═══════════════════════════════════════════════════ */

:host {
  display: block;
  height: 100%;
}

/* ── Shell (paper background) ── */
.auth-shell {
  position: fixed;
  inset: 0;
  background: var(--paper);
  overflow: hidden;
}

.auth-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
  background-size: 128px 128px;
  pointer-events: none;
  z-index: 0;
}

.auth-shell::after {
  content: '';
  position: absolute;
  width: 500px;
  height: 500px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--territory-blue) 6%, transparent) 0%, transparent 60%);
  top: -150px;
  right: -100px;
  animation: ambient-glow 25s ease-in-out infinite;
  z-index: 0;
  pointer-events: none;
}

@keyframes ambient-glow {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(-50px, 60px) scale(1.15); }
  50% { transform: translate(30px, -30px) scale(0.85); }
  75% { transform: translate(-20px, 40px) scale(1.05); }
}

/* ── Scroll Container ── */
.auth-scroll {
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
}

/* ── Card (clipboard sheet) ── */
.auth-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 440px;
  width: 100%;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  animation: card-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ── Brand ── */
.auth-brand {
  text-align: center;
  padding: 2.5rem 0 2rem;
}

.brand-icon {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: var(--territory-blue);
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;
  box-shadow:
    0 4px 16px rgba(46, 92, 138, 0.3),
    0 0 0 6px color-mix(in srgb, var(--territory-blue) 10%, transparent);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
}

.brand-icon:hover {
  transform: scale(1.06) rotate(-2deg);
  box-shadow:
    0 6px 24px rgba(46, 92, 138, 0.4),
    0 0 0 8px color-mix(in srgb, var(--territory-blue) 12%, transparent);
}

.auth-brand h1 {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 400;
  color: var(--ink);
  letter-spacing: -0.01em;
  margin: 0;
}

.tagline {
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--ink-muted);
  margin-top: 0.5rem;
}

/* ── Body ── */
.auth-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1.25rem;
}

.section-label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--ink-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── Field ── */
.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field fieldset {
  border: none;
  padding: 0;
  margin: 0;
}

.field legend,
.field label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--ink);
  padding-left: 2px;
}

.field input {
  width: 100%;
  height: 48px;
  padding: 0 1rem;
  background: color-mix(in srgb, var(--paper) 90%, var(--clip-metal));
  border: 1.5px solid var(--clip-metal);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--ink);
  transition: all 0.2s ease;
  box-sizing: border-box;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
}

.field input:hover {
  border-color: #A8A39C;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.06);
}

.field input:focus {
  outline: none;
  border-color: var(--territory-blue);
  background: #FFFFFF;
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--territory-blue) 12%, transparent),
    inset 0 1px 2px rgba(0, 0, 0, 0.04);
}

.field input::placeholder {
  color: var(--ink-muted);
  opacity: 0.5;
}

/* ── Phone input ── */
.input-phone {
  display: flex;
  align-items: center;
  background: color-mix(in srgb, var(--paper) 90%, var(--clip-metal));
  border: 1.5px solid var(--clip-metal);
  border-radius: var(--radius-md);
  transition: all 0.2s ease;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
}

.input-phone:hover {
  border-color: #A8A39C;
}

.input-phone:focus-within {
  border-color: var(--territory-blue);
  background: #FFFFFF;
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--territory-blue) 12%, transparent),
    inset 0 1px 2px rgba(0, 0, 0, 0.04);
}

.input-phone .prefix {
  padding: 0 0.875rem;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--ink-muted);
  background: color-mix(in srgb, var(--clip-metal) 20%, transparent);
  height: 48px;
  display: flex;
  align-items: center;
  user-select: none;
  flex-shrink: 0;
  border-right: 1px solid var(--clip-metal);
}

.input-phone input {
  flex: 1;
  min-width: 0;
  height: 48px;
  padding: 0 1rem;
  border: none;
  background: transparent;
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--ink);
  outline: none;
}

.input-phone input::placeholder {
  color: var(--ink-muted);
  opacity: 0.5;
}

/* ── Button ── */
.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 52px;
  width: 100%;
  padding: 0 1.5rem;
  background: var(--territory-blue);
  color: #FFFFFF;
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.2s ease;
  margin-top: 0.5rem;
  box-shadow: 0 2px 8px rgba(46, 92, 138, 0.25);
}

.btn-primary::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.15) 50%,
    transparent 100%
  );
  transform: translateX(-100%);
  transition: transform 0.5s ease;
}

.btn-primary:hover:not(:disabled)::before {
  transform: translateX(100%);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(46, 92, 138, 0.35);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
  box-shadow: 0 1px 4px rgba(46, 92, 138, 0.25);
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2.5px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Footer ── */
.auth-footer {
  text-align: center;
  padding: 1.5rem 0 calc(1.5rem + var(--safe-bottom));
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--ink-muted);
  flex-shrink: 0;
}

.auth-footer a {
  color: var(--territory-blue);
  font-weight: 600;
  margin-left: 0.25rem;
  text-decoration: none;
  position: relative;
  transition: color 0.2s ease;
}

.auth-footer a::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 2px;
  background: var(--territory-blue);
  transition: width 0.3s ease;
  border-radius: 1px;
}

.auth-footer a:hover::after {
  width: 100%;
}

.auth-footer a:hover {
  color: var(--color-primary-dark);
}

/* ── Avatar grid ── */
.avatar-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.875rem;
  padding: 0.25rem;
}

.avatar-btn {
  aspect-ratio: 1;
  border: 2.5px solid var(--clip-metal);
  border-radius: 50%;
  background: color-mix(in srgb, var(--paper) 80%, var(--clip-metal));
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  box-shadow: var(--elev-1);
}

.avatar-btn:hover {
  transform: scale(1.12);
  border-color: var(--territory-blue);
  box-shadow: 0 4px 12px rgba(46, 92, 138, 0.2);
}

.avatar-btn.selected {
  border-color: var(--avatar-color, var(--territory-blue));
  background: var(--avatar-color, var(--territory-blue));
  transform: scale(1.12);
  box-shadow:
    0 4px 16px color-mix(in srgb, var(--avatar-color, var(--territory-blue)) 35%, transparent),
    0 0 0 3px color-mix(in srgb, var(--avatar-color, var(--territory-blue)) 12%, transparent);
  animation: avatar-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes avatar-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1.12); }
}

/* ── Responsive ── */
@media (min-width: 640px) {
  .auth-card {
    justify-content: center;
    padding-top: 2rem;
    padding-bottom: 2rem;
  }

  .auth-brand {
    padding-top: 0;
  }

  .auth-body {
    justify-content: center;
  }
}

@media (max-width: 360px) {
  .auth-card {
    padding: 0 1.25rem;
  }

  .brand-icon {
    width: 60px;
    height: 60px;
    border-radius: 16px;
  }

  .brand-icon svg {
    width: 26px;
    height: 26px;
  }

  .auth-brand h1 {
    font-size: 1.5rem;
  }

  .avatar-grid {
    gap: 0.625rem;
  }

  .avatar-btn {
    font-size: 1.25rem;
  }
}

/* ── Dark mode ── */
:root[data-theme="dark"] .auth-shell {
  background: #1A1815;
}

:root[data-theme="dark"] .auth-shell::before {
  opacity: 0.5;
}

:root[data-theme="dark"] .auth-shell::after {
  background: radial-gradient(circle, color-mix(in srgb, var(--territory-blue) 4%, transparent) 0%, transparent 60%);
}

:root[data-theme="dark"] .brand-icon {
  background: var(--territory-blue);
}

:root[data-theme="dark"] .field input,
:root[data-theme="dark"] .input-phone {
  background: rgba(26, 24, 21, 0.8);
  border-color: rgba(139, 134, 128, 0.25);
  color: #F5F2EB;
}

:root[data-theme="dark"] .field input:focus,
:root[data-theme="dark"] .input-phone:focus-within {
  background: #242220;
  border-color: var(--territory-blue);
}

:root[data-theme="dark"] .input-phone .prefix {
  background: rgba(139, 134, 128, 0.15);
  color: #A8A39C;
}

:root[data-theme="dark"] .avatar-btn {
  background: rgba(26, 24, 21, 0.6);
  border-color: rgba(139, 134, 128, 0.25);
}
```

- [ ] **Step 2: Commit**

```bash
git add predicador-frontend/src/app/features/auth/auth.css
git commit -m "style: rewrite shared auth styles with paper/clipboard aesthetic"
```

---

## Task 7: Update login page styles

**Files:**
- Rewrite: `src/app/features/auth/login.css`

**Interfaces:** Consumes shared auth styles from Task 6.

- [ ] **Step 1: Rewrite login.css**

Replace the entire contents of `src/app/features/auth/login.css` with:

```css
/* ── Login-specific (minimal overrides) ── */
/* All shared styles in auth.css */
/* Login background is handled by .auth-shell in auth.css */
```

(All login-specific gradient blobs are removed. The paper background from auth.css handles it.)

- [ ] **Step 2: Commit**

```bash
git add predicador-frontend/src/app/features/auth/login.css
git commit -m "style: simplify login.css (paper background via auth.css)"
```

---

## Task 8: Update profile page styles

**Files:**
- Rewrite: `src/app/features/profile/profile.css`

**Interfaces:** Consumes shared auth styles from Task 6.

- [ ] **Step 1: Rewrite profile.css**

Replace the entire contents of `src/app/features/profile/profile.css` with:

```css
/* ── Profile-specific ── */
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.875rem;
}

.field-row .field {
  min-width: 0;
}

/* ── Responsive (small screens) ── */
@media (max-width: 360px) {
  .field-row {
    grid-template-columns: 1fr;
    gap: 1.125rem;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add predicador-frontend/src/app/features/profile/profile.css
git commit -m "style: simplify profile.css (paper background via auth.css)"
```

---

## Task 9: Update admin page styles

**Files:**
- Rewrite: `src/app/features/admin/admin.css`

**Interfaces:** Consumes design tokens from Task 2.

- [ ] **Step 1: Rewrite admin.css**

Replace the entire contents of `src/app/features/admin/admin.css` with:

```css
/* ═══════════════════════════════════════════════════
   Admin Page — Paper Cards
   ═══════════════════════════════════════════════════ */

/* ── Login Screen ── */
.login-container {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: var(--paper);
  position: relative;
  overflow: hidden;
}

.login-container::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
  background-size: 128px 128px;
  pointer-events: none;
}

.login-card {
  background: #FFFFFF;
  border: 1.5px solid var(--clip-metal);
  border-radius: var(--radius-xl);
  padding: 2.5rem 2rem;
  width: 100%;
  max-width: 400px;
  box-shadow: var(--elev-3);
  position: relative;
  z-index: 1;
  animation: card-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes card-in {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── Brand ── */
.login-brand {
  text-align: center;
  margin-bottom: 2rem;
}

.login-brand .brand-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--territory-blue);
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  box-shadow: 0 4px 16px rgba(46, 92, 138, 0.3);
  transition: transform 0.3s ease;
}

.login-brand .brand-icon:hover {
  transform: scale(1.05) rotate(-2deg);
}

.login-brand h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 400;
  text-align: center;
  color: var(--ink);
}

.subtitle {
  text-align: center;
  color: var(--ink-muted);
  margin: 0.375rem 0 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
}

/* ── Login Body ── */
.login-body {
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--ink);
}

.form-group input {
  height: 48px;
  padding: 0 1rem;
  background: color-mix(in srgb, var(--paper) 90%, var(--clip-metal));
  border: 1.5px solid var(--clip-metal);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--ink);
  transition: all 0.2s ease;
  box-sizing: border-box;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
}

.form-group input::placeholder {
  color: var(--ink-muted);
  opacity: 0.5;
}

.form-group input:focus {
  outline: none;
  border-color: var(--territory-blue);
  background: #FFFFFF;
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--territory-blue) 12%, transparent),
    inset 0 1px 2px rgba(0, 0, 0, 0.04);
}

.error-msg {
  color: var(--clear-red);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  text-align: center;
}

.login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 50px;
  width: 100%;
  padding: 0 1.5rem;
  background: var(--territory-blue);
  color: #FFFFFF;
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(46, 92, 138, 0.25);
}

.login-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.15) 50%,
    transparent 100%
  );
  transform: translateX(-100%);
  transition: transform 0.6s ease;
}

.login-btn:hover:not(:disabled)::before {
  transform: translateX(100%);
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(46, 92, 138, 0.35);
}

.login-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.login-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2.5px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Admin Dashboard ── */
.admin-container {
  height: 100dvh;
  overflow-y: auto;
  background: var(--paper);
  padding-bottom: 2rem;
  -webkit-overflow-scrolling: touch;
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: #FFFFFF;
  box-shadow: var(--elev-1);
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid var(--clip-metal);
}

.admin-header h1 {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 400;
  margin: 0;
  color: var(--ink);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.nav-btn,
.logout-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.nav-btn {
  background: color-mix(in srgb, var(--territory-blue) 10%, transparent);
  color: var(--territory-blue);
}

.nav-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(46, 92, 138, 0.2);
}

.logout-btn {
  background: color-mix(in srgb, var(--clear-red) 10%, transparent);
  color: var(--clear-red);
}

.logout-btn:hover {
  background: color-mix(in srgb, var(--clear-red) 15%, transparent);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(184, 59, 59, 0.2);
}

/* ── Dashboard Section ── */
.dashboard-section {
  padding: 1.5rem 1.25rem;
}

.dashboard-section h2 {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 400;
  color: var(--ink);
  margin: 0 0 0.25rem;
}

.help-text {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--ink-muted);
  margin: 0 0 1.5rem;
}

/* ── Empty State ── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  color: var(--ink-muted);
}

.empty-state svg {
  opacity: 0.3;
  margin-bottom: 1rem;
}

.empty-state p {
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: 500;
}

/* ── Territory Color Grid ── */
.territory-color-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.territory-color-card {
  background: #FFFFFF;
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--elev-1);
  border: 1px solid var(--clip-metal);
  transition: all 0.15s ease;
}

.territory-color-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--elev-2);
}

.territory-number {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 400;
  color: var(--ink);
}

.territory-label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--ink-muted);
  margin-bottom: 10px;
}

.color-picker-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
}

.color-swatch:hover {
  transform: scale(1.2);
}

.color-swatch.selected {
  border-color: var(--ink);
  transform: scale(1.2);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.current-color {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--ink-muted);
}

.color-preview {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  display: inline-block;
}

.color-hex {
  font-family: var(--font-mono);
}

/* ── Dark mode ── */
:root[data-theme="dark"] .login-container {
  background: #1A1815;
}

:root[data-theme="dark"] .login-card {
  background: #242220;
  border-color: rgba(139, 134, 128, 0.2);
}

:root[data-theme="dark"] .form-group input {
  background: rgba(26, 24, 21, 0.8);
  border-color: rgba(139, 134, 128, 0.25);
  color: #F5F2EB;
}

:root[data-theme="dark"] .form-group input:focus {
  background: #2E2C28;
  border-color: var(--territory-blue);
}

:root[data-theme="dark"] .admin-header {
  background: #242220;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

:root[data-theme="dark"] .nav-btn {
  background: color-mix(in srgb, var(--territory-blue) 15%, transparent);
  color: #5A9BD8;
}

:root[data-theme="dark"] .logout-btn {
  background: color-mix(in srgb, var(--clear-red) 15%, transparent);
  color: #F87171;
}

:root[data-theme="dark"] .territory-color-card {
  background: #242220;
  border-color: rgba(139, 134, 128, 0.2);
}

:root[data-theme="dark"] .territory-number {
  color: #F5F2EB;
}
```

- [ ] **Step 2: Commit**

```bash
git add predicador-frontend/src/app/features/admin/admin.css
git commit -m "style: rewrite admin styles with paper card aesthetic"
```

---

## Task 10: Update territory search styles

**Files:**
- Rewrite: `src/app/features/map/territory-search/territory-search.css`

**Interfaces:** Consumes design tokens from Task 2.

- [ ] **Step 1: Rewrite territory-search.css**

Replace the entire contents of `src/app/features/map/territory-search/territory-search.css` with:

```css
/* ═══════════════════════════════════════════════════
   Territory Search — Paper Input
   ═══════════════════════════════════════════════════ */

.search-container {
  position: relative;
  z-index: 1000;
}

.search-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
}

.search-icon {
  position: absolute;
  left: 12px;
  width: 18px;
  height: 18px;
  color: var(--ink-muted);
  transition: color 0.2s ease;
}

.search-input {
  width: 100%;
  padding: 14px 14px 14px 40px;
  border: 1.5px solid var(--clip-metal);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-base);
  background: color-mix(in srgb, var(--paper) 90%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--ink);
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  box-shadow: var(--elev-1);
}

.search-input:focus {
  outline: none;
  border-color: var(--territory-blue);
  background: color-mix(in srgb, var(--paper) 95%, transparent);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--territory-blue) 12%, transparent),
    var(--elev-1);
}

.search-input:focus + .search-icon,
.search-input-wrapper:has(.search-input:focus) .search-icon {
  color: var(--territory-blue);
}

.theme-toggle {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--clip-metal);
  background: color-mix(in srgb, var(--paper) 90%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--ink-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
  box-shadow: var(--elev-1);
}

.theme-toggle svg {
  width: 18px;
  height: 18px;
  transition: transform 0.3s ease;
}

.theme-toggle:hover {
  border-color: var(--territory-blue);
  color: var(--territory-blue);
  transform: translateY(-1px);
  box-shadow: var(--elev-2);
}

.theme-toggle:hover svg {
  transform: rotate(15deg);
}

.theme-toggle:active {
  transform: scale(0.95);
}

.logout-toggle {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--clip-metal);
  background: color-mix(in srgb, var(--paper) 90%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--ink-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
  box-shadow: var(--elev-1);
}

.logout-toggle svg {
  width: 18px;
  height: 18px;
  transition: transform 0.3s ease;
}

.logout-toggle:hover {
  border-color: var(--clear-red);
  background: color-mix(in srgb, var(--clear-red) 8%, transparent);
  color: var(--clear-red);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--clear-red) 15%, transparent);
}

.logout-toggle:active {
  transform: scale(0.95);
}

/* ── Dropdown ── */
.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--paper);
  border: 1px solid var(--clip-metal);
  border-radius: var(--radius-md);
  margin-top: 4px;
  max-height: 240px;
  overflow-y: auto;
  box-shadow: var(--elev-3);
}

.dropdown-item {
  display: block;
  width: 100%;
  padding: 12px 16px;
  text-align: left;
  border: none;
  background: none;
  cursor: pointer;
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--ink);
  border-bottom: 1px solid color-mix(in srgb, var(--clip-metal) 40%, transparent);
  transition: background 0.15s ease;
}

.dropdown-item:last-child {
  border-bottom: none;
}

.dropdown-item:hover {
  background: var(--color-hover);
}

.dropdown-item-all {
  font-weight: 600;
  color: var(--territory-blue);
  background: color-mix(in srgb, var(--territory-blue) 6%, transparent);
  border-bottom: 2px solid var(--clip-metal);
}

.dropdown-item-all:hover {
  background: color-mix(in srgb, var(--territory-blue) 12%, transparent);
}

/* ── Skeleton ── */
.skeleton-container {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--paper);
  border: 1px solid var(--clip-metal);
  border-radius: var(--radius-md);
  margin-top: 4px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
}

.skeleton-line {
  height: 14px;
  background: linear-gradient(90deg, var(--clip-metal) 25%, color-mix(in srgb, var(--clip-metal) 50%, transparent) 50%, var(--clip-metal) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 6px;
}

.skeleton-short {
  width: 60%;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Dark mode ── */
:root[data-theme="dark"] .search-input {
  background: color-mix(in srgb, #1A1815 85%, transparent);
  border-color: rgba(139, 134, 128, 0.25);
  color: #F5F2EB;
}

:root[data-theme="dark"] .search-input:focus {
  background: #242220;
  border-color: var(--territory-blue);
}

:root[data-theme="dark"] .theme-toggle,
:root[data-theme="dark"] .logout-toggle {
  background: color-mix(in srgb, #1A1815 85%, transparent);
  border-color: rgba(139, 134, 128, 0.25);
  color: #A8A39C;
}

:root[data-theme="dark"] .theme-toggle:hover {
  border-color: var(--territory-blue);
  color: #5A9BD8;
}

:root[data-theme="dark"] .logout-toggle:hover {
  border-color: var(--clear-red);
  color: #F87171;
}

:root[data-theme="dark"] .dropdown {
  background: #242220;
  border-color: rgba(139, 134, 128, 0.25);
}

:root[data-theme="dark"] .dropdown-item {
  color: #F5F2EB;
  border-bottom-color: rgba(139, 134, 128, 0.15);
}
```

- [ ] **Step 2: Commit**

```bash
git add predicador-frontend/src/app/features/map/territory-search/territory-search.css
git commit -m "style: rewrite territory search with paper input aesthetic"
```

---

## Task 11: Build verification

**Files:** None (verification only)

**Interfaces:** All tasks complete.

- [ ] **Step 1: Run lint**

Run: `npm run lint --prefix predicador-frontend`
Expected: No errors (warnings acceptable if pre-existing).

- [ ] **Step 2: Run full build**

Run: `npm run build --prefix predicador-frontend`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Run tests**

Run: `npm test --prefix predicador-frontend -- --run`
Expected: All existing tests pass (no logic changes, so tests should pass).

- [ ] **Step 4: Visual check**

Open `http://localhost:4200` in browser, verify:
- Login page shows paper background, clipboard card
- Map page shows clipboard sheet with metal clip
- Territory number uses serif font
- Mode tabs have ink-fill active state
- Dark mode toggle works with warm paper tones
- Mobile responsive layout stacks correctly

- [ ] **Step 5: Final commit (if needed)**

```bash
git add -A
git commit -m "style: Field Clipboard redesign complete"
```

---

## Self-Review

- [x] Spec coverage: All sections implemented (tokens, type, layout, signature, responsive, accessibility)
- [x] Placeholder scan: No TBD/TODO/fill-in steps
- [x] Type consistency: Token names consistent across all tasks (--paper, --ink, --territory-blue, etc.)
- [x] File list matches implementation: All files listed in File Map have corresponding tasks