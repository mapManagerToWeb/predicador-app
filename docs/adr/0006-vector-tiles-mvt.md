# ADR 0006: Vector tiles (MVT/PBF) with S2 indexing and MapLibre GL rendering

## Status

Accepted (approved 2026-09-16; implementation in progress, phase F1).

## Context

The map data path transfers a monolithic GeoJSON dump
(`GET /api/v1/territories/all/geojson`, ~412 KB raw snapshot cached client-side)
that the frontend parses, simplifies and dissolves with turf **on the main
thread**, then renders through Leaflet 1.9 (one path layer per manzana, DOM
DivIcon labels, per-feature `setStyle`). This limits the map to the data size of
a single city and keeps CPU/DOM work on the UI thread; it does not scale to
thousands of cities and cannot reach 60 FPS on mid-range devices.

Constraints: keep the Spring Boot / Angular stack, prioritize open standards
(MVT, PBF), delegate rendering fully to GPU (WebGL2), and reduce initial data
load by >70%.

## Decision

Four coordinated changes, specified in detail in `SPEC-map-vector-tiles.md`
(phase gates F0–F5):

- **(a) Server-side vector tiles.** territory-service exposes
  `GET /api/v1/territories/tiles/{z}/{x}/{y}.pbf` (MVT 2.1, extent 4096,
  buffer 64, scheme xyz) encoded in Java with
  `io.github.sebasbaumh:mapbox-vector-tile-java:25.1.0` (maintained fork of the
  discontinued wdtinc library; Apache-2.0; JTS). Responses are gzipped, carry a
  strong ETag (`tile-{z}-{x}-{y}-v{data_version}`) with 304 handling, and are
  cached in a `data_version`-keyed Caffeine cache. PostGIS `ST_AsMVT` remains a
  documented fallback (the candidate SQL is parameterized; DB-side encoding is
  viable if tile CPU moves to read replicas). A sidecar (Martin/Planetiler) was
  rejected to keep the stack.
- **(b) Hybrid spatial filtering with Google S2.** A per-manzana bbox cover at
  fixed S2 level 14 is stored in `manzana_s2_cover(s2_cell_id BIGINT)` with a
  **btree** index. At fixed level, S2 cells partition the sphere, so a tile-rect
  cover is exactly the set of cells intersecting the rect, which makes the
  btree candidate lookup **false-negative-free**:
  `feature ∩ tile ≠ ∅ ⇒ cover(bbox) ∩ cover(rect) ≠ ∅`.
  `ST_Intersects` remains only as a precise filter over the small candidate set.
  For z ≤ 11 (huge tiles) the query uses the dissolved `territorio_disuelto`
  layer through the existing GiST; GiST stays as a backstop.
- **(c) Data versioning.** `app_meta.data_version` is bumped transactionally on
  every mutation; tile cache keys and ETags embed the version, so stale tiles
  are never served with a fresh ETag and multi-instance consistency needs no
  destructive invalidation.
- **(d) Frontend GPU rendering.** Replace Leaflet with **MapLibre GL JS v6**
  (ESM-only, WebGL2 required) consuming the tile endpoint with data-driven paint
  expressions (`fill-color` from the tile `color` property; per-territory
  `fill-opacity` expression rebuilt reactively) and GPU picking
  (`queryRenderedFeatures`). Editing keeps a hybrid mode: tiles for rendering,
  on-demand per-territory GeoJSON (existing endpoint) for partial-draw/snap, so
  `map-geometry.ts` and `polygon-clipping` logic survive unchanged.
- **(e) Property whitelist.** Tiles carry only `fid`, `territorio`, `bloque`,
  `color` (+ `tid`, `nombre`, `total` on the dissolved layer). No encargado
  names or other PII. The `color` property becomes the single source of truth,
  fixing the latent palette desync (19 backend vs 30 frontend colors).

## Consequences (expected)

- Initial-viewport payload target ≤ 30% of the `/all/geojson` bytes; GPU-only
  render path; removal of `manzana-spatial-index.ts`, sessionStorage geometry
  caches, per-feature `setStyle`, and DivIcon labels (phases F3–F5).
- WebGL2 becomes mandatory (MapLibre v6): device-support check with graceful
  error UX and a Leaflet fallback flag during the transition.
- New Flyway migration V3 (territory) plus an idempotent S2 backfill job.
- Known layering debt gets resolved opportunistically: `TERRITORY_COLORS` moves
  to `core/models/`, `map-draft.ts` moves into the map feature.
- `/all/geojson` is retired in phase F5 after a full QA gate on the new engine.

## Implementation notes (F1 review pass, 2026-09-16)

Recorded so the review findings survive context loss:

