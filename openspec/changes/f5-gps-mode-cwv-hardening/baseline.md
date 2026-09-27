# F5 CWV baseline

Date: 2026-09-24
Change: `f5-gps-mode-cwv-hardening`
Task: 1.1 (measure current baseline; referenced by 1.2)

## Method

- **Build**: production `pnpm run build` (SSR + service worker), run from `territory-frontend/`.
- **Harness**: `tests/cwv/cwv-check.mjs` (`pnpm run cwv:check -- --print`).
  - System Chrome via `channel: 'chrome'` — version **153.0.8010.53**.
  - CDP `Emulation.setCPUThrottlingRate` **4× CPU throttle**, fixed viewport **1366×768** (deviceScaleFactor 1).
  - **No-backend reference mode**: the harness starts the built SSR server itself with `GATEWAY_URL=http://127.0.0.1:9` (dead port) so API calls 502 and `validateSession()` fails open; `territory_role=encargado` is seeded in localStorage so `/map` passes `profileGuard`. The server is always killed afterwards.
  - **web-vitals v6** (UMD from `territory-frontend/node_modules/web-vitals`) injected with `page.addInitScript`, `reportAllChanges: true` — same metric definitions as the RUM pipeline (`/api/v1/rum`), percentile target p75.
  - Scripted interactions: `/login` types the phone number and submits (dead-gateway 502 settles, no redirect); `/map` pans, zooms and toggles after the WebGL canvas and loading overlay are verified. `waitForLcpStable()` runs before interacting so LCP is observed and hydration settles first.

## Bundle sizes (browser, `pnpm run build`)

Initial:

| File | Name | Raw size | Est. transfer |
| --- | --- | ---: | ---: |
| `main-X6ER35BD.js` | main | 325.38 kB | 89.95 kB |
| `styles-IORYG4WN.css` | styles | 103.33 kB | 12.65 kB |
| `chunk-DJVAsKa_.js` | – | 464 bytes | 464 bytes |
| **Initial total** | | **429.17 kB** | **103.06 kB** |

Lazy chunks (route-relevant):

| Name | Raw size | Est. transfer |
| --- | ---: | ---: |
| maplibre-gl | 1.06 MB | 235.11 kB |
| map | 90.79 kB | 19.67 kB |
| admin | 17.62 kB | 4.20 kB |
| profile | 14.85 kB | 3.55 kB |
| login | 13.05 kB | 3.03 kB |
| maplibre-engine-service | 4.59 kB | 1.66 kB |

Build exits 0 but currently warns: `bundle initial exceeded maximum budget. Budget 320.00 kB was not met by 109.17 kB with a total of 429.17 kB.` (the existing `angular.json` warning budget — recalibrated in task 1.3).

## Lab CWV (production build, no-backend reference mode)

Observed range over consecutive harness runs on 2026-09-24 (plus a 15-run `/login` debug loop used to characterize INP variance):

| Route | Metric | Min | Max | Unit |
| --- | --- | ---: | ---: | --- |
| `/login` | LCP | 420 | 1320 | ms |
| `/login` | INP | 56 | 168 | ms |
| `/login` | CLS | 0.000 | 0.000 | – |
| `/map` | LCP | 408 | 1356 | ms |
| `/map` | INP | 8 | 64 | ms |
| `/map` | CLS | 0.002 | 0.002 | – |

Representative harness runs (4 consecutive, today):

| Run | `/login` LCP | `/login` INP | `/login` CLS | `/map` LCP | `/map` INP | `/map` CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 720 ms | 112 ms | 0.000 | 892 ms | 40 ms | 0.002 |
| 2 | 880 ms | 104 ms | 0.000 | 860 ms | 8 ms | 0.002 |
| 3 | 728 ms | 80 ms | 0.000 | 792 ms | 8 ms | 0.002 |
| 4 | 800 ms | 80 ms | 0.000 | 724 ms | 8 ms | 0.002 |

