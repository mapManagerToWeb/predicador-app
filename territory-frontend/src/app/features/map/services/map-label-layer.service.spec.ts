import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapLabelLayerService } from './map-label-layer.service';
import type { MapEngine } from './map-engine.interface';

describe('MapLabelLayerService', () => {
  let service: MapLabelLayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MapLabelLayerService],
    });
    service = TestBed.inject(MapLabelLayerService);
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
    it('should add a symbol layer with correct configuration', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      expect(mockEngine.addLayer).toHaveBeenCalledTimes(1);
      const layer = mockEngine.addLayer.mock.calls[0][0];
      expect(layer.id).toBe('territory-labels');
      expect(layer.type).toBe('symbol');
      expect(layer.source).toBe('territories');
      expect(layer['source-layer']).toBe('manzana');
      expect(layer.minzoom).toBe(14);
    });

    it('should configure text-field from the bloque property with empty fallback', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      const layer = mockEngine.addLayer.mock.calls[0][0];
      expect(layer.layout['text-field']).toEqual(['coalesce', ['get', 'bloque'], '']);
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
    });
  });

  describe('destroy', () => {
    it('should remove the label layer', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);
      service.destroy(mockEngine);

      expect(mockEngine.removeLayer).toHaveBeenCalledWith('territory-labels');
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

    it('should not throw if layer does not exist', () => {
      const mockEngine = createMockMapEngine();
      mockEngine.removeLayer.mockImplementation(() => {
        throw new Error('Layer not found');
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
  };
}
