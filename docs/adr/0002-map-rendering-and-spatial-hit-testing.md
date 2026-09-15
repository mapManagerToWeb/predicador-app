# ADR 0002: Standard canvas rendering and spatial hit-testing for the map

## Status

Accepted

## Context

The map repainted every polygon on every pan frame (a custom `ContinuousCanvas`
hack over Leaflet 2.0-alpha), and hit-testing a tap scanned every manzana
linearly (O(V)) per tap. Both degraded interaction on mobile.

## Decision

Three coordinated changes (commit `3a0f0ba`):

- **(a) Rendering:** Leaflet 1.9's standard `Canvas` renderer with
  `padding: 0.3` (`map-engine.service.ts:26`). Pan moves the canvas with a GPU
  transform and paths repaint only on `moveend` — no per-frame redraw.
- **(b) Geometry:** `@turf/simplify` with `tolerance: 0.0001` and
  `highQuality: true` plus `@turf/union` dissolve per territory
  (`map-territory-layer.service.ts:26,38-41,50-71`), cached in `sessionStorage`
  under `territory.territories.processed.v1` (`map-territory-layer.service.ts:98`).
- **(c) Hit-testing:** a `ManzanaSpatialIndex` uniform grid with cell size
  0.002° ≈ 200 m (`manzana-spatial-index.ts:15,20`): `queryAt` is O(1) on
  average (`:64-70`) and `queryNear` scans a 3×3 cell window (`:77+`). The
  interaction layer consumes the index through the rendering facade
  (`map-rendering.facade.ts:97-103`).

### Rationale: grid instead of R-tree/quadtree

No new dependencies (the project prefers to avoid them,
`SPEC-map-hit-testing.md:13`); urban manzanas (~100 m) fit in 1-4 cells; the
`ManzanaIndex.bbox` is already pre-computed, so insertion is cheap.

### Rationale: sessionStorage instead of a Web Worker

Persisting the processed result removes the recompute on every navigation
within a session without the complexity of bundling turf in a worker plus the
~412 KB GeoJSON serialization round-trip (`SPEC-map-geometry-pipeline.md:9`).

## Consequences

- O(1)-average tap hit-testing and faster session reloads.
- `simplify`+`union` still runs on the main thread once per session — this
  remains the main known performance debt if the first load of a session is
  ever measured as a problem.