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

    it('should use coalesce color expressions (no feature-state amber) on both fill layers', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);

      const coalesceColor = ['coalesce', ['get', 'color'], '#94a3b8'];

      const layerCalls = mockEngine.addLayer.mock.calls as [
        { id: string; paint: Record<string, unknown> },
      ][];
      const manzanaFill = layerCalls.find(call => call[0].id === 'territory-fill');
      expect(manzanaFill?.[0].paint['fill-color']).toEqual(coalesceColor);
      expect(manzanaFill?.[0].paint['fill-outline-color']).toEqual(coalesceColor);

      const dissolvedFill = layerCalls.find(call => call[0].id === 'territory-dissolved-fill');
      expect(dissolvedFill?.[0].paint['fill-color']).toEqual(coalesceColor);
      expect(dissolvedFill?.[0].paint['fill-outline-color']).toEqual(coalesceColor);
    });

    it('should seed the base completion opacity expression on both fill layers', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);

      const layerCalls = mockEngine.addLayer.mock.calls as [
        { id: string; paint: Record<string, unknown> },
      ][];
      const manzanaFill = layerCalls.find(call => call[0].id === 'territory-fill');
      expect(manzanaFill?.[0].paint['fill-opacity']).toEqual(
        ['case', ['in', ['get', 'territorio'], ['literal', []]], 0.6, 0.05],
      );

      const dissolvedFill = layerCalls.find(call => call[0].id === 'territory-dissolved-fill');
      expect(dissolvedFill?.[0].paint['fill-opacity']).toEqual(
        ['case', ['in', ['get', 'tid'], ['literal', []]], 0.6, 0.05],
      );
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

  describe('getBaseTileUrl', () => {
    it('strips the ?v= cache-buster from the configured template', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine, '/tiles/{z}/{x}/{y}.pbf?v=99');
      expect(service.getBaseTileUrl()).toBe('/tiles/{z}/{x}/{y}.pbf');
    });

    it('strips the version from the URL after a versioned update', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine, '/tiles/{z}/{x}/{y}.pbf');
      service.updateTileUrl(mockEngine, '/tiles/{z}/{x}/{y}.pbf?v=12345');
      expect(service.getBaseTileUrl()).toBe('/tiles/{z}/{x}/{y}.pbf');
    });
  });

  describe('setTerritoryFillOpacity', () => {
    it('should set paint property on both fill layers with the proper key', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);
      service.setTerritoryFillOpacity(mockEngine, 5, 0.9);
      expect(mockEngine.setPaintProperty).toHaveBeenCalledWith(
        'territory-fill',
        'fill-opacity',
        expect.arrayContaining(['match', ['get', 'territorio'], 5, 0.9, 0.6]),
      );
      expect(mockEngine.setPaintProperty).toHaveBeenCalledWith(
        'territory-dissolved-fill',
        'fill-opacity',
        expect.arrayContaining(['match', ['get', 'tid'], 5, 0.9, 0.6]),
      );
    });
  });

  describe('resetFillOpacity', () => {
    it('should set the completion-driven opacity on both fill layers', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);
      service.resetFillOpacity(mockEngine, [1, 2]);
      expect(mockEngine.setPaintProperty).toHaveBeenCalledWith(
        'territory-fill',
        'fill-opacity',
        ['case', ['in', ['get', 'territorio'], ['literal', [1, 2]]], 0.6, 0.05],
      );
      expect(mockEngine.setPaintProperty).toHaveBeenCalledWith(
        'territory-dissolved-fill',
        'fill-opacity',
        ['case', ['in', ['get', 'tid'], ['literal', [1, 2]]], 0.6, 0.05],
      );
    });

    it('should restore the base 1px line width on both line layers', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);
      service.resetFillOpacity(mockEngine, []);
      expect(mockEngine.setPaintProperty).toHaveBeenCalledWith('territory-line', 'line-width', 1);
      expect(mockEngine.setPaintProperty).toHaveBeenCalledWith(
        'territory-dissolved-line',
        'line-width',
        1,
      );
    });
  });

  describe('setCompletionOpacity', () => {
    it('should apply 0.6 for completed territories and 0.05 otherwise on both fill layers', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);
      service.setCompletionOpacity(mockEngine, [3]);
      expect(mockEngine.setPaintProperty).toHaveBeenCalledWith(
        'territory-fill',
        'fill-opacity',
        ['case', ['in', ['get', 'territorio'], ['literal', [3]]], 0.6, 0.05],
      );
      expect(mockEngine.setPaintProperty).toHaveBeenCalledWith(
        'territory-dissolved-fill',
        'fill-opacity',
        ['case', ['in', ['get', 'tid'], ['literal', [3]]], 0.6, 0.05],
      );
    });
  });

  describe('setSelectedTerritoriesOpacity', () => {
    it('should hide non-selected territories and render selected ones by completeness', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);
      service.setSelectedTerritoriesOpacity(mockEngine, [1, 2], [1]);
      expect(mockEngine.setPaintProperty).toHaveBeenCalledWith(
        'territory-fill',
        'fill-opacity',
        [
          'case',
          ['in', ['get', 'territorio'], ['literal', [1, 2]]],
          ['case', ['in', ['get', 'territorio'], ['literal', [1]]], 0.6, 0.05],
          0,
        ],
      );
      expect(mockEngine.setPaintProperty).toHaveBeenCalledWith(
        'territory-dissolved-fill',
        'fill-opacity',
        [
          'case',
          ['in', ['get', 'tid'], ['literal', [1, 2]]],
          ['case', ['in', ['get', 'tid'], ['literal', [1]]], 0.6, 0.05],
          0,
        ],
      );
    });

    it('should zero the line width for non-selected territories on both line layers', () => {
      const mockEngine = createMockMapEngine();
      service.initLayers(mockEngine);
      service.setSelectedTerritoriesOpacity(mockEngine, [1], [1]);
      expect(mockEngine.setPaintProperty).toHaveBeenCalledWith(
        'territory-line',
        'line-width',
        ['case', ['in', ['get', 'territorio'], ['literal', [1]]], 1, 0],
      );
      expect(mockEngine.setPaintProperty).toHaveBeenCalledWith(
        'territory-dissolved-line',
        'line-width',
        ['case', ['in', ['get', 'tid'], ['literal', [1]]], 1, 0],
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
