# Design: fix-gps-overlay-and-label-badges

## Context

See proposal.md for motivation. Current-state facts that shape this design:

- Layer stack after `initMaplibre` (`map.ts`): vector-tile fills/lines → marked overlay (0.95/0.85 opacity fills) → selected-manzana overlay → label layers → GPS overlay (`gpsFollow.attachEngine` moved after the label init; the attached overlay stack renders on top). Layers added later render on top in MapLibre.
- `gps-position` GeoJSON source holds two features: a `kind: 'position'` Point and a `kind: 'accuracy'` 65-vertex Polygon. The `gps-marker` circle layer has no `filter`, and MapLibre renders a circle at each vertex of polygon features when a circle layer is unfiltered (documented MapLibre behavior) — the observed chain of ~65 dots.
- Pixel analysis of the reported screenshot confirms the marker/ring/trail render under `marked-fill`: blue core at 0.85 mark opacity computes to `(223,66,35)` vs observed `(218,65,32)`.
- Label centroids (`territory-label-centroids` source) carry `territorio: number`; this change adds the territory `color` property to each centroid feature (from `MapRenderingFacade.getFeatureLayerByTerritorio(num)?.color`, with `TERRITORY_COLORS` fallback) to drive the badge ring and text.
- Engine supports `addLayer(layer, beforeId?)` and `circle` layers via the `MapEngine` interface; GPU picking queries fill layers only.

## Goals / Non-Goals

**Goals:**

- One position marker only; continuous accuracy ring; GPS overlay untinted by any territory/marked layer.
- Territory-colored number inside a white circular badge, preserving existing selection filtering and `minzoom: 14`.
- Regression tests for both fixes.

**Non-Goals:**

- No changes to GPS lifecycle, watch options, trail recording, follow/pause logic (owned by in-flight f5 change).
- No changes to selection semantics, metadata API, tile pipeline, GPU picking, or edit/partial overlays.
- No new engine capabilities beyond existing `addLayer`/`circle` support.

## Decisions

1. **Marker filtering by `kind` property** (`['==', ['get', 'kind'], 'position']`) over `['geometry-type'] == 'Point'`. Both work; `kind` is the feature contract already written by `updatePosition`, reads as intent, and stays correct if more point kinds are added. Zero cost — features already carry it.
2. **Reorder by moving the single `gpsFollow.attachEngine(engine)` call** in `initMaplibre` to after `labelLayer.updateLabels(...)`, instead of: (a) `beforeId` insertion — impossible, the overlay attaches before the covering layers exist; (b) a new `moveToTop` engine API — extra surface for a one-time init order; (c) splitting handler registration from overlay attach — two call sites and a split contract for a negligible timing window (the moved call lands after one metadata `await`; follow mode cannot meaningfully be running with user interaction before init completes, and `attach` stays idempotent). Final stack: tiles → marked → selected → labels → GPS.
3. **Badge via a `circle` layer sharing the existing centroid source**, added immediately before the symbol layer, over: (a) generated `icon-image` sprites — image registration, blur at some DPRs, more state; (b) text-only with halo — not a circle; (c) HTML marker overlays — bypasses the engine abstraction. The circle layer is data-driven, GPU-rendered, and already allowed by `LayerSpecification`.
4. **Badge paint**: white disc (`circle-color: '#ffffff'`) with the territory color — written to each centroid feature from `getFeatureLayerByTerritorio` (fallback: existing `TERRITORY_COLORS` helper) — driving both `circle-stroke-color` and `text-color` via `['coalesce', ['get','color'], '#475569']`; `circle-radius: 12` (24 px diameter fits 3-digit numbers at `text-size: 12`), stroke width 1.5; `text-halo-color: rgba(0,0,0,0.45)` width 1 (dark halo keeps light palette colors like yellow/spring green legible on white). Shared `minzoom: 14`. Style evolved with the owner: first territory-color fill + white text, restyled after the visual check to white background + territory-colored number/ring when the owner reported the numbers were hard to read.
5. **Accuracy outline strengthened** to `line-width: 1.5`, `line-opacity: 0.8` (from 1 / 0.6) so the continuous ring meets the legibility requirement over 0.85–0.95-opacity marks. Marker and trail paints unchanged.
6. **Both deltas declared as new capabilities** (`map/gps-tracking`, `map/territory-labels`) because `openspec/specs/` has no archived specs yet; the gps delta is additive to the in-flight f5 change and archives cleanly regardless of order.

## Risks / Trade-offs

- [Moving `attachEngine` after the metadata `await` delays pause-handler registration by one fetch] → window is milliseconds-to-seconds before any realistic user interaction; `attach` is idempotent; if ever observed, handlers can be split out later without spec changes.
- [GPS overlay now covers labels/marks it overlaps] → intentional: live position takes precedence; badge/mark area vastly exceeds the 14 px marker.
- [Light territory colors (yellow, spring green) on the white badge] → dark text halo (Decision 4); scenario-covered in the label spec.
- [Two in-flight changes touch `map/gps-tracking`] → deltas are additive ADDED requirements with no overlapping requirement names; archive order-independent.
- [Visual change not covered by unit tests (actual pixels)] → targeted specs assert layer order/filter/paint; visual confirmation via dev server during apply.

## Migration Plan

Frontend-only change: ships with the normal build (lint → build → test). No schema, API, or data migration. Rollback = revert the commit.

## Open Questions

None — badge style resolved with the owner through two visual iterations: territory-color fill with white text (first pass), restyled to white background with territory-colored number and ring after the owner reported the numbers were hard to read.
