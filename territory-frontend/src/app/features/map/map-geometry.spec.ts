import { describe, it, expect } from 'vitest';
import type * as L from 'leaflet';
import {
  makeLatLng,
  pointInPolygon,
  computeT,
  projectOnSegment,
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
