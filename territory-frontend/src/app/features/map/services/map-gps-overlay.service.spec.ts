import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

import { MapGpsOverlayService } from './map-gps-overlay.service';
import type { LayerSpecification, MapEngine } from './map-engine.interface';
import { LOCATION_DEFAULTS } from '../utils/map-constants';

interface MockEngine {
  engine: MapEngine;
  addedSources: string[];
  addedLayers: LayerSpecification[];
  removedLayers: string[];
  removedSources: string[];
  sourceData: Map<string, GeoJSON.GeoJSON>;
  updateGeoJsonSourceData: Mock<(id: string, data: GeoJSON.GeoJSON) => void>;
}

function createMockEngine(): MockEngine {
  const addedSources: string[] = [];
  const addedLayers: LayerSpecification[] = [];
  const removedLayers: string[] = [];
  const removedSources: string[] = [];
  const sourceData = new Map<string, GeoJSON.GeoJSON>();

  const updateGeoJsonSourceData = vi.fn((id: string, data: GeoJSON.GeoJSON) => {
    sourceData.set(id, data);
  });

  const engine = {
    addGeoJsonSource: vi.fn((id: string, data: GeoJSON.GeoJSON) => {
      addedSources.push(id);
      sourceData.set(id, data);
    }),
    updateGeoJsonSourceData,
    addLayer: vi.fn((layer: LayerSpecification) => {
      addedLayers.push(layer);
    }),
    removeLayer: vi.fn((id: string) => {
      removedLayers.push(id);
    }),
    removeSource: vi.fn((id: string) => {
      removedSources.push(id);
    }),
  } as unknown as MapEngine;

  return {
    engine,
    addedSources,
    addedLayers,
    removedLayers,
    removedSources,
    sourceData,
    updateGeoJsonSourceData,
  };
}

function featuresOf(
  mock: MockEngine,
  sourceId: string,
): GeoJSON.Feature[] {
  const data = mock.sourceData.get(sourceId);
  if (!data || data.type !== 'FeatureCollection') {
    throw new Error(`source ${sourceId} has no FeatureCollection`);
  }
  return data.features;
}

function trailLineString(mock: MockEngine): GeoJSON.LineString {
  const feature = featuresOf(mock, 'gps-trail')[0];
  if (!feature || feature.geometry?.type !== 'LineString') {
    throw new Error('trail source has no LineString feature');
  }
  return feature.geometry;
}

