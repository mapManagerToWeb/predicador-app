# Recovery + Missing Features Design

> **Date:** 2026-08-13
> **Scope:** Recover accidentally-overwritten work from git HEAD, re-implement the two features that were never committed (`html-to-image` migration and marking-mode territory lock), apply the post-review requirements (restore the view with marks after sending, better capture styling for incomplete territories), and verify the full marking → save → WhatsApp-send flow end-to-end.

## Context / Problem

The user reported that "all changes vanished." Investigation showed:

- The current branch `perf/reports-latest-per-territory` at HEAD (`6a657f6`) already contains committed work implementing nearly all described features:
  - localStorage report cache with versioned revalidation (`ReportCacheService`, `GET /reports/versions`)
  - draft marks persistence (`DraftMarksService`) with debounced autosave
  - save seeded into cache + draft cleanup (no re-fetch after saving)
  - pnpm migration (`packageManager: pnpm@9.15.0`, `pnpm-lock.yaml`)
  - `signal<Map>` for manzanas (O(1) lookups)
  - GeoJSON FeatureCollection built in PostgreSQL, gzip compressed
- The **working tree was overwritten with older file versions** (e.g. `package.json` reverted to `npm@11.13.0`, `map-state.service.ts` reverted to `signal<array>`, backend lost `/versions` endpoint). The committed HEAD state is the newer/correct one.
- Untracked new files that must be preserved: `whatsapp-simulation/`, `pending-reports-queue.ts`, `territorios.geojson`, `scripts/`, `pnpm-workspace.yaml`.

Two requested features were **never present in any commit or branch**:

1. Migration `html2canvas` → `html-to-image` (dependency swap + spec update).
2. Guard that blocks territory select/deselect while marking mode is `completa` or `parcial` (the "it gets buggy when you accidentally deselect the territory you're marking" bug). Clarified with user: the lock applies to **territories**, active only while a marking mode (`completa`/`parcial`) is ON.

## Goal

Restore the committed feature set to the working tree, implement the two missing pieces, apply the post-review
requirements (marks stay visible after send with no active selection; capture shows marks + thick incomplete
polygons), and verify the whole flow end-to-end — with quality guards (clean code, tests, lint/build green).

## Approach

### Step 1 — Restore committed work

`git restore .` on tracked files brings the working tree back to HEAD. Untracked files are untouched and preserved. This recovers the localStorage cache, versions endpoint, drafts, pnpm, `signal<Map>`, and Postgres GeoJSON.

### Step 2 — Migrate `html2canvas` → `html-to-image`

- Add dependency `html-to-image` via pnpm; remove `html2canvas`.
- In `predicador-frontend/src/app/features/map/map-report.service.ts:~114` replace the dynamic `import('html2canvas')` + canvas-png conversion with `toPng(node, { pixelRatio, cacheBust })` from `html-to-image`.
- Update `map-report.service.spec.ts`: replace `vi.mock('html2canvas')` with a `html-to-image` mock.
- SSR guard: `html-to-image` is only used inside a browser-only rendering flow (map screenshot); keep the existing guard that skips capture when `document`/Leaflet is unavailable.

### Step 3 — Marking-mode territory lock

Block territory select/deselect while `modoMarcado()` is `completa` or `parcial`.

- Insertion point: `MapInteractionService.handleMapClick` — when a click resolves to `select_territory` (mode `none`) it is allowed; the lock applies because in `completa`/`parcial` modes the interaction already returns `toggle_manzana`/`select_manzana` for the selected territory. The concrete gap: user can click another territory's manzana and it toggles the selection set, losing the territory being marked.
- Guard: in `handleMapClick`, before returning `select_territory`, reject when `modo !== 'none'` and show a toast (`TOAST_MESSAGES` addition, e.g. `territoryLockWhileMarking`).
- TDD: add specs in `map-interaction.service.spec.ts` covering: click on unmarked manzana in another territory while `completa` → `none` action + toast; same in `parcial` → `none`; mode `none` → still `select_territory` (unchanged).
- Alternative considered: guard in `map.ts.handleTerritorySelection` — rejected because independent click paths already handle mode; the service-level guard is single-point and testable.

### Step 4 — Restore the map view after sending (no active selection, marks kept)

Currently `guardarYEnviar` (and `guardarEnBaseDeDatos`) wipe the marked state after success: it clears
`manzanasById` and calls `restaurarVisibilidadPoligonos(marcadas, [])`, which with an empty selection only
re-applies the territory base style — the individual marked manzanas lose their visual highlight, so "the change
that was created" disappears from the map right after sending.

User decision (option 2): after a successful send, **restore the full map view with the created marks still
visible, but without an active territory selection** in the toolbar. The report stays saved in localStorage
(already done via `persistirEnCacheYLimpiarDraft`). No re-fetch is needed — the marks already exist in memory.

- Add a method to `MapRenderingFacade`, e.g. `restaurarVistaConMarcas(manzanasMarcadaList)`:
  - `cancelPendingStyleUpdates()`; then in the queued update, for **every** feature layer apply `computeBaseStyle`
    (unchanged territory-completeness fill), then re-apply `getMarkedManzanaStyle(color)` to every marked manzana of
    every territory (not only the previously selected ones), and finally `updateLabelsVisibility()`.
  - This is `restaurarVisibilidadPoligonos` with the mark re-application decoupled from the selection list — i.e. the
    "previous view with the change" over the full map.
