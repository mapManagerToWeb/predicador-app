import type * as L from 'leaflet';

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

export function projectOnSegment(
  point: L.LatLng,
  a: L.LatLng,
  b: L.LatLng,
  map: L.Map
): L.LatLng {
  const t = computeT(point, a, b, map);
  return makeLatLng(a.lat + t * (b.lat - a.lat), a.lng + t * (b.lng - a.lng));
}

export function latLngDist(a: L.LatLng, b: L.LatLng, map: L.Map): number {
  const pa = map.latLngToContainerPoint(a);
  const pb = map.latLngToContainerPoint(b);
  return pa.distanceTo(pb);
}

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

function pointOnEdge(edge: Edge, t: number): L.LatLng {
  return makeLatLng(
    edge.from.lat + t * (edge.to.lat - edge.from.lat),
    edge.from.lng + t * (edge.to.lng - edge.from.lng)
  );
}

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
