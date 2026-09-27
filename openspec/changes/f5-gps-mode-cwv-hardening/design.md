# Design: f5-gps-mode-cwv-hardening

## Context

See proposal.md — Why. Design-relevant current state only:

- **GPS**: `map-location.service.ts` owns a single `navigator.geolocation.watchPosition` used for status display ("Mi ubicación"); it never drives the viewport. `server.ts` already sends `Permissions-Policy: geolocation=(self)`. The map engine is MapLibre GL JS v6 (WebGL2, zoneless Angular, signals), with an established GeoJSON-overlay pattern (`map-edit-overlay.service.ts`) for ephemeral layers.
- **CWV**: `RumService` (uses `web-vitals` ^6.2.1) reports field LCP/INP/CLS/FCP/TTFB to `/api/v1/rum` via `provideAppInitializer` (SSR-safe). `angular.json` has basic budgets (initial 320/600 kB, componentStyle 12/16 kB). `ci-frontend.yml` runs lint → one production build → tests; no lab-vitals gate. `tests/` has load/smoke scripts but no browser-driven vitals harness.
- **Snapshot**: `map-rendering.facade.loadGeoJsonMetadata()` fetches `/api/v1/territories/all/geojson` once and derives `manzanaCounts` (report counts), `bounds` (fitBounds focus), `centroids` (label placement), and raw `features` (marked overlay, partial-draw fid bridge). It is fail-tolerant (metadata `null` → tiles still render). Backend: `TerritoryController` `GET /all/geojson`, gateway route with CB `territoryCB-geojson` (30 s), and a `CacheHeadersFilter` entry. F3/F4 deferred removal to F5; hybrid edit mode already uses on-demand `GET /{numero}/geojson`.

## Goals / Non-Goals

**Goals:**

- One shared, leak-free location watch serving both status display and follow mode.
- Follow mode that never fights the user's viewport or edit mode.
- Replace every snapshot consumer with a strictly smaller data source before the endpoint disappears.
- Deterministic CI gate for budgets plus a lab harness for route CWV.
- Endpoint removal shipped last within the change, with an ordered, revertible path.

**Non-Goals:**

- Background/tracking-outside-the-app GPS (no service worker geolocation, no offline trail sync).
- Persisting breadcrumb trails across sessions.
- A RUM dashboards/alerting overhaul (field pipeline already exists; unchanged).
- Multi-city or multi-tenant tile routing (still YAGNI per F3/F4).

## Decisions

### D1: Single shared watch + dedicated follow service

One `watchPosition` remains owned by `MapLocationService`, extended to expose a position stream and explicit `start()/stop()` ref-counted across consumers (status button + follow mode). A new `MapGpsFollowService` (signals: `state: 'off' | 'active' | 'paused'`, trail array) subscribes to that stream and owns viewport commands.

- **Why**: two watches would double battery/permission cost and could disagree; ref-counting keeps "no orphaned watch" enforceable in one place (spec: watch released on deactivation and route exit).
- **Alternatives**: (a) follow logic folded into `MapLocationService` — rejected: mixes status concern with viewport/presentation logic; (b) a second independent watch — rejected above.
- Rendering uses the existing overlay pattern: `gps-position` GeoJSON source, accuracy rendered as a **computed polygon** (64-segment circle scaled by `coords.accuracy`) rather than a `circle-radius` hack, so it stays metric-accurate across zooms; trail as a capped `LineString` source.
- Viewport: `map.easeTo` on position updates while `active`; `dragstart`/`zoomstart`/`rotatestart`/`pitchstart` transition to `paused` (spec: manual interaction releases lock); a re-center action returns to `active`. Starting partial-draw/edit mode forces `paused` (viewport must belong to the editor).
- Trail hygiene: distance filter (drop points < 5 m from last kept point) + hard cap (2 000 points, drop-oldest) bound memory; `clearTrail` empties the source.
- Watch options while active: `enableHighAccuracy: true`, `timeout: 15 000`, `maximumAge: 3 000` — accuracy matters when walking boundaries; the watch exists while follow mode is engaged (active **or** paused — paused keeps recording the trail) and while the legacy status toggle is on, released on deactivation, fatal error, and route exit — that lifecycle, not per-gesture pausing, is the real battery control.
- SSR/insecure context: platform guards before any `navigator.geolocation` access (existing service pattern), satisfying the SSR scenarios.

### D2: Lightweight `GET /api/v1/territories/metadata` replaces the snapshot