### Variance note (`/login` INP)

An early harness run recorded `/login` INP of 360 ms (above the 200 ms Good threshold). Root-caused: interacting before the first LCP entry finalized let the click land during the hydration burst (web-vitals also disconnects its observer on first input, so LCP went unreported). The harness now waits for `waitForLcpStable()` + 700 ms before interacting; across 15 subsequent runs `/login` INP stayed within 56–168 ms. The 360 ms value is therefore a measurement artifact of the pre-fix harness, not a property of the page — it is not used for budget calibration.

All metrics are well inside the "Good" thresholds (LCP ≤ 2500 ms, INP ≤ 200 ms, CLS ≤ 0.1).

## Calibration rule (used by 1.2)

Budget = `min(Good, baseline_max × 1.25)`, floored at **half of Good** (never tighter than Good/2 so ordinary lab variance does not flap; never weaker than Good per the spec). Bundle thresholds get ~10–15% headroom over measured sizes.

---

## Snapshot consumer inventory (task 3.1)

Date: 2026-09-24. Verification: every grep hit for `all/geojson` (14) and for
`getAllGeoJson|loadAllTerritories` (20) in `territory-frontend/src` is accounted
for below, plus every functional consumer of the metadata the snapshot derived.

### A. Grep hits for `all/geojson` (14 of 14)

| # | Location | Kind | Replacement |
|---|----------|------|-------------|
| 1 | `core/services/territorio.ts:51` — `getAllGeoJson()` URL literal | code (the fetch) | **Remove** (3.3b). Consumers move to `GET /api/v1/territories/metadata` (facade) and on-demand `GET /{numero}/geojson` (kept `getGeoJsonByTerritorio`) |
| 2–3 | `map-marked-overlay.service.ts:27, 64` | doc comments | Re-word: features now come from on-demand `/numero/geojson` |
| 4–8 | `map-rendering.facade.ts:45, 181, 250, 392, 459` | doc comments (`TerritorioMetadata`, `metadata` field, `loadGeoJsonMetadata`, `setSelectedManzana`, `refreshOverlayMarks`) | Re-word: metadata DTO; geometry from on-demand fetch |
| 9 | `map-label-layer.service.ts:19` | doc comment | Re-word: label position = DTO `center` |
| 10 | `map-report.service.ts:185` | code comment | Re-word: count = DTO `manzanaCount` |
| 11–12 | `map-partial-mark.service.spec.ts:392, 395` | spec name + comment | **BLOCKED** — see gap (D) |
| 13 | `map-partial-mark.service.ts:192` | doc comment (`markedTerritorioIds`) | **BLOCKED** — see gap (D) |
| 14 | `map-partial-mark.service.ts:205` | code comment (fid → "{t}-{b}" bridge) | **BLOCKED** — see gap (D) |

### B. Grep hits for `getAllGeoJson|loadAllTerritories` (20 of 20)

| Location | Kind | Replacement |
|----------|------|-------------|
| `territorio.ts:49` | the `getAllGeoJson` method | Remove (3.3b); `getGeoJsonByTerritorio` (L55) stays |
| `map-rendering.facade.ts:223` | `loadAllTerritories(_territorioService: { getAllGeoJson … })` no-op taking a snapshot-shaped param | Drop the param (vestige; MapLibre loads via tiles) |
| `map-rendering.facade.ts:258` | `getAllGeoJson()` call inside `loadGeoJsonMetadata` | Replaced by metadata-DTO fetch (3.2) |
| `map-rendering.facade.spec.ts:199, 207` | mocks of `getAllGeoJson` | Re-point to mocked `/metadata` response (3.2) |
| `map-initialization.service.ts:23, 26, 77, 239, 241, 248, 249` | `loadAllTerritories` / `reloadAllTerritories` orchestration helpers (not snapshot consumers; they await the facade no-op and `loadGeoJsonMetadata`) | Keep; only the `loadGeoJsonMetadata` call (L36) is re-pointed to `loadTerritoryMetadata` (3.2) |
| `map.ts:116, 442` + `map.spec.ts:86, 106, 277, 284` + `map-initialization.service.spec.ts:110, 111` | callers/mocks of the reload helpers | Unchanged (helper names contain `AllTerritories`, not the snapshot) |
| `map-initialization.service.spec.ts:18, 41, 98` | asserts `loadGeoJsonMetadata` called | Re-point assertion to `loadTerritoryMetadata` (3.2) |

