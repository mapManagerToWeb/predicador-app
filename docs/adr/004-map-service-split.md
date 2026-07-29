# ADR-004: MapRenderingService Decomposition

**Date:** 2026-07-29
**Status:** Accepted
**Deciders:** Staff Engineer

## Context

`MapRenderingService` is 921 lines and handles:
- Map initialization and destruction
- Tile layers and satellite toggle
- Theme observation (MutationObserver)
- Territory GeoJSON loading and caching
- Territory layer add/remove/visibility
- Style computation and requestAnimationFrame batching
- Label management
- Partial polygon drawing and clipping
- Marker management
- Screenshot capture preparation and restoration
- Extra layer tracking

This violates Single Responsibility Principle and makes testing difficult.

## Decision

Split into 8 focused services using a **Facade pattern** for backward compatibility:

### Target Structure

| Service | Responsibility | Est. Lines |
|---|---|---|
| `MapEngineService` | Create/destroy L.Map instance | ~60 |
| `MapTileLayerService` | Tiles, satellite, theme observation | ~100 |
| `MapTerritoryLayerService` | GeoJSON loading, layer management, indices | ~200 |
| `MapStyleService` | Visual styles, rAF batching, pure style functions | ~150 |
| `MapCaptureService` | Screenshot preparation/restoration | ~120 |
| `MapPartialDrawService` | Partial points, markers, clipping | ~180 |
| `MapRenderingFacade` | Coordinates delegation, backward-compat API | ~100 |
| (existing) `MapStateService` | UI/domain state (signals only) | ~83 |

### Migration Strategy

1. Create new services implementing extracted responsibilities
2. Create `MapRenderingFacade` that delegates to new services
3. Update consumers to use facade (MapSelectionService, MapPartialMarkService, MapInitializationService, MapDataPersistenceService)
4. When all consumers migrated, consider renaming facade to MapRenderingService
5. Preserve all public method signatures during migration

### Key Design Rules

- Each service uses `inject()` for DI
- No `any` types — explicit TypeScript strict mode
- `MapStateService` holds only signals/computed — no Leaflet objects
- Leaflet objects (L.Map, L.Layer, L.Polygon, L.Marker) stay in infrastructure services
- Pure functions for style calculations (testable without Leaflet)
- `requestAnimationFrame` batching centralized in MapStyleService
- `Promise.allSettled()` for multi-territory restore operations
- ChangeDetectionStrategy.OnPush maintained throughout

## Consequences

### Positive
- Each service < 250 lines (testable, understandable)
- Pure style functions testable without DOM/Leaflet
- Facade pattern enables incremental migration without breaking changes
- Clear separation: Engine, Tiles, Territories, Styles, Capture, PartialDraw

### Negative
- More files to navigate (mitigated by clear naming)
- Facade adds indirection layer (remove after full migration)
- Need to update imports in 4 consuming services

### Testing Strategy
- Unit tests for each new service
- Integration tests for facade delegation
- Style function tests with mock data (no Leaflet needed)
- Territory layer tests with mock GeoJSON

## Verification
- All existing 75 frontend tests must pass after migration
- Visual equivalence: no change in map behavior
- Bundle size should not increase significantly
