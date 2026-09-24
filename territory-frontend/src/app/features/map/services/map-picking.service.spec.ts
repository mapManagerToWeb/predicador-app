import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapPickingService } from './map-picking.service';
import type { MapEngine } from './map-engine.interface';
import type { MapGeoJSONFeature, LngLatBoundsLike } from 'maplibre-gl';

function createMockEngine(): MapEngine {
  return {
    queryRenderedFeatures: vi.fn().mockReturnValue([]),
    setFeatureState: vi.fn(),
    removeFeatureState: vi.fn(),
    captureCanvas: vi.fn().mockResolvedValue(null),
    init: vi.fn(),
    addSource: vi.fn(),
    addGeoJsonSource: vi.fn(),
    updateGeoJsonSourceData: vi.fn(),
    project: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    removeSource: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    fitBounds: vi.fn(),
    getZoom: vi.fn().mockReturnValue(14),
    setZoom: vi.fn(),
    getCenter: vi.fn().mockReturnValue({ lng: -73, lat: -37 } as import('maplibre-gl').LngLat),
    setCenter: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    setSourceUrl: vi.fn(),
  };
}

function fakeFeature(id: string | number, props: Record<string, unknown> = {}): MapGeoJSONFeature {
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    properties: props,
    layer: { id: 'manzana', source: 'territories', 'source-layer': 'manzana' },
    source: 'territories',
    sourceLayer: 'manzana',
  } as unknown as MapGeoJSONFeature;
}

describe('MapPickingService', () => {
  let service: MapPickingService;
  let engine: MapEngine;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MapPickingService);
    engine = createMockEngine();
  });

  describe('queryAt', () => {
    it('returns the first feature when features are found', () => {
      const feature = fakeFeature(42);
      vi.mocked(engine.queryRenderedFeatures).mockReturnValue([feature]);

      const result = service.queryAt([100, 200], engine);

      expect(result).toBe(feature);
      expect(engine.queryRenderedFeatures).toHaveBeenCalledWith([100, 200], {
        layers: ['territory-fill', 'territory-dissolved-fill'],
      });
    });

    it('returns null when no features are found', () => {
      vi.mocked(engine.queryRenderedFeatures).mockReturnValue([]);

      const result = service.queryAt([100, 200], engine);

      expect(result).toBeNull();
    });
  });

  describe('queryNear', () => {
    it('returns all features within the bounding box', () => {
      const f1 = fakeFeature(1);
      const f2 = fakeFeature(2);
      vi.mocked(engine.queryRenderedFeatures).mockReturnValue([f1, f2]);
      const bounds: LngLatBoundsLike = [[-73.1, -37.1], [-73.0, -37.0]];

      const result = service.queryNear(bounds, engine);

      expect(result).toEqual([f1, f2]);
      expect(engine.queryRenderedFeatures).toHaveBeenCalledWith(bounds, {
        layers: ['territory-fill', 'territory-dissolved-fill'],
      });
    });

    it('returns empty array when no features are in the bbox', () => {
      vi.mocked(engine.queryRenderedFeatures).mockReturnValue([]);

      const result = service.queryNear([[0, 0], [1, 1]], engine);

      expect(result).toEqual([]);
    });
  });

  describe('highlightFeature', () => {
    it('calls setFeatureState with selected: true', () => {
      service.highlightFeature(engine, 42);

      expect(engine.setFeatureState).toHaveBeenCalledWith(
        'territories',
        'manzana',
        42,
        { selected: true },
      );
    });

    it('works with string ids', () => {
      service.highlightFeature(engine, 'abc-123');

      expect(engine.setFeatureState).toHaveBeenCalledWith(
        'territories',
        'manzana',
        'abc-123',
        { selected: true },
      );
    });

    it('does NOT call setFeatureState for missing/empty ids (dissolved features)', () => {
      service.highlightFeature(engine, '');
      service.highlightFeature(engine, undefined as unknown as string);
      service.highlightFeature(engine, null as unknown as string);

      expect(engine.setFeatureState).not.toHaveBeenCalled();
    });
  });

  describe('clearHighlight', () => {
    it('calls removeFeatureState for a specific feature', () => {
      service.clearHighlight(engine, 42);

      expect(engine.removeFeatureState).toHaveBeenCalledWith(
        'territories',
        'manzana',
        42,
      );
    });

    it('calls removeFeatureState without id to clear all', () => {
      service.clearHighlight(engine);

      expect(engine.removeFeatureState).toHaveBeenCalledWith(
        'territories',
        'manzana',
        undefined,
      );
    });
  });

  describe('constants', () => {
    it('SOURCE_ID matches the tile source name', () => {
      expect(MapPickingService.SOURCE_ID).toBe('territories');
    });

    it('SOURCE_LAYER_MANZANA matches the tile source-layer name', () => {
      expect(MapPickingService.SOURCE_LAYER_MANZANA).toBe('manzana');
    });

    it('PICKABLE_LAYER_IDS contains the fill layer IDs', () => {
      expect(MapPickingService.PICKABLE_LAYER_IDS).toEqual([
        'territory-fill',
        'territory-dissolved-fill',
      ]);
    });
  });
});
