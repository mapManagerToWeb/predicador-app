# Marking-mode Lock + Report Load Filter Design

> **Date:** 2026-08-13
> **Scope:** Stop the map from requesting reports for every territory on pan/zoom (cache-first + one-time validation), and make marking mode strictly mark-only (no accidental unmarking / deselection while marking), keeping unselected territories hidden whenever a selection is active.

## Context / Problem

Two user-reported behaviors on `predicador-frontend`:

1. **Reports keep being fetched for all territories.** `MapInitializationService.onMoveEnd` restores newly visible
   territories via `restaurarMarcadoDesdeDB` → `TerritorioService.getReportesPorTerritorio` → a raw
   `GET /reports?territorioNumero=X` **per territory, including empty ones**, on every initial load and every
   subsequent pan. Meanwhile the batched, filtered path already exists (`revalidarReportes`: `GET /reports/versions`
   returns only territories that have reports; `GET /reports/batch` only for changed, non-empty ones; results seeded
   into the localStorage `ReportCacheService`). Desired: only territories with records are ever requested; empty
   territories are known immediately (`versionsSeen = -1`); pan/zoom never hits the network; a fresh session
   validates versions once and paints from cache afterwards.

2. **Marking mode can accidentally unmark / deselect.** While marking a selected territory (`completa`/`parcial`),
   clicking an already-marked manzana still toggles it off — `map-interaction.service.ts` returns
   `toggle_manzana` for marked manzanas in both modes, and the `completa` manzana handler in
   `map-initialization.service.ts` calls `toggleManzana`. Unmarking the last manzana also removes the territory from
   `territoriosSeleccionados` (`desmarcarManzana`). Desired (user answers): in marking modes the map **only marks,
   never unmarks**; selecting/deselecting stays possible only after exiting marking mode; multi-selection is kept;
   whenever a territory is selected, all non-selected territories stay hidden (also while panning in mode `none`).

## Goal

- Cache-first report rendering: one `/versions` revalidation of **all** territories at session start (filtered to
  non-empty), `/batch` only for changed ones; `onMoveEnd` restores newly loaded territories from localStorage cache
  with **zero** report network calls on pan/zoom.
- Strict mark-only behavior in `completa`/`parcial`; `toggle` (unmark) preserved only in mode `none`.
- Non-selected territories hidden whenever `territoriosSeleccionados().length > 0`, including during pan.
- Multi-selection, draft restore, screenshot capture (`prepararCaptura`) behavior unchanged.
- Quality guards: clean code, updated specs, lint/build green.

## Approach

### Step 1 — `MapInitializationService.onMoveEnd` (cache restore, no network)

Replace the per-territory `restaurarMarcadoDesdeDB` (raw fetch) for newly loaded territories with a synchronous
cache restore:

- For each `num` in `newlyLoaded` with a loaded feature layer:
  - If `num` is in the draft (`DraftMarksService.cargar().territoriosSeleccionados`) → paint from the draft report
    (`reporteDesdeDraft`), same as `restaurarMarcadoDesdeDraft`.
  - Otherwise → `const cached = getReportesDesdeCache([num]).get(num) ?? []` and
    `selection.restaurarMarcadoConReportes(num, cached, fl.color, { actualizarEstadoMarcado: false })`.
  - Empty/unknown territories paint nothing (correct: no marks), and no request is made.
- Change the hide guard to: `if (newlyLoaded.length > 0 && territoriosSeleccionados().length > 0)`
  `ocultarPoligonosNoSeleccionados(...)` — hide whenever a selection is active, not only while marking.

### Step 2 — `MapInitializationService.restoreAllMarks` (validate all territories)

- Keep the instant paint from cache and the draft restore (loaded layers only).
- For revalidation, use **all** territory numbers from `rendering.getTerritoryDataCache().keys()` instead of only the
  loaded layers: `const todos = Array.from(rendering.getTerritoryDataCache().keys())`,
  `sinDraft = todos.filter(n => !territoriosConDraft.has(n))`, then `revalidarReportes(sinDraft)`.
- When repainting revalidated entries, skip territories without a loaded layer
  (`getFeatureLayerByTerritorio(num)` undefined) — the localStorage cache is seeded for them by
  `revalidarReportes`, so they render correctly when loaded later during a pan.

### Step 3 — `MapSelectionService`: public mark-only entry point

Make `marcarManzana` public (currently `private`) so the `completa` handler can mark without toggling. It already
short-circuits if the territory is already selected and never unmarks.

### Step 4 — `MapInteractionService.handleMapClick`: no unmark while marking

- Mode `completa`: if the hit manzana is already marked → `{ action: 'none' }`; if unmarked and territory selected →
  keep `toggle_manzana` (which, from this service, only ever marks here); foreign territory → keep the `territoryLock`
  toast + `none`.
- Mode `parcial`: if the hit manzana is already marked → `{ action: 'none' }` (no toggle); unmarked continues to
  `select_manzana` / `add_partial_point` as today.
- Mode `none`: unchanged (`toggle_manzana` on marked → unmark allowed after exiting marking mode).

### Step 5 — `map-initialization.service.ts` `completa` manzana handler

Replace `toggleManzana(...)` with: only mark when not already marked
(`if (!manzanasById().has(id)) marcarManzana(id, nombreBloque, polygon, color, territorioNumero)`); if already marked,
do nothing (still `L.DomEvent.stop(e)` so the map click doesn't bubble).

### Step 6 — Specs

- `map-interaction.service.spec.ts`: `completa` + marked → `none`; `parcial` + marked → `none`; `none` + marked →
  `toggle_manzana` (regression guard); `completa`/`parcial` foreign territory still toast-locked.
- `map-initialization.service.spec.ts`: `onMoveEnd` restores from cache without calling the DB restore; hides on pan
  when a selection exists (mode `none`); `restoreAllMarks` revalidates all `getTerritoryDataCache` keys and skips
  repaint for non-loaded territories.
- `map-selection.service.spec.ts`: public `marcarManzana` mark-only does not unmark an already-marked manzana and does
  not remove the territory when only one manzana is marked.

## Files touched

- `predicador-frontend/src/app/features/map/services/map-initialization.service.ts`
- `predicador-frontend/src/app/features/map/services/map-interaction.service.ts`
- `predicador-frontend/src/app/features/map/services/map-selection.service.ts`
- `predicador-frontend/src/app/features/map/services/map-initialization.service.spec.ts`
- `predicador-frontend/src/app/features/map/services/map-interaction.service.spec.ts`
- `predicador-frontend/src/app/features/map/services/map-selection.service.spec.ts`

## Verification

- `pnpm test -- src/app/features/map/services/map-interaction.service.spec.ts src/app/features/map/services/map-initialization.service.spec.ts src/app/features/map/services/map-selection.service.spec.ts`
- `pnpm run lint`
- `npx ng build --configuration=production` (or `pnpm run build`)
