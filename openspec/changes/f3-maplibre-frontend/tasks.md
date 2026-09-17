# Tasks: MapLibre Frontend Migration (F3)

## Phase F3.1: Foundation (Engine Abstraction + MapLibre Init)
- [ ] **T1**: Add `maplibre-gl ^6.9.0` to `territory-frontend/package.json` (ESM-only, alongside Leaflet for coexistence).
- [ ] **T2**: Define `MapEngine` abstract interface in `features/map/services/map-engine.interface.ts`.
- [ ] **T3**: Create `MaplibreEngineService` implementing `MapEngine` — init with WebGL2 check, tile source, basic style.
- [ ] **T4**: Add feature flag `mapEngine: 'leaflet' | 'maplibre' | 'auto'` to config (env or signal).
- [ ] **T5**: Refactor `MapPage` to delegate to active engine via factory; verify Leaflet mode still works.
- [ ] **T6**: Unit tests for `MaplibreEngineService` with `vi.mock('maplibre-gl')`.

## Phase F3.2: Tile Layer + Data-Driven Styling
- [ ] **T7**: Create `MapTileLayerService` — tile source config, `fill-color`/`fill-opacity` expressions, `fill-outline-color`, stroke layer.
- [ ] **T8**: Implement version-aware refresh: `TileVersionService` polls `data_version`, updates source URL `?v=`.
- [ ] **T9**: Create `MapLabelLayerService` — symbol layer with `text-field: ["get","nombre"]`, collision-aware, z ≥ 14.
- [ ] **T10**: Remove `map-territory-layer.service.ts` Leaflet-specific code (per-feature layers, `setStyle`, DivIcon, sessionStorage cache).
- [ ] **T11**: Remove `manzana-spatial-index.ts` and its consumers.
- [ ] **T12**: Unit tests for tile layer, label layer, version refresh.

## Phase F3.3: GPU Picking + Selection
- [ ] **T13**: Create `MapPickingService` — `queryRenderedFeatures` for click/hover, `setFeatureState` for highlight.
- [ ] **T14**: Integrate picking with `map-selection.service.ts` (territory selection, manzana click).
- [ ] **T15**: Remove `map-interaction.service.ts` Leaflet event handlers (replace with MapLibre `on('click')` etc.).
- [ ] **T16**: Unit tests for picking service (mock `queryRenderedFeatures`).

## Phase F3.4: Hybrid Edit Mode
- [ ] **T17**: Implement on-demand GeoJSON fetch in `map-state.service.ts` (enter edit mode → fetch territory GeoJSON → store in signal).
- [ ] **T18**: Create overlay GeoJSON layer in MapLibre (for editing handles, snap indicators).
- [ ] **T19**: Integrate `map-partial-draw.service.ts` with on-demand GeoJSON (snap targets from GeoJSON, display from tiles).
- [ ] **T20**: Implement save flow: persist → bump version → clear overlay → tiles refresh.
- [ ] **T21**: Implement concurrent edit detection (version mismatch warning).
- [ ] **T22**: Unit tests for hybrid edit mode.

## Phase F3.5: Layering Debt + Cleanup
- [ ] **T23**: Move `TERRITORY_COLORS` from `features/map/utils/territory-colors.ts` to `core/models/`.
- [ ] **T24**: Move `map-draft.ts` from `core/services/` to `features/map/services/`.
- [ ] **T25**: Update imports across codebase for moved modules.
- [ ] **T26**: Remove Leaflet dependency from `package.json` (after verifying all tests pass in MapLibre mode).

## Phase F3.6: E2E + Performance
- [ ] **T27**: E2E Playwright tests with SwiftShader: map renders, pan/zoom, click highlight, edit flow.
- [ ] **T28**: Performance benchmark: FPS ≥ 55, long tasks < 50 ms, click→highlight < 100 ms.
- [ ] **T29**: Verify parity checklist: mark territory, select territory, partial draw, save + WhatsApp, satellite view.
- [ ] **T30**: Update `AGENTS.md` (map section) and `README.md` (stack diagram).

## Dependencies
- F1+F2 complete (backend tiles + write-path) ✅
- `pnpm install` after adding `maplibre-gl` dependency.
- E2E tests require Playwright + SwiftShader (CI or local with `--use-gl=swiftshader`).

## Gates
- **F3.1 Gate**: MapLibre renders tiles in dev mode, Leaflet flag rollback works.
- **F3.2 Gate**: Data-driven styling matches current visual output (colors, opacity, labels).
- **F3.3 Gate**: GPU picking replaces grid with < 100 ms click→highlight.
- **F3.4 Gate**: Edit mode (partial draw + save + WhatsApp) works identically to current.
- **F3 Gate (final)**: Parity checklist complete, FPS ≥ 55, long tasks < 50 ms, 100% QA pass.
