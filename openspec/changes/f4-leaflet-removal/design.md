# Design: Leaflet Removal (F4)

## Architecture

### Before (F3)
```
MapPage → EngineFactory(mapEngine flag)
  ├── Leaflet Engine (map-engine.service.ts) + spatial index + turf
  └── MapLibre Engine (maplibre-engine.service.ts) + tile layers + GPU picking
```

### After (F4)
```
MapPage → MaplibreEngineService (sole engine)
  ├── Tile source (MapVectorTileService)
  ├── GPU picking (MapPickingService)
  ├── Labels (MapLabelLayerService)
  ├── Edit overlay (MapEditOverlayService)
  ├── Version refresh (TileVersionService)
  └── Concurrent edit guard (MapConcurrentEditGuardService)
```

### Key Changes

1. **MapEngine interface extended** — add `addGeoJsonSource(id, data)`, `updateGeoJsonSourceData(id, data)`, `project(lngLat) → {x, y}`. These replace the `(engine as any).map` casts.

2. **MapPage simplified** — no engine branching, no factory, no LeafletPolygon placeholders. Selection service gets a new `selectManzana` overload that accepts feature properties instead of a Leaflet Polygon.

3. **MaplibreEngineService** becomes the sole `MapEngine` implementation. Remove `@Injectable({ providedIn: 'root' })` from `MapEngineService` (Leaflet).

4. **Deleted files**: `map-engine.service.ts`, `map-engine.factory.ts`, `manzana-spatial-index.ts`, `map-territory-layer.service.ts`, `map-territory-layer.spec.ts`, `map-engine.factory.spec.ts`, `map-layer-registry.service.ts` (if Leaflet-only).

5. **Re-export shims removed**: `core/services/map-draft.ts` re-export deleted; all consumers now import from `features/map/services/map-draft.ts`. `features/map/utils/territory-colors.ts` re-export deleted; all consumers import from `core/models/territory-colors.ts`.

### Testing Strategy
- Remove Leaflet-related tests (spatial index, territory layer, engine factory).
- Verify all remaining tests pass (target: 500+ tests).
- Build must succeed (SSR + PWA).
- Bundle size should decrease (Leaflet + turf removed).
