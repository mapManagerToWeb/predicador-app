import type { MapEngine } from './map-engine.interface';
import type { ProjectionMap } from '../map-geometry';

/**
 * Minimal adapter that bridges MapLibre's projection to the
 * `map.latLngToContainerPoint()` interface expected by
 * `map-geometry.ts` (`snapToContour`, `pointInPolygon`, `traceContourBetween`).
 *
 * <p>This adapter implements the structural subset of a map projection that the
 * geometry functions actually consume. This enables reusing `map-geometry.ts`
 * unchanged in MapLibre mode.</p>
 *
 * <p>Thread safety: the adapter is stateless — each method call projects a
 * single coordinate against the current MapLibre view state. No internal
 * caching is performed.</p>
 */

/**
 * Creates a projection adapter from a MapLibre engine instance.
 *
 * <p>Uses MapLibre's `project()` which converts `[lng, lat]` → pixel
 * coordinates relative to the map container — the same coordinate space
 * that Leaflet's `latLngToContainerPoint` returns.</p>
 *
 * @param engine - The active MapEngine (must be a MapLibre instance with
 *                 `project` available on the underlying map).
 * @returns A `ProjectionMap` compatible with `map-geometry.ts` functions.
 */
export function createMapLibreProjectionAdapter(engine: MapEngine): ProjectionMap {
  return {
    latLngToContainerPoint(ll: { lat: number; lng: number }) {
      const projected = projectLngLat(engine, [ll.lng, ll.lat]);
      return { x: projected.x, y: projected.y, distanceTo(other: { x: number; y: number }) { return Math.hypot(this.x - other.x, this.y - other.y); } };
    },
  };
}

/**
 * Projects a `[lng, lat]` coordinate to pixel space using the MapLibre
 * engine's `project` capability.
 *
 * <p>Uses the engine's {@link MapEngine.project} method which maps
 * `[lng, lat]` → `{x, y}` in container pixels — the same coordinate
 * space that Leaflet's `latLngToContainerPoint` returns.</p>
 */
function projectLngLat(
  engine: MapEngine,
  lngLat: [number, number],
): { x: number; y: number } {
  const point = engine.project(lngLat);
  // If the engine returns the zero-fallback (map not yet initialized),
  // fall back to an approximate Mercator projection for test compatibility.
  if (point.x === 0 && point.y === 0 && engine.getZoom() !== 0) {
    return approximateProjection(engine, lngLat);
  }
  return point;
}

/**
 * Approximate pixel projection when the raw MapLibre map reference is
 * unavailable (e.g. unit tests). Uses a Mercator approximation.
 */
function approximateProjection(
  engine: MapEngine,
  lngLat: [number, number],
): { x: number; y: number } {
  const center = engine.getCenter();
  const zoom = engine.getZoom();
  const scale = 256 * Math.pow(2, zoom);

  const x = ((lngLat[0] + 180) / 360) * scale;
  const latRad = (lngLat[1] * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;

  const centerLng = center.lng;
  const centerLat = center.lat;
  const cx = ((centerLng + 180) / 360) * scale;
  const centerLatRad = (centerLat * Math.PI) / 180;
  const cy = ((1 - Math.log(Math.tan(centerLatRad) + 1 / Math.cos(centerLatRad)) / Math.PI) / 2) * scale;

  return { x: x - cx, y: y - cy };
}