- In `guardarEnBaseDeDatos` success path and `guardarYEnviar` success path (and its catch branch when
  `whatsappSent`), replace:
  `this.rendering.restaurarVisibilidadPoligonos(marcadas, [])` **followed by** `this.state.manzanasById.set(new Map())`
  with:
  - `this.rendering.restaurarVistaConMarcas(marcadas)` (capture the list before any clearing),
  - **do not** clear `manzanasById` — the marks stay in memory so they render,
  - keep clearing only the transient selection: `territoriosSeleccionados.set([])`,
    `territorioSeleccionado.set(null)`, `totalManzanas.set(0)`, `clearDatosParciales()`.
- Note: `guardarEnBaseDeDatos` also gets this consistent restore behavior (same wipe pattern today), though the user
  requirement explicitly targets the send flow.
- Specs: in `map-data-persistence.service.spec.ts` add cases asserting that after a successful send, the selection is
  cleared, `manzanasById` retains the marks, and the facade's new `restaurarVistaConMarcas` is invoked with the
  marked list (instead of `restaurarVisibilidadPoligonos`). Also assert the restore path in the `whatsappSent`-true
  catch branch.
- Facade spec: add `map-rendering.facade.spec.ts` case that `restaurarVistaConMarcas` queues a full-map restore that
  re-applies marked styles for all territories.

### Step 5 — Capture quality: visible marks + thicker incomplete polygons

In the WhatsApp screenshot of incomplete territories (`prepararCapturaSoloIncompletos`), the current
`styleTerritoryLayersSoloIncompletos` paints **every** layer of an incomplete territory with
`{ opacity: 0.6, fillOpacity: 0.05, weight: 1.5 }` — so already-marked manzanas are indistinguishable from unmarked
ones, and incomplete polygons are thin. User requirements: (a) marks look good in the capture, (b) incomplete
polygons have a **larger stroke width** so it's obvious the territory is incomplete.

- Pass the marked list into `styleTerritoryLayersSoloIncompletos` (it currently receives only layers + incomplete
  set; the caller already has `manzanasMarcadas`). Build a `Set<L.Path>` of marked layers via `this.registry.get(m.id)`.
- For incomplete territories, style each `L.Path`:
  - marked layer → `getMarkedManzanaStyle(fl.color)` (keeps the highlight visible in the capture),
  - unmarked layer → new `getCaptureIncompleteStyle(color)` with a clearly **larger weight** (e.g. `weight: 4`,
    low `fillOpacity`, `opacity: 0.8`) so the unmarked/incomplete polygons stand out with a thick stroke.
- Add `getCaptureIncompleteStyle` to `map-style.service.ts` next to `getCaptureUnmarkedStyle`; keep
  `getCaptureUnmarkedStyle` unchanged for the non-incomplete capture path.
- Keep the existing `stylePartialMarks` call after it so partial polygons still render with
  `getPartialPolygonCompleteStyle`.
- Specs: extend `map-capture.service.spec.ts` with a `prepararCapturaSoloIncompletos` describe block asserting that
  marked layers get `getMarkedManzanaStyle`, unmarked layers in incomplete territories get `getCaptureIncompleteStyle`
  (thick weight), completed territories stay hidden, and partial polygons keep their style. Add `map-style.spec.ts`
  assertions for `getCaptureIncompleteStyle`.

### Step 6 — Verification

Run in CI order from `predicador-frontend/`:

1. `pnpm run lint`
2. `npx ng build --configuration=production`
3. `pnpm test -- --run --coverage`

**Functional (E2E) check of the full marking → save → WhatsApp send flow** (this is an explicit user requirement).
With the backends up (`docker compose` or the configured local services) drive the real app and verify end-to-end:

1. Select a territory and enter `completa` marking mode; mark some manzanas (marks highlight immediately).
2. Try selecting/deselecting another territory while marking → locked with toast (Step 3 feature).
3. Tap save → report saved, cache seeded, draft cleared, view restored **with the marks still visible** and **no
   active selection**.
4. Tap send → WhatsApp screenshot captured (incomplete territories with thick strokes + visible marks), message
   reaches the simulation/whatsapp target, and afterwards the **mark/selected-polygon state is restored with the
   change visible but selection cleared**, report present in localStorage.
5. Re-load the app → saved marks restored from cache/localStorage.

Fix anything that fails. Commit in repo style (lowercase Conventional Commits).

## Out of scope

- `pending-reports-queue.ts`: stays unwired (iteration 2 per plan).
- `whatsapp-simulation/`: already present as untracked files, not modified.
- Backend changes: none required; `/versions`, `findVersions`, optimized queries already committed.

## Success criteria

- Working tree equals HEAD for the previously-overwritten committed features.
- `html-to-image` replaces `html2canvas`, specs updated and green.
- Territory cannot be selected/deselected while marking mode is active; toast informs the user; mode `none` behavior unchanged.
- After a successful send (and after a successful save), the full map view is restored **with the created marks still
  visible** and **no active territory selection**; the report is persisted in localStorage and is restored on app reload.
- In the WhatsApp screenshot, marked manzanas keep their highlight and unmarked manzanas in incomplete territories
  render with a thicker stroke so incompleteness is obvious.
- The full marking → save → WhatsApp-send flow works correctly end-to-end (verified against the running app).
- `lint`, production build, and full test suite all green.