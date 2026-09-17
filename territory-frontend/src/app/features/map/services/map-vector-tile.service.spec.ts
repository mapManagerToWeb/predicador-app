import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapVectorTileService } from './map-vector-tile.service';
import { MaplibreEngineService } from './maplibre-engine.service';
import type { MapEngine } from './map-engine.interface';

describe('MapVectorTileService', () => {
  let service: MapVectorTileService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MapVectorTileService, MaplibreEngineService],
    });
    service = TestBed.inject(MapVectorTileService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initial state', () => {
    it('should not be initialized initially', () => {
      expect(service.isInitialized()).toBe(false);
    });
  });

  describe('initLayers', () => {
    it('should initialize with MapLibre engine', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);
      expect(service.isInitialized()).toBe(true);
      expect(mockEngine.addSource).toHaveBeenCalledWith(
        'territories',
        '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
      );
    });

    it('should be idempotent', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);
      service.initLayers(mockEngine);
      // addSource should only be called once
      expect(mockEngine.addSource).toHaveBeenCalledTimes(1);
    });

    it('should use custom tile URL when provided', () => {
      const mockEngine = createMockMapEngine();
      const customUrl = '/custom/tiles/{z}/{x}/{y}.pbf';
      service.initLayers(mockEngine, customUrl);
      expect(mockEngine.addSource).toHaveBeenCalledWith('territories', customUrl);
    });

    it('should add fill and line layers for manzana and territorio', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);

      const layerCalls = mockEngine.addLayer.mock.calls;
      const layerIds = layerCalls.map((call: [{ id: string }]) => call[0].id);
      expect(layerIds).toContain('territory-fill');
      expect(layerIds).toContain('territory-line');
      expect(layerIds).toContain('territory-dissolved-fill');
      expect(layerIds).toContain('territory-dissolved-line');
    });
  });

  describe('updateTileUrl', () => {
    it('should call setSourceUrl on MapLibre engine', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);
      service.updateTileUrl(mockEngine, '/new/tiles/{z}/{x}/{y}.pbf?v=123');
      expect(mockEngine.setSourceUrl).toHaveBeenCalledWith(
        'territories',
        '/new/tiles/{z}/{x}/{y}.pbf?v=123',
      );
    });
  });

  describe('setTerritoryFillOpacity', () => {
    it('should set paint property on MapLibre engine', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);
      service.setTerritoryFillOpacity(mockEngine, 5, 0.9);
      expect(mockEngine.setPaintProperty).toHaveBeenCalledWith(
        'territory-fill',
        'fill-opacity',
        expect.arrayContaining(['match', expect.anything(), 5, 0.9, 0.6]),
      );
    });
  });

  describe('resetFillOpacity', () => {
    it('should set default opacity on MapLibre engine', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);
      service.resetFillOpacity(mockEngine);
      expect(mockEngine.setPaintProperty).toHaveBeenCalledWith(
        'territory-fill',
        'fill-opacity',
        0.6,
      );
    });
  });

  describe('destroy', () => {
    it('should remove layers and source from MapLibre engine', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);
      service.destroy(mockEngine);

      expect(mockEngine.removeLayer).toHaveBeenCalledTimes(4);
      expect(mockEngine.removeSource).toHaveBeenCalledWith('territories');
      expect(service.isInitialized()).toBe(false);
    });

    it('should be idempotent', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);
      service.destroy(mockEngine);
      service.destroy(mockEngine);
      // Should not throw
    });
  });

  describe('static constants', () => {
    it('should expose SOURCE_ID', () => {
      expect(MapVectorTileService.SOURCE_ID).toBe('territories');
    });

    it('should expose SOURCE_LAYER_MANZANA', () => {
      expect(MapVectorTileService.SOURCE_LAYER_MANZANA).toBe('manzana');
    });

    it('should expose SOURCE_LAYER_TERRITORIO', () => {
      expect(MapVectorTileService.SOURCE_LAYER_TERRITORIO).toBe('territorio');
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