A new territory-service endpoint returns one JSON array with, per territory: `numero`, `nombre`, `color`, `bounds` (bbox), `center` (`ST_PointOnSurface` — never `ST_Centroid`, which can fall outside a concave territory), `manzanaCount`, and `fids` (feature-id list for the fid↔territory bridge). No geometry.

- **Why one endpoint**: the snapshot's four derived datasets (counts, bounds, centers, fid bridge) all come from the same per-territory aggregates; serving them together keeps the frontend to a single request, mirroring the old flow but orders of magnitude smaller.
- **Frontend migration**: facade `loadGeoJsonMetadata()` → `loadTerritoryMetadata()` parsing the DTO (same fail-tolerant contract: `null` metadata → tiles unaffected). Marked-overlay and partial-draw **feature geometry** no longer comes from metadata at all — those territories fetch `GET /{numero}/geojson` on demand, the same pattern hybrid edit mode already uses.
- **Performance**: single SQL with `ST_Envelope`/aggregate per territory (indexed geometry column), plus a small in-memory response cache keyed by `data_version` so F2's write path (which bumps `app_meta.data_version`) invalidates it exactly like it invalidates tiles.
- **Alternatives**: (a) derive metadata client-side from loaded tiles — rejected: tiles are clipped per z/x/y, so label centers, global bounds, and fid completeness are unreliable; (b) extend the existing `/territories/colors` endpoint — rejected unless its DTO already carries counts/centers/fids (checked during implementation; extending a contract other consumers rely on is riskier than an additive endpoint); (c) embed in TileJSON — rejected: TileJSON `vector_layers` cannot carry per-territory arrays cleanly.
- **`fid ↔ id` pairing (decided 2026-09-24, owner-approved Option A)**: the snapshot was the only place where `fid` (`m.id`) and `id` (`"{t}-{b}"`) coexisted on one feature; the DTO's `fids` is membership-only and cannot be zipped positionally with per-territory features (different ordering, null-geometry row skew — see `baseline.md` §D). Resolution: **backend additive** — select `m.id` in `findGeoJsonByTerritorioPadre` and emit `fid` in the per-territory GeoJSON serializer, so on-demand features carry both keys. This preserves the restored-mark overlay match and the partial-draw snap-skip bridge with identical semantics, lets the bridge read the already-loaded `editGeoJson`, and keeps geometry out of the metadata DTO. Rejected alternatives: paired-DTO `[{fid, id}]` (pairing split across two payloads), tile-derived pairing (clipped/unreliable), positional zip (unsound), degraded restored-mark rendering (visible regression + weakened pinned specs).
- **Removal order**: endpoint + frontend migration land first; only then are `TerritoryController GET /all/geojson`, the gateway `territoryCB-geojson` route, its `CacheHeadersFilter` entry, and the controller test removed. With the controller gone, any leftover route just 404s — the spec's gateway requirement is behavior-level (404, no data).

### D3: Two-tier CWV enforcement — deterministic budgets + lab vitals

- **Source of truth**: `territory-frontend/performance-budgets.json` — per-route (`/map`, `/login`) LCP/INP/CLS targets (p75, matching RUM definitions) plus bundle thresholds. Weakening it must show up in review (spec requirement).
- **Gate 1 — bundle (deterministic, blocking)**: tighten the existing `angular.json` budgets against baseline measurements + headroom (initial/per-route lazy chunks). Fails the existing build job; zero new tooling.
- **Gate 2 — lab vitals (blocking, one retry)**: new `tests/cwv/` script driving **Playwright against system Chrome** (`channel: 'chrome'`, no browser download in CI) against the production build with SSR, using the already-present `web-vitals` package to read LCP/CLS/INP; fixed CPU throttle (CDP 4×) and a scripted interaction sequence on `/map` (pan, zoom, toggle) to exercise INP. Budgets from `performance-budgets.json`. Runs as a job in `ci-frontend.yml`.
- **Alternatives**: Lighthouse CI — rejected: no true interaction INP, heavy config, duplicates web-vitals we already ship; RUM-gated PRs — rejected: field data does not exist per-PR; bundle-only — rejected: misses CLS/INP, which are the map page's actual risks; keeping lab checks informational — rejected: spec requires CI failure on violations.
- **Lab reference mode (decided 2026-09-24, user-approved)**: the harness runs **without a backend**. It seeds a dummy UI token in localStorage; `profileGuard`'s `validateSession()` fails open on network errors by design, so `/map` (shell + basemap) loads and stays interactive. This makes measurements deterministic and CI stack-free. Consequence: lab INP reflects the empty-basemap app and underestimates data-driven overlay cost — budgets are calibrated on this same mode (apples-to-apples), and **field RUM remains the source of truth for real-world vitals**. Specs do not mandate full-data lab measurement, so no spec change is needed.
- **Flake control**: fixed throttle + viewport, one retry, budgets set with margin from the baseline (calibration is a task, not a design change).

