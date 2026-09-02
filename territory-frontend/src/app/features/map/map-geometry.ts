import type * as L from 'leaflet';

<<<<<<< HEAD
=======
/**
 * Map Geometry Utilities
 *
 * WEB WORKER PREPARATION:
 * The following functions are pure computational functions that are candidates
 * for migration to Web Workers to prevent UI blocking during map interactions:
 *
 * - snapToContour(): Heavy computation in interaction hot path (calculates nearest point on edges)
 * - pointInPolygon(): Ray-casting algorithm called repeatedly during point-in-polygon checks
 * - traceContourBetween(): Path calculation between two snapped points on polygon edges
 *
 * These functions are serializable (only use plain objects and numbers) and can be
 * moved to Web Workers with postMessage communication.
 */

>>>>>>> feat/redesign
export interface SnappedPoint {
  latlng: L.LatLng;
  edgeIdx: number;
  t: number;
}

export interface Edge {
  from: L.LatLng;
  to: L.LatLng;
}

export function makeLatLng(lat: number, lng: number): L.LatLng {
  return { lat, lng } as L.LatLng;
}

export const SNAP_THRESHOLD_PX = 100;

<<<<<<< HEAD
=======
/**
 * Pure ray-casting algorithm for point-in-polygon detection.
 * WEB WORKER CANDIDATE: This function performs repetitive geometric calculations
 * that can block the UI during extensive manzana selection operations.
 */
>>>>>>> feat/redesign
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

<<<<<<< HEAD
=======
/**
 * Computes parameter t for projection of point onto segment AB.
 * WEB WORKER CANDIDATE: Pure mathematical calculation used in projection logic.
 */
>>>>>>> feat/redesign
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

<<<<<<< HEAD
=======
/**
 * Projects a point onto a line segment using parameter t.
 * WEB WORKER CANDIDATE: Geometric projection calculation used in snapping logic.
 */
>>>>>>> feat/redesign
export function projectOnSegment(
  point: L.LatLng,
  a: L.LatLng,
  b: L.LatLng,
  map: L.Map
): L.LatLng {
  const t = computeT(point, a, b, map);
  return makeLatLng(a.lat + t * (b.lat - a.lat), a.lng + t * (b.lng - a.lng));
}

<<<<<<< HEAD
=======
/**
 * Calculates pixel distance between two LatLng points.
 * WEB WORKER CANDIDATE: Distance calculation used in path building logic.
 */
>>>>>>> feat/redesign
export function latLngDist(a: L.LatLng, b: L.LatLng, map: L.Map): number {
  const pa = map.latLngToContainerPoint(a);
  const pb = map.latLngToContainerPoint(b);
  return pa.distanceTo(pb);
}

<<<<<<< HEAD
=======
/**
 * Snaps a point to the nearest edge of a polygon within threshold.
 * WEB WORKER CANDIDATE: This is the most computationally intensive function in the
 * interaction hot path. It iterates through all edges of a polygon to find the nearest
 * projection point, which can block the UI during complex map interactions.
 *
 * Performance considerations:
 * - Uses container point caching to avoid repeated projections
 * - Iterates through all edges to find minimum distance
 * - Called frequently during drag operations and point selection
 */
>>>>>>> feat/redesign
export function snapToContour(
  latlng: L.LatLng,
  edges: Edge[],
  map: L.Map
): SnappedPoint {
  const fallback: SnappedPoint = { latlng, edgeIdx: -1, t: 0 };
  if (edges.length === 0) return fallback;

  const clickPt = map.latLngToContainerPoint(latlng);
  let bestPoint: L.LatLng = latlng;
  let bestEdgeIdx = -1;
  let bestT = 0;
  let bestDist = Infinity;

  // Las aristas consecutivas comparten vértice (anillo cerrado), así que se
  // cachea el punto contenedor por vértice para evitar reproyectar. En el hot
  // path del drag esto reduce ~2 proyecciones por arista.
  const containerCache = new Map<L.LatLng, { x: number; y: number }>();
  const containerPointOf = (ll: L.LatLng): { x: number; y: number } => {
    let pt = containerCache.get(ll);
    if (!pt) {
      pt = map.latLngToContainerPoint(ll);
      containerCache.set(ll, pt);
    }
    return pt;
  };

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const pa = containerPointOf(edge.from);
    const pb = containerPointOf(edge.to);

    const abx = pb.x - pa.x;
    const aby = pb.y - pa.y;
    const apx = clickPt.x - pa.x;
    const apy = clickPt.y - pa.y;

    const ab2 = abx * abx + aby * aby;
    if (ab2 === 0) continue;

    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));

    const projected = makeLatLng(
      edge.from.lat + t * (edge.to.lat - edge.from.lat),
      edge.from.lng + t * (edge.to.lng - edge.from.lng)
    );
    const projPt = map.latLngToContainerPoint(projected);
    const d = clickPt.distanceTo(projPt);

    if (d < bestDist) {
      bestDist = d;
      bestPoint = projected;
      bestEdgeIdx = i;
      bestT = t;
    }
  }

  if (bestDist <= SNAP_THRESHOLD_PX) {
    return { latlng: bestPoint, edgeIdx: bestEdgeIdx, t: bestT };
  }
  return { latlng, edgeIdx: -1, t: 0 };
}

