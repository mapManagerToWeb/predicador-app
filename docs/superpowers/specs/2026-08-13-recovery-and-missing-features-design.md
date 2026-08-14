# Recovery + Missing Features Design

> **Date:** 2026-08-13
> **Scope:** Recover accidentally-overwritten work from git HEAD, re-implement the two features that were never committed (`html-to-image` migration and marking-mode territory lock), and verify the full frontend.

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

Restore the committed feature set to the working tree, then implement the two missing pieces with quality guards (clean code, tests, lint/build green).

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

### Step 4 — Verification

Run in CI order from `predicador-frontend/`:

1. `pnpm run lint`
2. `npx ng build --configuration=production`
3. `pnpm test -- --run --coverage`

Fix anything that fails. Commit in repo style (lowercase Conventional Commits).

## Out of scope

- `pending-reports-queue.ts`: stays unwired (iteration 2 per plan).
- `whatsapp-simulation/`: already present as untracked files, not modified.
- Backend changes: none required; `/versions`, `findVersions`, optimized queries already committed.

## Success criteria

- Working tree equals HEAD for the previously-overwritten committed features.
- `html-to-image` replaces `html2canvas`, specs updated and green.
- Territory cannot be selected/deselected while marking mode is active; toast informs the user; mode `none` behavior unchanged.
- `lint`, production build, and full test suite all green.