### D4: Follow mode ↔ edit mode interplay

Follow mode is a *navigation* aid: entering partial-draw/edit pauses it; deactivating edit does not auto-resume (explicit user action). The GPS control is hidden/disabled while editing to keep the control surface honest.

- **Why**: MapLibre has one camera; two commanders (user + GPS + editor) produce jitter and confused undo of pan intent.

## Risks / Trade-offs

- [Snapshot consumer inventory incomplete → broken counts/labels/bridges after removal] → Grep-driven consumer inventory task before removal; facade stays fail-tolerant; regression tests for counts/labels/bridge moved to the new DTO.
- [Metadata cache serving stale data after a write] → Cache keyed by `data_version`, the same token tiles use; F2 write path already bumps it.
- [Lab CWV job flakes in CI] → Deterministic bundle gate still blocks regressions; lab job gets one retry and margin-calibrated budgets; failures print measured vs budget values.
- [GPS battery drain while walking] → Single ref-counted watch alive while follow mode is engaged (active or paused) or the legacy status toggle is on; auto-pause in edit mode; trail distance-filtered; documented watch options.
- [Accuracy polygon misleads (poor GPS in urban canyons)] → Polygon mirrors reported `accuracy`; error states covered by spec instead of faking precision.
- [External consumers of `/all/geojson` unknown to us] → Monorepo frontend is the only known consumer (grep-verified); gateway 404 is the declared BREAKING behavior; note in changelog/ADR.
- [Playwright added as devDependency increases CI install time] → System Chrome only (no browser fetch); job is parallel to the test job.

## Migration Plan

Ordered, independently revertible commits within one release (monorepo ships frontend + backend together):

1. **Baseline**: measure current CWV + bundle numbers; write `performance-budgets.json` and angular.json budget updates (no behavior change).
2. **Backend**: add `GET /api/v1/territories/metadata` (+ tests, `data_version` cache).
3. **Frontend migration**: facade/labels/marks/counts switch to the metadata DTO + on-demand `/numero/geojson`; snapshot fetch removed from `territorio.ts`; tests updated.
4. **CI gates**: bundle budget gate (already live from 1) + lab CWV script + `ci-frontend.yml` job.
5. **GPS mode**: shared-watch refactor + follow service + overlay layers + control UI + tests (independent of 1–4, can be developed in parallel).
6. **Removal**: delete `GET /all/geojson` controller, gateway route, cache-filter entry, and tests; assert 404; update AGENTS.md route table.
7. **Full verification**: `pnpm run lint` → production build → `pnpm test -- --run --coverage`; backend `mvn -pl territory-service test` (+ gateway tests).

**Rollback**: each step is a revert; the breaking removal lands last so a revert restores the endpoint without touching the new metadata path. Field verification of budgets uses the existing RUM stream.

## Open Questions

- Exact bundle/CWV budget numbers — calibrated in step 1 against the baseline (does not change the approach, specs, or task breakdown).
- ~~Whether `/territories/colors` can be extended instead of adding `/territories/metadata`~~ — **RESOLVED (2026-09-24): add the new additive endpoint `GET /api/v1/territories/metadata`; do not extend `/colors`.** Inspected during step 2: `/colors`'s DTO is a bare `Map<Long, String>` (numero → color) returned by `TerritoryService.getAllColors()` — it carries **none** of the required fields (`nombre`, `bounds`, `center`, `manzanaCount`, `fids`), so extending it means changing the response shape from a numero-keyed object to an array, which breaks every existing consumer: frontend `TerritorioService.getColores()` (`Record<number, string>`, consumed by `MapRenderingFacade.fetchAndBuildFeatureLayers` and the admin page), backend `TerritoryColorResolver.colorFor` (`getAllColors().get(numero)` — tile color parity), the gateway route predicate `path("/api/v1/territories/colors")` and its `CacheHeadersFilter` entry. The spec constrains behavior (lightweight, no geometry), not the URL; an additive `/metadata` route satisfies it with zero consumer risk, and `/colors` keeps serving its existing consumers unchanged.
