## 1. Setup

- [x] 1.1 Install `@turf/simplify` and `@turf/union` dependencies and verify installation succeeds
- [x] 1.2 Add type declarations for turf modules if needed

## 2. Geometry Simplification

- [x] 2.1 Create `simplifyGeoJSON` utility function in `map-territory-layer.service.ts` using `@turf/simplify` with tolerance 0.0001
- [x] 2.2 Apply simplification in `addTerritoryLayer` before adding GeoJSON to map
- [x] 2.3 Verify simplified geometry maintains visual shape within 2px at zoom 15

## 3. Mark Renderer Isolation

- [x] 3.1 Create dedicated `L.canvas()` instance as `markRenderer` in `map-engine.service.ts`
- [x] 3.2 Export `markRenderer` from `MapEngineService`
- [x] 3.3 Update `MapSelectionService` to pass `markRenderer` when creating layers for marked/selected manzanas
- [x] 3.4 Verify marking a manzana only redraws that specific layer

## 4. Level of Detail by Zoom

- [x] 4.1 Create `dissolveTerritory` utility using `@turf/union` to merge manzanas per territory
- [x] 4.2 Pre-compute dissolved polygons in `buildTerritorioCache` and store in `TerritorioCacheData`
- [x] 4.3 Add zoom threshold check in `updateVisibleTerritories` to show dissolved vs individual polygons
- [x] 4.4 Verify low zoom shows ~20 dissolved shapes, high zoom shows individual manzanas

## 5. Disable Animations

- [x] 5.1 Add animation options to `L.map()` in `map-engine.service.ts`: `zoomAnimation: false`, `markerZoomAnimation: false`, `inertia: false`, `fadeAnimation: false`
- [x] 5.2 Verify pinch-zoom has no transformation frames on low-end device

## 6. Reduce Visual Weight

- [x] 6.1 Update `STYLE_DEFAULTS.polygon.weight` from 4 to 2 in `map-constants.ts`
- [x] 6.2 Update `getBaseTerritoryStyle` fillOpacity from 0.85 to 0.6 for completed territories in `map-style.service.ts`
- [x] 6.3 Verify selected/marked manzanas still use weight 4 and original fillOpacity

## 7. Verification

- [x] 7.1 Run `pnpm run lint` and verify no errors
- [x] 7.2 Run `npx ng build --configuration=production` and verify build succeeds
- [x] 7.3 Run `pnpm test -- --run` and verify all tests pass
- [x] 7.4 Manual test: verify map renders correctly at zoom 12 (dissolved), zoom 15 (individual), and zoom 17 (detailed)
- [x] 7.5 Manual test: verify marking manzanas isolates redraw to marked layer only
