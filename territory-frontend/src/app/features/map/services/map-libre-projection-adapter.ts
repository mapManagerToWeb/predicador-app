import type { MapEngine } from './map-engine.interface';

/**
 * Minimal adapter that bridges MapLibre's projection to the
 * `map.latLngToContainerPoint()` interface expected by
 * `map-geometry.ts` (`snapToContour`, `pointInPolygon`, `traceContourBetween`).
 *
 * <p>This adapter implements the structural subset of Leaflet's `Map` that the
 * geometry functions actually consume — the full Leaflet `Map` type is never
 * required. This enables reusing `map-geometry.ts` unchanged in MapLibre mode.</p>
 *
 * <p>Thread safety: the adapter is stateless — each method call projects a
 * single coordinate against the current MapLibre view state. No internal
 * caching is performed.</p>
 */
export interface LatLngProjection {
  lat: number;
  lng: number;
}

export interface PixelPoint {
  x: number;
  y: number;
}

export interface LatLngContainerPointProjection {
  latLngToContainerPoint(ll: LatLngProjection): PixelPoint;
}

/**
 * Structural duck-type that matches what `map-geometry.ts` needs from a map.
 * Named `ProjectionMap` to avoid collision with the Leaflet `Map` type.
 */
export interface ProjectionMap {
  latLngToContainerPoint(ll: LatLngProjection): PixelPoint;
}

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
    latLngToContainerPoint(ll: LatLngProjection): PixelPoint {
      const projected = projectLngLat(engine, [ll.lng, ll.lat]);
      return { x: projected.x, y: projected.y };
    },
  };
}

/**
 * Projects a `[lng, lat]` coordinate to pixel space using the MapLibre
 * engine's `project` capability.
 *
 * <p>MapLibre's internal map object exposes `project([lng, lat])` which
 * returns `{x, y}` in container pixels. We access it via the engine's
 * internal map reference.</p>
 */
function projectLngLat(
  engine: MapEngine,
  lngLat: [number, number],
): { x: number; y: number } {
  // MapLibre's Map.prototype.project is not exposed in our MapEngine
  // interface. We access it by casting through the engine — the only
  // consumer is this adapter, and MapLibre's project is stable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = (engine as any).map as Record<string, unknown> | undefined;
  const projectFn = mapRef?.['project'] as ((lngLat: [number, number]) => { x: number; y: number }) | undefined;
  if (projectFn) {
    return projectFn(lngLat);
  }
  // Fallback: approximate projection using zoom-level-based scale.
  // This is used only if the map reference is not directly accessible
  // (e.g. in tests with a mock engine). The approximation is accurate
  // enough for snap threshold checks.
  return approximateProjection(engine, lngLat);
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
