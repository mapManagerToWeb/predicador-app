# ADR 0001: Pin Leaflet to 1.9.4 (stable) for the map renderer

## Status

Accepted

## Context

Commit `a534fba` upgraded Leaflet from 1.9.4 to `2.0.0-alpha.1` in an attempt to
improve map rendering performance. The experiment caused several problems:

1. Leaflet 2.0-alpha forces `continuous: false` on the canvas renderer, which
   broke pan-by-transform; it was patched with a custom `ContinuousCanvas`
   renderer that repainted every polygon on every drag frame — the single
   largest source of mobile jank (`SPEC-map-renderer.md:7-10`).
2. An alpha release was being shipped to production mobile.
3. The local `node_modules` resolved to 1.9.4 while CI installed 2.0-alpha, so
   local validation did not represent production (`SPEC-map-renderer.md:10`).

The decision to revert is already recorded as the committed plan decision in
`CAPABILITY-MAP.md:3`.

## Decision

Pin the exact version `"leaflet": "1.9.4"` (`territory-frontend/package.json:34`)
and use Leaflet's standard canvas renderer. The revert of `a534fba` is
integrated in commit `3a0f0ba` — it is not an uncommitted working-tree change.

## Consequences

- Stable, predictable rendering and panning performance on mobile.
- The modernization to Leaflet 2.0 remains pending until a stable release.
- Residual hygiene debt: a stale comment "Leaflet 2.0 comparte
  Polygon/MultiPolygon" remains in `map-interaction.service.ts:120-122` and
  should be cleaned up when the code around it is next touched.