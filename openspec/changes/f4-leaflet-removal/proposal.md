## Why

F3 introduced MapLibre GL JS v6 as an experimental engine behind a feature flag. The dual-engine approach was necessary for safe rollout and rollback. Now that MapLibre is stable (614 tests pass, GPU picking verified, hybrid edit mode working), the Leaflet engine and its associated deprecated services are dead weight. Removing them eliminates bundle bloat (Leaflet + @turf/* + DivIcon DOM), reduces maintenance surface, and resolves the abstraction leaks where MapLibre code still references Leaflet types.

## What Changes

- **Remove feature flag** `mapEngine` — MapLibre becomes the sole engine.
- **Remove Leaflet dependency** from `package.json` (`leaflet: "1.9.4"`).
- **Remove @turf dependencies** (`@turf/simplify`, `@turf/union`, `@turf/helpers`) — dissolve is server-side in MVT tiles.
- **Delete deprecated services**: `MapTerritoryLayerService`, `ManzanaSpatialIndex`, `map-engine.service.ts` (Leaflet engine), `map-engine.factory.ts` (flag routing).
- **Extend `MapEngine` interface**: add `addGeoJsonSource`, `updateGeoJsonSourceData`, `project` — eliminate `(engine as any).map` abstraction leaks.
- **Remove Leaflet type leakage**: replace `new LeafletPolygon([])` placeholders in `MapPage` with a MapLibre-compatible selection contract.
- **Clean up re-export shims**: `core/services/map-draft.ts` and `features/map/utils/territory-colors.ts` re-exports can be removed if all consumers import from canonical locations.

## Capabilities

### Modified Capabilities
- `map/maplibre-engine` — becomes the sole engine (no flag, no factory, no Leaflet fallback).
- `map/hybrid-edit-mode` — remove `(engine as any).map` casts; use extended `MapEngine` interface.

### Removed Capabilities
- `map/engine-selection` — feature flag removed.
- Leaflet-based territory rendering, spatial index, DivIcon labels.

## Non-Goals
- Removing the `/all/geojson` backend endpoint (deferred to F5).
- Multi-city tile routing (YAGNI).
- New MapLibre features beyond fixing abstraction leaks.
