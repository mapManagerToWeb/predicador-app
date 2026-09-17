# Design: MapLibre Frontend Migration (F3)

## Architecture

### Engine Abstraction
```
map-engine.service.ts (abstract)
├── leaflet-engine.service.ts (existing, F4 removal)
└── maplibre-engine.service.ts (new)
```
- Abstract `MapEngine` interface: `init(container, options)`, `addSource(id, url)`, `setPaintProperty(layer, prop, value)`, `queryFeatures(point/layers)`, `on(event, handler)`, `destroy()`.
- Feature flag `mapEngine` (from `core/config`) selects implementation at bootstrap.
- `MapPage` delegates to the active engine; no engine-specific code in the component.

### Service Layer (features/map/services/)
New/modified services under `features/map/services/`:
| Service | Responsibility | Status |
|---------|---------------|--------|
| `map-engine.service.ts` | Abstract engine interface + factory | Modified (add factory) |
| `maplibre-engine.service.ts` | MapLibre GL JS init, style, source, events | **New** |
| `map-tile-layer.service.ts` | Tile source config, data-driven paint, version refresh | **New** |
| `map-picking.service.ts` | GPU picking via `queryRenderedFeatures`, selection state | **New** |
| `map-label-layer.service.ts` | Symbol layer for territory labels | **New** |
| `map-territory-layer.service.ts` | Remove Leaflet layers + caches (replaced by tile layer) | Modified (gutted) |
| `manzana-spatial-index.ts` | Remove (replaced by GPU picking) | **Deleted** |
| `map-draft.ts` | Move from `core/services/` to `features/map/services/` | Moved |
| `map-partial-draw.service.ts` | Keep, consume on-demand GeoJSON in edit mode | Modified |
| `map-geometry.ts` | Keep, no changes | Unchanged |
| `map-rendering.facade.ts` | Delegate to active engine | Modified |
| `map-state.service.ts` | Add `selectedTerritoryId` signal for edit mode | Modified |

### Data Flow
```
┌─────────────────────────────────────────────────┐
│  MapPage                                        │
│  ┌───────────────────────────────────────────┐  │
│  │  MapEngine (abstract)                     │  │
│  │  ┌─────────────┐  ┌──────────────────┐   │  │
│  │  │ MapLibre    │  │ Leaflet (F4 del) │   │  │
│  │  │ Engine      │  │ Engine           │   │  │
│  │  └──────┬──────┘  └────────┬─────────┘   │  │
│  │         │                   │             │  │
│  │  ┌──────┴───────────────────┴─────────┐   │  │
│  │  │ Tile Source (MVT/PBF)              │   │  │
│  │  │ GET /tiles/{z}/{x}/{y}.pbf?v=N     │   │  │
│  │  └────────────────────────────────────┘   │  │
│  │         │                                 │  │
│  │  ┌──────┴─────────────────────────────┐   │  │
│  │  │ Picking (GPU: queryRenderedFeatures│   │  │
│  │  │        or JS: ManzanaSpatialIndex) │   │  │
│  │  └────────────────────────────────────┘   │  │
│  │         │                                 │  │
│  │  ┌──────┴─────────────────────────────┐   │  │
│  │  │ Edit Mode (on-demand GeoJSON)      │   │  │
│  │  │ map-geometry.ts + polygon-clipping  │   │  │
│  │  └────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Key Decisions
1. **Abstract engine interface** over direct MapLibre import — enables rollback (flag) and clean F4 removal.
2. **Tile source versioning** via `?v=` query param — MapLibre re-fetches when URL changes; no full source recreation needed.
3. **GPU picking as default** in MapLibre mode; `ManzanaSpatialIndex` removed entirely (not kept as fallback).
4. **On-demand GeoJSON** only in edit mode — display is pure tiles, no hybrid rendering.
5. **map-draft.ts moves** from `core/services/` to `features/map/services/` — resolves the known layering debt (core→feature dependency inversion).

### Testing Strategy
- **Unit**: `vi.mock('maplibre-gl')` for all MapLibre API calls; test each service in isolation.
- **Component**: `TestBed` with mocked engine; verify `MapPage` delegates correctly.
- **E2E**: Playwright with SwiftShader (`--use-gl=swiftshader`); verify rendering, picking, edit flow.
- **Performance**: Playwright trace + LongTaskObserver for FPS and long tasks.
