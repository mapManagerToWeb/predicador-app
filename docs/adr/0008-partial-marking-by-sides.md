# ADR 0008: Partial marking by sides (streets) instead of tracing points

## Status

Accepted

## Context

Marking part of a manzana required tracing up to 6 points snapped to its
contour on a phone, then confirming. It was error-prone with a finger, it was
hard to predict the resulting area, and the data model kept a single partial
geometry per territory: a second partial manzana in the same territory
overwrote the first one, restored reports only drew the first polygon, and
restored partial zones were not included in the next report. In practice the
field question is "which streets of this block did we cover?".

## Decision

- **Interaction**: in "Parcial" mode, tapping a manzana (or the street next to
  it) opens it; its sides are shown as thick segments with a numbered badge
  (large touch targets). Tapping toggles a side; "Listo" saves, "Toda" marks
  the whole manzana, "Cancelar" discards. All sides selected = complete
  manzana. Opening another manzana saves the current one. Saved zones can be
  reopened and edited.
- **Geometry** (`features/map/utils/lados.ts`, pure GeoJSON, no Leaflet):
  sides are split at corners detected by the accumulated turn over a few
  metres (rounded corners count once), short fragments are merged; the marked
  zone is a strip (4–14 m, proportional to the block) along the chosen sides,
  clipped to the manzana with `polygon-clipping`. Calibrated on the 695 real
  manzanas: 88% get 3–6 sides.
- **Data**: one zone per manzana. Reports keep `geometriaParcial` as the
  union (Polygon/MultiPolygon) of every zone of the territory, so existing
  readers still work, and `puntosParciales` stores
  `{"v":2,"zonas":[{"m":manzanaId,"n":name,"l":[sides],"g":geometry}]}`.
  Old reports (a list of points) are read as zones without a manzana.
- A territory is only `completed` when every manzana is fully marked; a
  partial zone no longer counts towards completion.
- Drafts restore zones into state, so a reload before sending no longer drops
  them.

## Consequences

- Simpler, predictable marking on phones; multiple partial manzanas per
  territory are preserved end to end.
- The geometry and data format are renderer-agnostic: the MapLibre migration
  only needs to redraw sides/badges/strips (`map-lados.service.ts`).
- The point-trace code (`map-partial-draw.service.ts`, `snapToContour`,
  `traceContourBetween`) was removed.