describe('MapGpsOverlayService', () => {
  let overlay: MapGpsOverlayService;
  let mock: MockEngine;

  beforeEach(() => {
    overlay = new MapGpsOverlayService();
    mock = createMockEngine();
  });

  it('attach adds both sources and four layers exactly once', () => {
    overlay.attach(mock.engine);
    overlay.attach(mock.engine); // idempotent

    expect(mock.addedSources).toEqual(['gps-position', 'gps-trail']);
    expect(mock.addedLayers.map((l) => l.id)).toEqual([
      'gps-accuracy-fill',
      'gps-accuracy-line',
      'gps-trail-line',
      'gps-marker',
    ]);
    expect(overlay.isAttached()).toBe(true);
  });

  it('gps-marker is filtered to the position point only (no vertex dots on the accuracy polygon)', () => {
    overlay.attach(mock.engine);

    const marker = mock.addedLayers.find((l) => l.id === 'gps-marker');
    expect(marker).toBeDefined();
    expect(marker?.type).toBe('circle');
    expect(marker?.filter).toEqual(['==', ['get', 'kind'], 'position']);
  });

  it('accuracy outline paint is a continuous, legible stroke (width 1.5, opacity 0.8)', () => {
    overlay.attach(mock.engine);

    const line = mock.addedLayers.find((l) => l.id === 'gps-accuracy-line');
    expect(line).toBeDefined();
    expect(line?.type).toBe('line');
    expect(line?.paint).toEqual({
      'line-color': '#2563eb',
      'line-width': 1.5,
      'line-opacity': 0.8,
    });
  });

  it('updatePosition renders the marker point and a closed 64-segment accuracy polygon', () => {
    overlay.attach(mock.engine);
    overlay.updatePosition(mock.engine, -37.4779, -73.345, 50);

    const features = featuresOf(mock, 'gps-position');
    expect(features).toHaveLength(2);

    expect(features[0].geometry).toEqual({
      type: 'Point',
      coordinates: [-73.345, -37.4779],
    });
    expect(features[0].properties).toEqual({ kind: 'position' });

    const polygon = features[1].geometry;
    expect(polygon?.type).toBe('Polygon');
    expect(features[1].properties).toEqual({ kind: 'accuracy' });
    if (polygon?.type !== 'Polygon') throw new Error('expected Polygon');
    const ring = polygon.coordinates[0];
    // 64 segments + repeated first vertex = 65 positions.
    expect(ring).toHaveLength(65);
    expect(ring[64]).toEqual(ring[0]);
    // Radius scales with the reported accuracy (±1 % tolerance for the
    // cos(lat) factor and vertex rounding).
    const dLat = 50 / 111320;
    const latOffsets = ring.map(([, lat]) => Math.abs(lat - -37.4779));
    expect(Math.max(...latOffsets)).toBeCloseTo(dLat, 6);
    expect(Math.max(...latOffsets)).toBeLessThan(dLat * 1.01);
  });

  it('updatePosition resizes the accuracy polygon when accuracy changes', () => {
    overlay.attach(mock.engine);
    overlay.updatePosition(mock.engine, -37.4779, -73.345, 50);
    const firstRing = (() => {
      const g = featuresOf(mock, 'gps-position')[1].geometry;
      if (g?.type !== 'Polygon') throw new Error('expected Polygon');
      return g.coordinates[0];
    })();

    overlay.updatePosition(mock.engine, -37.4779, -73.345, 200);
    const secondRing = (() => {
      const g = featuresOf(mock, 'gps-position')[1].geometry;
      if (g?.type !== 'Polygon') throw new Error('expected Polygon');
      return g.coordinates[0];
    })();

    const spread = (ring: [number, number][]): number =>
      Math.max(...ring.map(([, lat]) => Math.abs(lat - -37.4779)));
    expect(spread(secondRing)).toBeGreaterThan(spread(firstRing) * 3);
  });

  it('updatePosition renders only the marker when accuracy is invalid', () => {
    overlay.attach(mock.engine);

    overlay.updatePosition(mock.engine, -37.4779, -73.345, 0);
    expect(featuresOf(mock, 'gps-position')).toHaveLength(1);

    overlay.updatePosition(mock.engine, -37.4779, -73.345, Number.NaN);
    const features = featuresOf(mock, 'gps-position');
    expect(features).toHaveLength(1);
    expect(features[0].geometry?.type).toBe('Point');
  });

  it('updateTrail renders a LineString from the given points', () => {
    overlay.attach(mock.engine);
    overlay.updateTrail(mock.engine, [
      [-73.345, -37.4779],
      [-73.3449, -37.478],
      [-73.3448, -37.4781],
    ]);

    const line = trailLineString(mock);
    expect(line.coordinates).toEqual([
      [-73.345, -37.4779],
      [-73.3449, -37.478],
      [-73.3448, -37.4781],
    ]);
  });

  it('updateTrail clears the source when fewer than 2 points are given', () => {
    overlay.attach(mock.engine);

    overlay.updateTrail(mock.engine, []);
    expect(featuresOf(mock, 'gps-trail')).toHaveLength(0);

    overlay.updateTrail(mock.engine, [[-73.345, -37.4779]]);
    expect(featuresOf(mock, 'gps-trail')).toHaveLength(0);
  });

  it('updateTrail caps the rendered trail at the configured maximum, drop-oldest', () => {
    overlay.attach(mock.engine);
    const cap = LOCATION_DEFAULTS.trailMaxPoints;
    const trail: [number, number][] = Array.from({ length: cap + 500 }, (_, i) => [
      -73.345 + i * 1e-6,
      -37.4779,
    ]);

    overlay.updateTrail(mock.engine, trail);

    const line = trailLineString(mock);
    expect(line.coordinates).toHaveLength(cap);
    // Oldest points were dropped: rendering starts 500 points in.
    expect(line.coordinates[0]).toEqual(trail[500]);
    expect(line.coordinates[cap - 1]).toEqual(trail[trail.length - 1]);
  });

  it('clearTrail empties the trail source without touching the position source', () => {
    overlay.attach(mock.engine);
    overlay.updatePosition(mock.engine, -37.4779, -73.345, 50);
    overlay.updateTrail(mock.engine, [
      [-73.345, -37.4779],
      [-73.3449, -37.478],
    ]);

    overlay.clearTrail(mock.engine);

    expect(featuresOf(mock, 'gps-trail')).toHaveLength(0);
    expect(featuresOf(mock, 'gps-position')).toHaveLength(2);
  });

  it('clearPosition empties the position source without touching the trail', () => {
    overlay.attach(mock.engine);
    overlay.updatePosition(mock.engine, -37.4779, -73.345, 50);
    overlay.updateTrail(mock.engine, [
      [-73.345, -37.4779],
      [-73.3449, -37.478],
    ]);

    overlay.clearPosition(mock.engine);

    expect(featuresOf(mock, 'gps-position')).toHaveLength(0);
    expect(featuresOf(mock, 'gps-trail')).toHaveLength(1);
  });

  it('updates before attach are no-ops', () => {
    overlay.updatePosition(mock.engine, -37.4779, -73.345, 50);
    overlay.updateTrail(mock.engine, [
      [-73.345, -37.4779],
      [-73.3449, -37.478],
    ]);

    expect(mock.updateGeoJsonSourceData).not.toHaveBeenCalled();
    expect(mock.addedSources).toHaveLength(0);
  });

  it('detach removes every layer and source once, idempotently', () => {
    overlay.attach(mock.engine);
    overlay.detach(mock.engine);
    overlay.detach(mock.engine);

    expect(mock.removedLayers).toEqual([
      'gps-marker',
      'gps-trail-line',
      'gps-accuracy-line',
      'gps-accuracy-fill',
    ]);
    expect(mock.removedSources).toEqual(['gps-position', 'gps-trail']);
    expect(overlay.isAttached()).toBe(false);
  });

  it('updates and clears after detach are no-ops', () => {
    overlay.attach(mock.engine);
    overlay.detach(mock.engine);
    mock.updateGeoJsonSourceData.mockClear();

    overlay.updatePosition(mock.engine, -37.4779, -73.345, 50);
    overlay.updateTrail(mock.engine, [
      [-73.345, -37.4779],
      [-73.3449, -37.478],
    ]);
    overlay.clearTrail(mock.engine);
    overlay.clearPosition(mock.engine);

    expect(mock.updateGeoJsonSourceData).not.toHaveBeenCalled();
  });
});