### C. Functional consumers of snapshot-derived data → replacement

| # | Consumer (file:line) | Snapshot data used | Replacement | Status |
|---|----------------------|--------------------|-------------|--------|
| 1 | `MapRenderingFacade.loadGeoJsonMetadata` (facade:256) ← `map-initialization.service.ts:36` (`Promise.all` with `fetchAndBuildFeatureLayers`) | whole snapshot → `buildTerritorioMetadata` | `loadTerritoryMetadata`: fetch `GET /metadata`, parse DTO array into maps; fail-tolerant `null` on error (tiles unaffected) | **Migratable (3.2)** |
| 2 | Counts: `getManzanaCountByTerritorio` → `map-report.service.ts:186` (avance), `map-selection.service.ts:94, 194` (progress totals), `map-data-persistence.service.ts:139` (capture caption), plus `map-mark-restoration.service.spec.ts`, `map-report.service.spec.ts`, `map-selection.service.spec.ts`, `map-capture.service.ts:27` mocks | `manzanaCounts` | DTO `manzanaCount` per territorio | **Migratable** |
| 3 | Completion opacity: `getCompletedTerritorios` (facade:335) — `manzanaCounts` vs marks | `manzanaCounts` | DTO `manzanaCount` | **Migratable** |
| 4 | Bounds: `getBoundsByTerritorio` → `fitBoundsToTerritorios` (facade:299) ← `map-selection.service.ts:174` | per-territory bbox union | DTO `bounds` | **Migratable** |
| 5 | Labels: `getCentroidByTerritorio` → `map-label-layer.service.ts:89`; territory list fallback `getTerritoriosConMetadata` → `map-label-layer.service.ts:82` | bounds-center centroids; snapshot keys | DTO `center` (ST_PointOnSurface — intended data-source change per 3.3); DTO `numero` list | **Migratable** |
| 6 | Marked overlay: `refreshOverlayMarks` (facade:467→498) and selected-manzana highlight `renderSelectedManzana` (facade:428→442) via `getGeoJsonFeaturesByTerritorio` + `matchMarkedFeature` | snapshot features (carry **both** `fid` and `id`) | geometry: on-demand `GET /{numero}/geojson` with a small per-territory cache (async re-render) | **BLOCKED for fid-keyed marks — gap (D)** |
| 7 | Partial-draw snap bridge: `markedTerritorioIds` (map-partial-mark.service.ts:201–221) | snapshot `fid → id` pairing | DTO `fids` (per task/spec: fid bridge from the DTO) | **BLOCKED — gap (D)** |
| 8 | Partial-draw geometry: `iniciarDibujo` (map-partial-mark.service.ts:246) | already on-demand `getGeoJsonByTerritorio` | none — keep as is | OK (already migrated; `findTargetManzana` matches by tile-derived `nombreBloque`) |
| 9 | `territorio.ts` snapshot fetch (L49–53) | the fetch itself | remove; keep `getGeoJsonByTerritorio` (L55) | **Migratable (3.3b)** |

### D. Gap: the `fid ↔ id` pairing exists ONLY in the snapshot (blocks 2 of 9 consumers)

**Why DTO + on-demand GeoJSON cannot reproduce the pairing:**

