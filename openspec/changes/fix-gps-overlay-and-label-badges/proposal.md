# Proposal: fix-gps-overlay-and-label-badges

## Why

The GPS follow-mode overlay renders incorrectly in production-shaped usage: the accuracy circle appears as a chain of ~65 dot markers instead of a solid ring (the unfiltered `gps-marker` circle layer draws a circle at every vertex of the accuracy polygon), and the marker/accuracy/trail render *underneath* the marked-manzana overlay (0.85–0.95 opacity), so they pick up territory tints and look broken. Separately, territory numbers render as plain text with no visual identity; the owner wants them enclosed in a white circle so they stay legible over any territory color.

## What Changes

- `gps-marker` gains a `kind: 'position'` feature filter so only the center position point renders — no vertex dots around the accuracy polygon.
- The GPS overlay (marker, accuracy ring, trail) is attached after the marked/selected/label layers so it renders on top of them; the accuracy outline is slightly strengthened (width 1 → 1.5, opacity 0.6 → 0.8) to stay legible over bright fills.
- Territory number labels gain a circular badge: a `circle` layer keyed to the existing label-centroid source renders a white disc edged with a thin ring in the territory's metadata color (data-driven), with the number in that same territory color on top (subtle dark halo for contrast on light colors). Existing selection filtering and `minzoom: 14` behavior is preserved.

## Capabilities

### New Capabilities

- `map/gps-tracking`: delta adds rendering-fidelity requirements on top of the in-flight f5 gps-tracking capability — marker must render only the position point, and the GPS overlay must render above territory/marked overlays with a legible accuracy outline.
- `map/territory-labels`: territory number label rendering — territory-colored number inside a white circular badge, visible from zoom 14, filtered to the active selection.

### Modified Capabilities

<!-- None: openspec/specs/ has no archived main specs yet; all deltas are additive. -->

## Impact

- Frontend only: `territory-frontend/src/app/features/map/`
  - `services/map-gps-overlay.service.ts` (marker filter + outline paint) + spec
  - `services/map-label-layer.service.ts` (badge circle layer, white fill + territory-colored ring/text, color property on centroid features) + spec
  - `map.ts` (move `gpsFollow.attachEngine` after label init in `initMaplibre`)
- No API, backend, schema, or dependency changes. No breaking changes.
- Relationship: tightens the in-flight `f5-gps-mode-cwv-hardening` change (its `map/gps-tracking` spec's accuracy-circle requirement) without editing that change's artifacts; supersedes nothing.
