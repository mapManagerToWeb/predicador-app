import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapMarkedOverlayService, matchMarkedFeature } from './map-marked-overlay.service';
import type { MapEngine } from './map-engine.interface';
import type { ManzanaMarcada } from '../types/map.types';
import type * as GeoJSON from 'geojson';

describe('MapMarkedOverlayService', () => {
  let service: MapMarkedOverlayService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MapMarkedOverlayService],
    });
    service = TestBed.inject(MapMarkedOverlayService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should not be initialized initially', () => {
    expect(service.isInitialized()).toBe(false);
  });

  describe('matchMarkedFeature', () => {
    const features: GeoJSON.Feature[] = [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [] },
        properties: { fid: 554, id: '56-56.b', nombre_bloque: '56.b' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [] },
        properties: { fid: 555, id: '56-56.c', nombre_bloque: '56.c' },
      },
    ];

    function mark(partial: Partial<ManzanaMarcada>): ManzanaMarcada {
      return { id: '', nombreBloque: '', color: '#fff', territorioNumero: 56, ...partial };
    }

    it('matches a numeric MVT fid mark against the fid property', () => {
      expect(matchMarkedFeature(mark({ id: '554' }), features)?.properties?.['id']).toBe('56-56.b');
    });

    it('matches a legacy "{t}-{b}" mark against the id property', () => {
      expect(matchMarkedFeature(mark({ id: '56-56.c' }), features)?.properties?.['fid']).toBe(555);
    });

    it('matches a mark whose nombreBloque equals nombre_bloque', () => {
      expect(matchMarkedFeature(mark({ id: '', nombreBloque: '56.b' }), features)?.properties?.['fid']).toBe(554);
    });

    it('returns null when no feature matches', () => {
      expect(matchMarkedFeature(mark({ id: '999' }), features)).toBeNull();
    });

    it('returns null for an empty feature list', () => {
      expect(matchMarkedFeature(mark({ id: '554' }), [])).toBeNull();
    });
  });

  describe('initOverlay', () => {
    it('adds the marked source and fill/line layers with the parity paints', () => {
      const mockEngine = createMockMapEngine();
      service.initOverlay(mockEngine);

      expect(mockEngine.addGeoJsonSource).toHaveBeenCalledWith('marked', {
        type: 'FeatureCollection',
        features: [],
      });

      const layerCalls = mockEngine.addLayer.mock.calls as [
        { id: string; type: string; source: string; paint: Record<string, unknown> },
      ][];
      const fill = layerCalls.find(call => call[0].id === 'marked-fill');
      expect(fill?.[0].type).toBe('fill');
      expect(fill?.[0].source).toBe('marked');
      expect(fill?.[0].paint['fill-opacity']).toEqual(['case', ['get', 'completo'], 0.95, 0.85]);

      const line = layerCalls.find(call => call[0].id === 'marked-line');
      expect(line?.[0].type).toBe('line');
      expect(line?.[0].source).toBe('marked');
      expect(line?.[0].paint['line-width']).toBe(3);

      expect(service.isInitialized()).toBe(true);
    });

    it('is idempotent', () => {
      const mockEngine = createMockMapEngine();
      service.initOverlay(mockEngine);
      service.initOverlay(mockEngine);
      expect(mockEngine.addGeoJsonSource).toHaveBeenCalledTimes(1);
      expect(mockEngine.addLayer).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateOverlay', () => {
    it('pushes the feature collection through the engine', () => {
      const mockEngine = createMockMapEngine();
      service.initOverlay(mockEngine);

      const features: GeoJSON.Feature[] = [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [] },
          properties: { fid: 554, color: '#ff0000', completo: true },
        },
      ];
      service.updateOverlay(mockEngine, features);

      expect(mockEngine.updateGeoJsonSourceData).toHaveBeenCalledWith('marked', {
        type: 'FeatureCollection',
        features,
      });
    });

    it('no-ops before initOverlay', () => {
      const mockEngine = createMockMapEngine();
      service.updateOverlay(mockEngine, []);
      expect(mockEngine.updateGeoJsonSourceData).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('removes the layers and source, resetting initialization', () => {
      const mockEngine = createMockMapEngine();
      service.initOverlay(mockEngine);
      service.destroy(mockEngine);

      expect(mockEngine.removeLayer).toHaveBeenCalledWith('marked-fill');
      expect(mockEngine.removeLayer).toHaveBeenCalledWith('marked-line');
      expect(mockEngine.removeSource).toHaveBeenCalledWith('marked');
      expect(service.isInitialized()).toBe(false);
    });

    it('is idempotent', () => {
      const mockEngine = createMockMapEngine();
      service.destroy(mockEngine);
      service.destroy(mockEngine);
      expect(mockEngine.removeSource).not.toHaveBeenCalled();
    });

    it('re-initializes on a fresh engine after destroy (2nd map visit)', () => {
      const engineA = createMockMapEngine();
      const engineB = createMockMapEngine();
      service.initOverlay(engineA);
      service.destroy(engineA);

      service.initOverlay(engineB);

      expect(engineB.addGeoJsonSource).toHaveBeenCalledWith(
        'marked',
        expect.objectContaining({ type: 'FeatureCollection' }),
      );
      expect(engineB.addLayer).toHaveBeenCalledTimes(2);
      expect(service.isInitialized()).toBe(true);
    });
  });
});

function createMockMapEngine(): MapEngine {
  return {
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
    setSourceUrl: vi.fn(),
    queryRenderedFeatures: vi.fn().mockReturnValue([]),
    on: vi.fn(),
    off: vi.fn(),
    fitBounds: vi.fn(),
    getZoom: vi.fn().mockReturnValue(15),
    setZoom: vi.fn(),
    getCenter: vi.fn().mockReturnValue({ lng: 0, lat: 0 }),
    setCenter: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    setFeatureState: vi.fn(),
    removeFeatureState: vi.fn(),
    captureCanvas: vi.fn().mockResolvedValue(null),
  };
}