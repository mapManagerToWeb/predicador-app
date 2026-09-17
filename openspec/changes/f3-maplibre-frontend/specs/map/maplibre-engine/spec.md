# Spec: MapLibre GL JS Engine

## Capability Path
`map/maplibre-engine`

## Requirements

### R1: Initialization
- MapLibre GL JS v6 (ESM-only, WebGL2 mandatory) initializes on the `/map` route when `mapEngine === 'maplibre'`.
- `transformRequest` adds session cookie authentication (same as current `authInterceptor`).
- Initial view: center on Concepción, Chile (~-36.83, -73.05), zoom 14.
- Canvas renderer with `padding: 0.1` (matching current Leaflet config).

### R2: Tile Source
- Vector tile source: `GET /api/v1/territories/tiles/{z}/{x}/{y}.pbf` with `?v={data_version}`.
- `data_version` fetched from a lightweight endpoint or embedded in the TileJSON `tiles` URL.
- Source attribution: "Predicador" (configurable).

### R3: Data-Driven Styling
- `fill-color`: expression `["get", "color"]` from tile feature property; fallback `#94a3b8` via `coalesce`.
- `fill-opacity`: constant 0.6 default; per-territory expression `[territorio, opacity]` rebuilt reactively via `map.setPaintProperty`.
- `fill-outline-color`: darker shade of `color` (computed via `["to-color", ...]` or pre-computed in backend).
- Stroke: `line-width: 1`, `line-color: ["get", "color"]` for territory boundaries.
- Label layer (z ≥ 14): symbol layer with `text-field: ["get", "nombre"]`, `text-size: 12`, `text-anchor: center`, collision-aware (`symbol-avoid-edges: true`).

### R4: GPU Picking
- `map.queryRenderedFeatures(point, { layers: ['manzana'] })` replaces `ManzanaSpatialIndex.queryAt`.
- `map.queryRenderedFeatures(bbox, { layers: ['manzana'] })` replaces `ManzanaSpatialIndex.queryNear`.
- On click: highlight selected manzana via `setFeatureState` (GPU-accelerated, no DOM manipulation).
- On hover: cursor change + tooltip (optional, via `queryRenderedFeatures` + `getFeatureState`).

### R5: Version-Aware Refresh
- `RumService` or a new `TileVersionService` polls `data_version` (every 30s or on visibility change).
- When version changes: update tile source `url` parameter `?v={new_version}` → `map.getSource('territories').setUrl(...)`.
- This triggers MapLibre to re-fetch affected tiles; old tiles remain visible until new ones load (no flash).

### R6: Device Capability Check
- On app init: `mapgl.supported()` (MapLibre's built-in check for WebGL2).
- If not supported: show error UX ("Tu navegador no soporta WebGL2. Actualiza tu navegador o contacta al soporte.") and fall back to a read-only mode or redirect.
- Feature flag `mapEngine` can override: `'leaflet'` forces Leaflet (rollback), `'maplibre'` forces MapLibre, `'auto'` uses capability check.

### R7: Removal of Leaflet Artifacts
- Remove `map-engine.service.ts` (Leaflet init), `manzana-spatial-index.ts` (grid), `map-territory-layer.service.ts` (per-feature layers + `setStyle` + DivIcon + sessionStorage cache).
- Remove `@turf/simplify`, `@turf/union` usage in map feature (dissolve now server-side).
- Keep `map-geometry.ts`, `polygon-clipping`, `map-partial-draw.service.ts` (used in hybrid edit mode).
- Remove `leaflet` dependency from `package.json` (after F4 cutover; during F3, both engines coexist behind flag).

### R8: Testing
- Unit: `vi.mock('maplibre-gl')` for all MapLibre API calls; test initialization, style expressions, picking, version refresh.
- Integration: verify tile URL includes `?v=` parameter; verify `setPaintProperty` called on version change.
- E2E (Playwright): SwiftShader (`--use-gl=swiftshader`) for headless WebGL2; verify map renders, pan/zoom smooth, click highlights manzana.

## Acceptance Criteria
- [ ] Map renders tiles from `/tiles/{z}/{x}/{y}.pbf` with correct colors.
- [ ] Click on a manzana highlights it (GPU picking, < 100 ms).
- [ ] Pan/zoom achieves ≥ 55 FPS on mid-range device (Playwright trace).
- [ ] Long tasks < 50 ms (LongTaskObserver).
- [ ] Version bump triggers tile re-fetch without full map redraw.
- [ ] WebGL2-not-supported shows graceful error UX.
- [ ] All existing map functionality (territory selection, partial draw, WhatsApp report) works in hybrid mode.
- [ ] Unit test coverage ≥ 80% for new map engine services.
