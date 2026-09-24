import type * as L from 'leaflet';

/**
 * Map Geometry Utilities
 *
 * WEB WORKER PREPARATION:
 * The following functions are pure computational functions that are candidates
 * for migration to Web Workers to prevent UI blocking during map interactions:
 *
 * - pointInPolygon(): Ray-casting algorithm called repeatedly during point-in-polygon checks
 * - projectOnSegment(): nearest point on a segment, used to find the manzana closest to a tap
 *
 * These functions are serializable (only use plain objects and numbers) and can be
 * moved to Web Workers with postMessage communication.
 */

export function makeLatLng(lat: number, lng: number): L.LatLng {
  return { lat, lng } as L.LatLng;
}

/**
 * Pure ray-casting algorithm for point-in-polygon detection.
 * WEB WORKER CANDIDATE: This function performs repetitive geometric calculations
 * that can block the UI during extensive manzana selection operations.
 */
export function pointInPolygon(point: L.LatLng, polygon: L.LatLng[]): boolean {
  const x = point.lat;
  const y = point.lng;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat;
    const yi = polygon[i].lng;
    const xj = polygon[j].lat;
    const yj = polygon[j].lng;

    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Computes parameter t for projection of point onto segment AB.
 * WEB WORKER CANDIDATE: Pure mathematical calculation used in projection logic.
 */
export function computeT(point: L.LatLng, a: L.LatLng, b: L.LatLng, map: L.Map): number {
  const p = map.latLngToContainerPoint(point);
  const pa = map.latLngToContainerPoint(a);
  const pb = map.latLngToContainerPoint(b);

  const abx = pb.x - pa.x;
  const aby = pb.y - pa.y;
  const apx = p.x - pa.x;
  const apy = p.y - pa.y;

  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return 0;

  const t = (apx * abx + apy * aby) / ab2;
  return Math.max(0, Math.min(1, t));
}

/**
 * Projects a point onto a line segment using parameter t.
 * WEB WORKER CANDIDATE: Geometric projection calculation used in snapping logic.
 */
export function projectOnSegment(
  point: L.LatLng,
  a: L.LatLng,
  b: L.LatLng,
  map: L.Map
): L.LatLng {
  const t = computeT(point, a, b, map);
  return makeLatLng(a.lat + t * (b.lat - a.lat), a.lng + t * (b.lng - a.lng));
}
