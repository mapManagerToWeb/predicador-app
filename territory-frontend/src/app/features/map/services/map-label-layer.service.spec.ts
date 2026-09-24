import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapLabelLayerService } from './map-label-layer.service';
import { MapRenderingFacade, buildTerritorioMetadata } from './map-rendering.facade';
import type { MapEngine } from './map-engine.interface';

describe('MapLabelLayerService', () => {
  let service: MapLabelLayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MapLabelLayerService, MapRenderingFacade],
    });
    service = TestBed.inject(MapLabelLayerService);
    const facade = TestBed.inject(MapRenderingFacade);
    // Seed the facade metadata: territories 56 (two manzanas) and 57 (one).
    facade['metadata'] = buildTerritorioMetadata({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-73.3, -37.4],
                [-73.2, -37.4],
                [-73.2, -37.3],
                [-73.3, -37.3],
                [-73.3, -37.4],
              ],
            ],
          },
          properties: { territorio_padre: 56, id: '56-56.a' },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-73.1, -37.2],
                [-73.05, -37.2],
                [-73.05, -37.15],
                [-73.1, -37.15],
                [-73.1, -37.2],
              ],
            ],
          },
          properties: { territorio_padre: 56, id: '56-56.b' },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-72.9, -37.0],
                [-72.8, -37.0],
                [-72.8, -36.9],
                [-72.9, -36.9],
                [-72.9, -37.0],
              ],
            ],
          },
          properties: { territorio_padre: 57, id: '57-57.a' },
        },
      ],
    } as never);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initial state', () => {
    it('should not be initialized initially', () => {
      expect(service.isInitialized()).toBe(false);
    });
  });

  describe('initLabels', () => {
    it('should add a GeoJSON centroid source and a symbol layer', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      expect(mockEngine.addGeoJsonSource).toHaveBeenCalledTimes(1);
      expect(mockEngine.addGeoJsonSource.mock.calls[0][0]).toBe('territory-label-centroids');
      expect(mockEngine.addLayer).toHaveBeenCalledTimes(1);
    });

    it('should configure the symbol layer on the centroid source', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      const layer = mockEngine.addLayer.mock.calls[0][0];
      expect(layer.id).toBe('territory-labels');
      expect(layer.type).toBe('symbol');
      expect(layer.source).toBe('territory-label-centroids');
      expect(layer['source-layer']).toBeUndefined();
      expect(layer.minzoom).toBe(14);
    });

    it('should render the territory NUMBER property', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      const layer = mockEngine.addLayer.mock.calls[0][0];
      expect(layer.layout['text-field']).toEqual(['to-string', ['get', 'territorio']]);
    });

    it('should configure text-size to 12', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      const layer = mockEngine.addLayer.mock.calls[0][0];
      expect(layer.layout['text-size']).toBe(12);
    });

    it('should configure text-anchor to center', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      const layer = mockEngine.addLayer.mock.calls[0][0];
      expect(layer.layout['text-anchor']).toBe('center');
    });

    it('should enable collision-aware placement', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      const layer = mockEngine.addLayer.mock.calls[0][0];
      expect(layer.layout['symbol-avoid-edges']).toBe(true);
    });

    it('should configure text paint properties', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      const layer = mockEngine.addLayer.mock.calls[0][0];
      expect(layer.paint['text-color']).toBe('#1e293b');
      expect(layer.paint['text-halo-color']).toBe('#ffffff');
      expect(layer.paint['text-halo-width']).toBe(1);
    });

    it('should be idempotent', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);
      service.initLabels(mockEngine);

      expect(mockEngine.addLayer).toHaveBeenCalledTimes(1);
      expect(mockEngine.addGeoJsonSource).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateLabels', () => {
    it('sends only the selected territories centroids when a selection exists', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      service.updateLabels(mockEngine, [56]);

      expect(mockEngine.updateGeoJsonSourceData).toHaveBeenCalledTimes(1);
      const [sourceId, collection] = mockEngine.updateGeoJsonSourceData.mock.calls[0];
      expect(sourceId).toBe('territory-label-centroids');
      const numeros = collection.features.map(f => f.properties.territorio);
      expect(numeros).toEqual([56]);
      // Centroid of territory 56 = bounds center of its two manzanas.
      expect(collection.features[0].geometry.coordinates).toEqual([-73.175, -37.275]);
    });

    it('sends all centroids when the selection is empty', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      service.updateLabels(mockEngine, []);

      const [, collection] = mockEngine.updateGeoJsonSourceData.mock.calls[0];
      const numeros = collection.features.map(f => f.properties.territorio);
      expect(numeros.sort()).toEqual([56, 57]);
    });

    it('is a no-op before initLabels', () => {
      const mockEngine = createMockMapEngine();
      service.updateLabels(mockEngine, [56]);

      expect(mockEngine.updateGeoJsonSourceData).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should remove the label layer and the centroid source', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);
      service.destroy(mockEngine);

      expect(mockEngine.removeLayer).toHaveBeenCalledWith('territory-labels');
      expect(mockEngine.removeSource).toHaveBeenCalledWith('territory-label-centroids');
      expect(service.isInitialized()).toBe(false);
    });

    it('should be a no-op when not initialized', () => {
      const mockEngine = createMockMapEngine();
      service.destroy(mockEngine);

      expect(mockEngine.removeLayer).not.toHaveBeenCalled();
    });

    it('should be idempotent', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);
      service.destroy(mockEngine);
      service.destroy(mockEngine);

      expect(mockEngine.removeLayer).toHaveBeenCalledTimes(1);
    });

    it('should not throw if layer or source does not exist', () => {
      const mockEngine = createMockMapEngine();
      mockEngine.removeLayer.mockImplementation(() => {
        throw new Error('Layer not found');
      });
      mockEngine.removeSource.mockImplementation(() => {
        throw new Error('Source not found');
      });
      service.initLabels(mockEngine);

      expect(() => service.destroy(mockEngine)).not.toThrow();
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