- Snapshot features (`TerritoryRepository.findAllGeoJsonAsFeatureCollection`,
  L51–55) are the only source where `fid` (`m.id`) and `id`
  (`territorio_padre || '-' || nombre_bloque`) coexist on the same feature.
- DTO `fids` (`json_agg(m.id ORDER BY m.id)`, repository L131) is **membership
  per territory only** — no pairing to `id`/`nombre_bloque`.
- On-demand `/{numero}/geojson` features (`HibernateSpatialTerritoryGeoJsonSerializer.buildFeature`,
  L76–79) carry `id`, `nombre_bloque`, `territorio_padre`, `color` — **no
  `fid`**; the query (`findGeoJsonByTerritorioPadre`, L37–42) does not even
  select `m.id`.
- Positional reconstruction (zip `fids[i]` with `features[i]`) is **unsound**:
  different orderings (`ORDER BY m.id` vs `ORDER BY m.nombre_bloque`) and
  different row sets (metadata `COUNT(*)` includes null-geometry rows; the
  Java serializer skips them).
- MVT tiles do carry `fid` + `bloque` (`TileService`, L271–275) — the pairing
  exists there — but tiles are clipped per z/x/y, so they are not a complete
  or reliable source for arbitrary (off-screen / low-zoom) territories; using
  them as a bridge would not be a clean DTO migration.

**Production behaviors that would regress (why this blocks task 3.3):**

1. **Restored marks stop painting.** Marks restored from a report are
   `{ id: <fid>, nombreBloque: '' }` (`map-mark-restoration.service.ts`
   L107/L110; report `manzanasIds` = saved `mark.id` = MVT fid —
   `map-report.service.ts:47`, `map.ts extractManzanaId:313–316`).
   `matchMarkedFeature`'s fid clause (`map-marked-overlay.service.ts:45`) is
   their ONLY match path. Click-created marks can fall back to clause 5
   (`nombreBloque` from the tile `bloque` property — same
   `manzanas_territorio.nombre_bloque` column as the per-territory GeoJSON);
   restored marks cannot → they silently vanish from the marked overlay.
2. **Snap-skip of marked manzanas breaks.** `markedTerritorioIds` converts
   fid-keyed marks to `"{t}-{b}"` keys so `snapToNearestManzana` excludes
   already-marked manzanas (partial zone must not overlap an existing mark).
   Without the pairing, restored (and click) fid-marks never match the
   `editGeoJson` feature keys → marked manzanas become snap candidates again.
3. **Existing specs pin these semantics** and cannot be re-pointed without
   weakening assertions (forbidden by the task):
   `map-marked-overlay.service.spec.ts:44–46` ("matches a numeric MVT fid mark
   against the fid property") and `map-partial-mark.service.spec.ts:392–423`
   ("excludes fid-keyed marks by bridging them through the facade's
   `/all/geojson` metadata").

**Resolution options (owner decision required before 3.3):**

- **(A) Recommended — backend additive:** select `m.id` in
  `findGeoJsonByTerritorioPadre` and emit `fid` in
  `HibernateSpatialTerritoryGeoJsonSerializer.buildFeature`. On-demand features
  then carry both keys → clause 1 and the bridge work exactly as today (the
  bridge can even read the already-loaded `editGeoJson`). Touches
  territory-service (task 2 declared "done"), so needs explicit approval.
- (B) Backend additive DTO: change `fids` from `List<Long>` to paired
  `[{fid, id}]` (or add a fid→id map). Keeps geometry out of the DTO; same
  approval caveat as (A).
- (C) Frontend-only workaround (tile-derived pairing or positional zip):
  rejected — unreliable / unsound; would weaken the "identical semantics"
  requirement.
- (D) Accept degraded restored-mark rendering: rejected — a visible core
  regression (previous session's marks disappearing) and it forces weakening
  two pinned specs.

Consumers 1–5 and 8–9 of table C are unaffected by this gap and can proceed
once the owner picks (A) or (B) for consumers 6–7.
