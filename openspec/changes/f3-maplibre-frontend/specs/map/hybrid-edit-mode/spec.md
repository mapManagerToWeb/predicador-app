# Spec: Hybrid Edit Mode

## Capability Path
`map/hybrid-edit-mode`

## Requirements

### R1: Tile Rendering for Display
- All territory/manzana rendering uses vector tiles (MapLibre source).
- No GeoJSON fetched for display — tiles are the single source of truth for visual state.

### R2: On-Demand GeoJSON for Editing
- When user enters edit mode (partial draw, snap, polygon clip):
  1. Fetch full GeoJSON for the selected territory via existing `GET /api/v1/territories/all/{territoryId}`.
  2. Store in a local signal (`editGeoJson` in `map-draft.ts`).
  3. Render an overlay GeoJSON layer on top of the tile layer (for editing handles, snap indicators, partial-draw preview).
  4. On save: persist via existing endpoint, bump `data_version`, clear overlay.

### R3: map-geometry.ts and polygon-clipping Integration
- `map-geometry.ts` (`snapToContour`, `pointInPolygon`, `projectOnSegment`) continues to operate on the on-demand GeoJSON.
- `polygon-clipping` (`union`, `intersection`, `difference`) operates on the GeoJSON overlay.
- No changes to these modules — they remain feature-exclusive.

### R4: map-partial-draw.service.ts
- `PartialDrawService` consumes the on-demand GeoJSON for snap targets.
- On tile mode: snap queries use `queryRenderedFeatures` (GPU) for display; on-demand GeoJSON for precise geometry operations.
- State machine: `idle → drawing → snapping → preview → save`.

### R5: State Synchronization
- After save: clear edit GeoJSON, bump version, tiles refresh automatically (R5 from maplibre-engine spec).
- If version changes during edit: warn user ("El territorio fue modificado por otro usuario. Guarda tu trabajo o descárgalo.").

### R6: WhatsApp Integration
- `whatsapp.ts` (report sending) operates on the same on-demand GeoJSON.
- `Idempotency-Key` header preserved for deduplication.

## Acceptance Criteria
- [ ] Display mode: only tiles, no GeoJSON fetched.
- [ ] Edit mode: on-demand GeoJSON overlay renders on top of tiles.
- [ ] Partial draw + snap works identically to current Leaflet behavior.
- [ ] Save persists correctly and triggers version-aware refresh.
- [ ] Concurrent edit detection shows warning.
- [ ] WhatsApp report flow unchanged.
