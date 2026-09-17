# Tasks: Leaflet Removal (F4)

## Phase F4.1: Interface Extension + Leaflet Type Removal
- [ ] **T1**: Extend `MapEngine` interface — add `addGeoJsonSource(id, data)`, `updateGeoJsonSourceData(id, data)`, `project(lngLat)`.
- [ ] **T2**: Implement new methods in `MaplibreEngineService`.
- [ ] **T3**: Remove `new LeafletPolygon([])` placeholders from `MapPage` — update selection service contract.
- [ ] **T4**: Remove `(engine as any).map` casts in `MapEditOverlayService` and `MapLibreProjectionAdapter`.
- [ ] **T5**: Unit tests for new interface methods.

## Phase F4.2: Delete Deprecated Services
- [ ] **T6**: Delete `map-territory-layer.service.ts` + spec.
- [ ] **T7**: Delete `manzana-spatial-index.ts`.
- [ ] **T8**: Delete `map-engine.service.ts` (Leaflet engine) + spec.
- [ ] **T9**: Delete `map-engine.factory.ts` + spec.
- [ ] **T10**: Delete `map-layer-registry.service.ts` + spec (if Leaflet-only).
- [ ] **T11**: Remove all imports of deleted services from consumers.

## Phase F4.3: Dependency Cleanup
- [ ] **T12**: Remove `leaflet` from `package.json`.
- [ ] **T13**: Remove `@turf/simplify`, `@turf/union`, `@turf/helpers` from `package.json`.
- [ ] **T14**: Remove `pnpm install` and verify build.
- [ ] **T15**: Remove Leaflet CSS from `angular.json` styles array.

## Phase F4.4: Re-export Shim Removal
- [ ] **T16**: Delete `core/services/map-draft.ts` re-export — update all consumers to import from `features/map/services/map-draft.ts`.
- [ ] **T17**: Delete `features/map/utils/territory-colors.ts` re-export — update all consumers to import from `core/models/territory-colors.ts`.
- [ ] **T18**: Verify no remaining imports from deleted shim paths.

## Phase F4.5: Verification
- [ ] **T19**: `pnpm run build` → BUILD SUCCESS.
- [ ] **T20**: `pnpm test -- --run` → 0 failures.
- [ ] **T21**: `pnpm run lint` → 0 errors.
- [ ] **T22**: Verify bundle size decreased (compare before/after).
- [ ] **T23**: Update `AGENTS.md` — remove Leaflet references, document sole engine.

## Dependencies
- F3 complete (MapLibre engine, GPU picking, hybrid edit, labels, version refresh) ✅
- All 614 tests passing ✅