<<<<<<< HEAD
=======
/**
 * Traces the polygon contour between two snapped points.
 * WEB WORKER CANDIDATE: Path calculation that determines the optimal route between
 * two points on polygon edges, considering both forward and backward directions.
 */
>>>>>>> feat/redesign
export function traceContourBetween(
  a: SnappedPoint,
  b: SnappedPoint,
  edges: Edge[],
  map: L.Map
): L.LatLng[] {
  if (edges.length === 0 || a.edgeIdx < 0 || b.edgeIdx < 0) {
    return [a.latlng, b.latlng];
  }

  const startLatLng = pointOnEdge(edges[a.edgeIdx], a.t);
  const endLatLng = pointOnEdge(edges[b.edgeIdx], b.t);

  if (a.edgeIdx === b.edgeIdx) {
    return [startLatLng, endLatLng];
  }

  const n = edges.length;
  const stepsForward = (b.edgeIdx - a.edgeIdx + n) % n;
  const stepsBackward = (a.edgeIdx - b.edgeIdx + n) % n;

  if (stepsForward <= stepsBackward) {
    return buildForwardPath(a, edges, map, stepsForward, startLatLng, endLatLng);
  }
  return buildBackwardPath(a, edges, map, stepsBackward, startLatLng, endLatLng);
}

<<<<<<< HEAD
=======
/**
 * Helper function to get a point on an edge using parameter t.
 * WEB WORKER CANDIDATE: Simple interpolation calculation.
 */
>>>>>>> feat/redesign
function pointOnEdge(edge: Edge, t: number): L.LatLng {
  return makeLatLng(
    edge.from.lat + t * (edge.to.lat - edge.from.lat),
    edge.from.lng + t * (edge.to.lng - edge.from.lng)
  );
}

<<<<<<< HEAD
=======
/**
 * Builds path forward from snapped point a to b.
 * WEB WORKER CANDIDATE: Path construction with distance checks.
 */
>>>>>>> feat/redesign
function buildForwardPath(
  a: SnappedPoint,
  edges: Edge[],
  map: L.Map,
  stepsForward: number,
  startLatLng: L.LatLng,
  endLatLng: L.LatLng
): L.LatLng[] {
  const n = edges.length;
  const result: L.LatLng[] = [startLatLng];

  const nextVertex = edges[a.edgeIdx].to;
  if (latLngDist(startLatLng, nextVertex, map) > 1) {
    result.push(nextVertex);
  }
  for (let step = 1; step < stepsForward; step++) {
    const idx = (a.edgeIdx + step) % n;
    result.push(edges[idx].to);
  }
  if (latLngDist(result[result.length - 1], endLatLng, map) > 1) {
    result.push(endLatLng);
  }
  return result;
}

<<<<<<< HEAD
=======
/**
 * Builds path backward from snapped point a to b.
 * WEB WORKER CANDIDATE: Path construction with distance checks.
 */
>>>>>>> feat/redesign
function buildBackwardPath(
  a: SnappedPoint,
  edges: Edge[],
  map: L.Map,
  stepsBackward: number,
  startLatLng: L.LatLng,
  endLatLng: L.LatLng
): L.LatLng[] {
  const n = edges.length;
  const result: L.LatLng[] = [startLatLng];

  const prevVertex = edges[a.edgeIdx].from;
  if (latLngDist(startLatLng, prevVertex, map) > 1) {
    result.push(prevVertex);
  }
  for (let step = 1; step < stepsBackward; step++) {
    const idx = (a.edgeIdx - step + n) % n;
    result.push(edges[idx].from);
  }
  if (latLngDist(result[result.length - 1], endLatLng, map) > 1) {
    result.push(endLatLng);
  }
  return result;
}
