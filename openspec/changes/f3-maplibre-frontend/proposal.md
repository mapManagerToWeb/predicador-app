## Why

The current map renders through Leaflet 1.9 (one DOM path layer per manzana, DivIcon labels, per-feature `setStyle`) which keeps all geometry processing on the main thread. With F1+F2 delivering MVT/PBF tiles from the backend, the frontend must migrate to a GPU-rendered engine to realize the performance gains: 60 FPS pan/zoom, < 50 ms long tasks, and > 70% reduction in initial data load. MapLibre GL JS v6 (WebGL2, ESM-only) is the chosen engine per ADR-0006.

## What Changes

- **Replace Leaflet with MapLibre GL JS v6** as the primary map engine, consuming the `/tiles/{z}/{x}/{y}.pbf` endpoint with data-driven paint expressions.
- **Add feature flag `mapEngine: 'leaflet' | 'maplibre'`** for gradual rollout and instant rollback.
- **GPU picking** via `queryRenderedFeatures` replaces `ManzanaSpatialIndex` (O(1) grid) — the grid and sessionStorage geometry caches are removed.
- **Data-driven styling**: `fill-color` from tile `color` property; per-territory `fill-opacity` expression rebuilt reactively on selection.
- **Hybrid edit mode**: tiles for render/picking; on-demand per-territory GeoJSON (existing endpoint) only during partial-draw/snap — `map-geometry.ts` and `polygon-clipping` survive unchanged.
- **Label layer**: replace DivIcon with MapLibre symbol layer (GPU-rendered, collision-aware).
- **Version-aware refresh**: `?v=` parameter on tile URLs triggers re-fetch when `data_version` bumps.
- **Layering debt cleanup**: move `TERRITORY_COLORS` to `core/models/`, move `map-draft.ts` into the map feature.
- **BREAKING**: WebGL2 becomes mandatory; devices without WebGL2 see a graceful error UX with a link to contact support.

## Capabilities

### New Capabilities
- `map/maplibre-engine` — MapLibre GL JS initialization, style, data-driven paint, GPU picking, label layer, version-aware refresh.
- `map/hybrid-edit-mode` — tile rendering with on-demand GeoJSON for partial-draw/snap, `map-geometry.ts` and `polygon-clipping` integration.

### Modified Capabilities
- `map/territory-layer` — removal of Leaflet per-feature layers, `setStyle`, DivIcon labels, `ManzanaSpatialIndex`, sessionStorage caches.
- `map/engine-selection` — new feature flag `mapEngine` with device capability check (WebGL2).

## Non-Goals
- Deck.gl integration (rejected per ADR-0006).
- Removing `/all/geojson` endpoint (deferred to F5).
- Multi-tenant tile routing (YAGNI per SPEC §11).
