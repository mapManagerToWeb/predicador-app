import { describe, it, expect } from 'vitest';
import type * as L from 'leaflet';
import {
  makeLatLng,
  pointInPolygon,
  computeT,
  projectOnSegment,
  latLngDist,
  snapToContour,
  traceContourBetween,
  SNAP_THRESHOLD_PX,
  type Edge,
  type SnappedPoint,
} from './map-geometry';

function mapPoint(lat: number, lng: number) {
  return {
    x: lng,
    y: lat,
    distanceTo(other: { x: number; y: number }): number {
      return Math.hypot(this.x - other.x, this.y - other.y);
    },
  };
}

const mockMap = {
  latLngToContainerPoint: (latlng: L.LatLng) => mapPoint(latlng.lat, latlng.lng),
} as unknown as L.Map;

const square: L.LatLng[] = [
  makeLatLng(0, 0),
  makeLatLng(0, 10),
  makeLatLng(10, 10),
  makeLatLng(10, 0),
];

describe('pointInPolygon', () => {
  it('returns true for a point inside the polygon', () => {
    expect(pointInPolygon(makeLatLng(5, 5), square)).toBe(true);
  });

  it('returns false for a point outside the polygon', () => {
    expect(pointInPolygon(makeLatLng(20, 20), square)).toBe(false);
  });

  it('returns false for an empty polygon', () => {
    expect(pointInPolygon(makeLatLng(5, 5), [])).toBe(false);
  });
});

describe('computeT', () => {
  it('returns 0.5 for the midpoint of a segment', () => {
    const t = computeT(makeLatLng(5, 0), makeLatLng(0, 0), makeLatLng(10, 0), mockMap);
    expect(t).toBeCloseTo(0.5);
  });

  it('clamps to 0 when the point projects before the segment start', () => {
    const t = computeT(makeLatLng(-5, 0), makeLatLng(0, 0), makeLatLng(10, 0), mockMap);
    expect(t).toBe(0);
  });

  it('clamps to 1 when the point projects after the segment end', () => {
    const t = computeT(makeLatLng(15, 0), makeLatLng(0, 0), makeLatLng(10, 0), mockMap);
    expect(t).toBe(1);
  });

  it('returns 0 for a zero-length segment', () => {
    const t = computeT(makeLatLng(5, 5), makeLatLng(5, 5), makeLatLng(5, 5), mockMap);
    expect(t).toBe(0);
  });
});

describe('projectOnSegment', () => {
  it('projects a point onto the segment', () => {
    const projected = projectOnSegment(makeLatLng(4, 3), makeLatLng(0, 0), makeLatLng(10, 0), mockMap);
    expect(projected.lat).toBeCloseTo(4);
    expect(projected.lng).toBeCloseTo(0);
  });
});

describe('latLngDist', () => {
  it('computes container-space distance', () => {
    const d = latLngDist(makeLatLng(0, 0), makeLatLng(3, 4), mockMap);
    expect(d).toBe(5);
  });
});

describe('snapToContour', () => {
  const edges: Edge[] = [
    { from: makeLatLng(0, 0), to: makeLatLng(0, 10) },
    { from: makeLatLng(0, 10), to: makeLatLng(10, 10) },
  ];

  it('snaps a nearby click to the closest edge', () => {
    const result = snapToContour(makeLatLng(0, 4), edges, mockMap);
    expect(result.edgeIdx).toBe(0);
    expect(result.latlng.lng).toBeCloseTo(4);
    expect(result.latlng.lat).toBeCloseTo(0);
  });

  it('returns the raw point when nothing is within the threshold', () => {
    const far = makeLatLng(1000, 1000);
    const result = snapToContour(far, edges, mockMap);
    expect(result.edgeIdx).toBe(-1);
    expect(result.t).toBe(0);
    expect(result.latlng).toEqual(far);
  });

  it('returns the fallback for an empty edge list', () => {
    const result = snapToContour(makeLatLng(0, 4), [], mockMap);
    expect(result.edgeIdx).toBe(-1);
  });

  it('snaps exactly at the threshold distance', () => {
    const atThreshold = makeLatLng(SNAP_THRESHOLD_PX, 4);
    const result = snapToContour(atThreshold, edges, mockMap);
    expect(result.edgeIdx).toBeGreaterThanOrEqual(0);
  });
});

describe('traceContourBetween', () => {
  const edges: Edge[] = [
    { from: makeLatLng(0, 0), to: makeLatLng(0, 10) },
    { from: makeLatLng(0, 10), to: makeLatLng(10, 10) },
    { from: makeLatLng(10, 10), to: makeLatLng(10, 0) },
    { from: makeLatLng(10, 0), to: makeLatLng(0, 0) },
  ];

  const pointOn = (edgeIdx: number, t: number): SnappedPoint => ({
    latlng: makeLatLng(0, 0),
    edgeIdx,
    t,
  });

  it('traces along the shorter forward path between two edges', () => {
    const a = pointOn(0, 0.5);
    const b = pointOn(1, 0.5);
    const result = traceContourBetween(a, b, edges, mockMap);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].lng).toBeCloseTo(5);
    expect(result[0].lat).toBeCloseTo(0);
  });

  it('returns both points when edges are unknown', () => {
    const a = pointOn(-1, 0);
    const b = pointOn(-1, 0);
    const result = traceContourBetween(a, b, edges, mockMap);
    expect(result).toHaveLength(2);
  });

  it('returns endpoints only when both points are on the same edge', () => {
    const a = pointOn(0, 0);
    const b = pointOn(0, 1);
    const result = traceContourBetween(a, b, edges, mockMap);
    expect(result).toHaveLength(2);
  });

  it('traces a forward path through intermediate vertices', () => {
    const a = pointOn(0, 0.5);
    const b = pointOn(2, 0.5);
    const result = traceContourBetween(a, b, edges, mockMap);
    expect(result).toHaveLength(4);
    expect(result[0].lng).toBeCloseTo(5);
    expect(result[1].lat).toBeCloseTo(0);
    expect(result[1].lng).toBeCloseTo(10);
    expect(result[2].lat).toBeCloseTo(10);
    expect(result[2].lng).toBeCloseTo(10);
    expect(result[3].lat).toBeCloseTo(10);
    expect(result[3].lng).toBeCloseTo(5);
  });

  it('traces the backward path when it is shorter', () => {
    const hexEdges: Edge[] = [
      { from: makeLatLng(0, 0), to: makeLatLng(0, 10) },
      { from: makeLatLng(0, 10), to: makeLatLng(10, 10) },
      { from: makeLatLng(10, 10), to: makeLatLng(20, 10) },
      { from: makeLatLng(20, 10), to: makeLatLng(20, 0) },
      { from: makeLatLng(20, 0), to: makeLatLng(10, 0) },
      { from: makeLatLng(10, 0), to: makeLatLng(0, 0) },
    ];
    const a = pointOn(0, 0.5);
    const b = pointOn(4, 0.5);
    const result = traceContourBetween(a, b, hexEdges, mockMap);
    expect(result).toHaveLength(4);
    expect(result[1].lat).toBeCloseTo(0);
    expect(result[1].lng).toBeCloseTo(0);
    expect(result[3].lat).toBeCloseTo(15);
    expect(result[3].lng).toBeCloseTo(0);
  });
});