- **Split caps.** `S2CoverService` enforces two independent caps:
  `MAX_TILE_CELLS = 256` for tile rects (excess → silent GiST fallback,
  which is a normal path) and `MAX_FEATURE_CELLS = 4096` for feature bboxes
  in the backfill (excess → cover empty, Micrometer counter
  `territory.tile.s2.feature-cover-overflow` + `logger.warn`, and the manzana
  is counted as **skipped** — never as processed — in `insertCovers`). The
  backfill `processed` counter reflects only manzanas actually given covers.
  Caps are enforced **before** touching `S2RegionCoverer`: with
  `minLevel == maxLevel` the coverer expands fully-contained cells to the
  fixed level without bound (its javadoc: "an arbitrary number of cells may
  be returned if minLevel is too high"), so a world-scale rect would OOM
  inside `getCovering` before any post-count guard. `coverOfRect` estimates
  the leaf count from the rect area
  (`area / avgCellArea(level) × 1.5` upper bound) and returns empty when the
  estimate exceeds the cap; the exact post-count guard remains the final
  arbiter for rects near the cap (verified: world tile → GiST fallback
  without OOM).
- **Antimeridian.** `coverOfBBox`/`coverOfTile(z,x,y,Envelope)` normalize
  longitudes to [-180, 180] and, when the rect crosses ±180 (min > 0 && max
  < 0, or span > 180°), split it into `[minLon, 180] ∪ [-180, maxLon]`,
  covering each piece with the explicit `S2LatLngRect(lo, hi)` constructor
  (never `fromPointPair`, which would pick the short interval) and merging
  with dedupe. `normalizeLon` uses `lon % 360` with ±180 adjustments (no
  `floorMod`), preserving exact ±180 endpoints.
- **Query envelope.** `TileService` queries with the tile envelope expanded by
  the buffer: `bufferMeters = tileWidthMeters * buffer / extent`. The same
  expanded rect (converted with `WebMercator.metersToLonLat`) feeds the S2
  cover, all three SQL `ST_MakeEnvelope` filters (S2, GiST, dissolved), and
  the encoder clip. Tiles at the dateline get their expanded envelope split
  by the antimeridian logic (S2 side) while the SQL side uses the raw
  expanded box — a ≤40 m sliver along ±180 in the fine filter is an accepted
  micro-edge (no data there for this app).
- **CI flag.** `ci-backend.yml` now runs `mvn verify -Pcoverage -B
  -Ddocker.available=true`; both PostGIS integration tests set
  `app.session.secret` (≥32 bytes, strict mode) via `@DynamicPropertySource`
  and `app.tiles.*` defaults were added to the service `application.yml`
  (standalone boot without config-server) and the test `application.yml`
  (valid `TileProperties` binding when the test classpath shadows the main
  file).
- **jts-core 1.20.0.** Pinned explicitly in `territory-service/pom.xml`
  (hibernate-spatial pulls 1.19.0; the MVT encoder needs 1.20.0 at the same
  depth). Verified via `dependency:tree -Dincludes=org.locationtech.jts`.
- **304 ETag.** The TileController 304 response echoes the strong ETag
  (RFC 9110 §15.4.5) so intermediaries/clients keep the validator.
- **z14 tile coordinates.** The tile containing (-70.65, -33.45) at z14 is
  `(4976, 9809)` — verified numerically (meridian spans [-33.4681, -33.4498]
  ⊇ -33.45); tests and ETags were corrected from `9821` accordingly (a
  review draft cited `9808`, which does not contain -33.45).

## Implementation notes (F2 review pass, 2026-09-16)

- **Write-path via Spring `@EventListener(phase=AFTER_COMMIT) + @Async`:**
  `DataChangedEvent` published inside the `@Transactional` of
  `TerritoryService.assignColor`; `TileWriteService` bumps `data_version`
  (`UPDATE SET v = v + 1` — idempotent, creates row if missing via
  `ON CONFLICT`) and optionally refreshes S2 covers and dissolved layer
  (conditional on event flags). Tiles in the versioned Caffeine cache become
  orphaned by key — no destructive invalidation needed. Thread pool
  `tilesWritePool` (configurable via `app.tiles.write-listener-pool-size`,
  default 2) isolates write-path work from request threads.
- **Resiliencia:** try/catch global en el listener — nunca relanza
  excepciones. Un bump fallido se registra con `logger.warn` + counter
  Micrometer `territory.tile.version.bump-failures`; el siguiente write lo
  reintenta. Counter `territory.tile.version.bumps` en cada éxito.

## References

- `SPEC-map-vector-tiles.md` (full specification: API contract, Mermaid
  diagrams, Java/Angular pseudocode, phase gates, success criteria).
- PostGIS docs: `ST_AsMVT`/`ST_AsMVTGeom`/`ST_TileEnvelope`.
- MapLibre GL JS v6 (2026-09-16): ESM-only, WebGL2 mandatory.