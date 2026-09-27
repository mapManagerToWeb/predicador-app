import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapLabelLayerService } from './map-label-layer.service';
import { MapRenderingFacade, buildTerritorioMetadata } from './map-rendering.facade';
import { TerritorioService } from '../../../core/services/territorio';
import { getColorForTerritorio } from '../../../core/models/territory-colors';
import type { LayerSpecification, MapEngine } from './map-engine.interface';

function layerById(mock: MapEngine, id: string): LayerSpecification {
  const calls = (mock.addLayer as ReturnType<typeof vi.fn>).mock.calls as [
    LayerSpecification,
  ][];
  const layer = calls.map((c) => c[0]).find((l) => l.id === id);
  if (!layer) throw new Error(`layer ${id} was not added`);
  return layer;
}

describe('MapLabelLayerService', () => {
  let service: MapLabelLayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MapLabelLayerService,
        MapRenderingFacade,
        { provide: TerritorioService, useValue: { getTerritoryMetadata: vi.fn() } },
      ],
    });
    service = TestBed.inject(MapLabelLayerService);
    const facade = TestBed.inject(MapRenderingFacade);
    // Seed the facade metadata: territories 56 (two manzanas) and 57 (one).
    facade['metadata'] = buildTerritorioMetadata([
      {
        numero: 56,
        nombre: 'Territorio 56',
        color: '#00A86B',
        bounds: [-73.3, -37.4, -73.05, -37.15],
        center: [-73.175, -37.275],
        manzanaCount: 2,
        fids: [5541, 5542],
      },
      {
        numero: 57,
        nombre: 'Territorio 57',
        color: '#3b82f6',
        bounds: [-72.9, -37.0, -72.8, -36.9],
        center: [-72.85, -36.95],
        manzanaCount: 1,
        fids: [5543],
      },
    ]);
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
    it('should add a GeoJSON centroid source, the badge circle layer, and the symbol layer', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      expect(mockEngine.addGeoJsonSource).toHaveBeenCalledTimes(1);
      expect(mockEngine.addGeoJsonSource.mock.calls[0][0]).toBe('territory-label-centroids');
      expect(mockEngine.addLayer).toHaveBeenCalledTimes(2);
      expect(mockEngine.addLayer.mock.calls[0][0].id).toBe('territory-label-badge');
      expect(mockEngine.addLayer.mock.calls[1][0].id).toBe('territory-labels');
    });

    it('should configure a white badge disc with a territory-colored ring on the centroid source', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      const badge = mockEngine.addLayer.mock.calls[0][0];
      expect(badge.id).toBe('territory-label-badge');
      expect(badge.type).toBe('circle');
      expect(badge.source).toBe('territory-label-centroids');
      expect(badge.minzoom).toBe(14);
      expect(badge.paint['circle-radius']).toBe(12);
      expect(badge.paint['circle-color']).toBe('#ffffff');
      expect(badge.paint['circle-stroke-color']).toEqual([
        'coalesce',
        ['get', 'color'],
        '#475569',
      ]);
      expect(badge.paint['circle-stroke-width']).toBe(1.5);
    });

    it('should add the badge BEFORE the symbol layer so the number paints on top', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      const order = mockEngine.addLayer.mock.calls.map((c) => c[0].id);
      expect(order).toEqual(['territory-label-badge', 'territory-labels']);
    });

    it('should configure the symbol layer on the centroid source', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      const layer = layerById(mockEngine, 'territory-labels');
      expect(layer.type).toBe('symbol');
      expect(layer.source).toBe('territory-label-centroids');
      expect(layer['source-layer']).toBeUndefined();
      expect(layer.minzoom).toBe(14);
    });

    it('should render the territory NUMBER property', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      const layer = layerById(mockEngine, 'territory-labels');
      expect(layer.layout['text-field']).toEqual(['to-string', ['get', 'territorio']]);
    });

    it('should configure text-size to 12', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      const layer = layerById(mockEngine, 'territory-labels');
      expect(layer.layout['text-size']).toBe(12);
    });

    it('should configure text-anchor to center', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      const layer = layerById(mockEngine, 'territory-labels');
      expect(layer.layout['text-anchor']).toBe('center');
    });

    it('should enable collision-aware placement', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      const layer = layerById(mockEngine, 'territory-labels');
      expect(layer.layout['symbol-avoid-edges']).toBe(true);
    });

    it('should paint the number in the territory color with a dark contrast halo', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);

      const layer = layerById(mockEngine, 'territory-labels');
      expect(layer.paint['text-color']).toEqual([
        'coalesce',
        ['get', 'color'],
        '#475569',
      ]);
      expect(layer.paint['text-halo-color']).toBe('rgba(0,0,0,0.45)');
      expect(layer.paint['text-halo-width']).toBe(1);
    });

    it('should be idempotent', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);
      service.initLabels(mockEngine);

      expect(mockEngine.addLayer).toHaveBeenCalledTimes(2);
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
      // Centroid of territory 56 = the metadata `center` for its two manzanas.
      expect(collection.features[0].geometry.coordinates).toEqual([-73.175, -37.275]);
    });

    it('writes the backend territory color onto each centroid feature', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);
      // Seed the backend color map (populated in prod via /territories/colors).
      const facade = TestBed.inject(MapRenderingFacade);
      facade['featureLayers'].set(56, {
        territorioPadre: 56,
        color: '#00A86B',
        layer: null as never,
      });

      service.updateLabels(mockEngine, []);

      const [, collection] = mockEngine.updateGeoJsonSourceData.mock.calls[0];
      const colors = new Map(
        collection.features.map((f) => [f.properties.territorio, f.properties.color]),
      );
      // Backend color wins when present...
      expect(colors.get(56)).toBe('#00A86B');
      // ...otherwise the TERRITORY_COLORS cycle fallback applies.
      expect(colors.get(57)).toBe(getColorForTerritorio(57, null));
      expect(colors.get(57)).toMatch(/^#[0-9a-fA-F]{6}$/);
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
    it('should remove both label layers and the centroid source', () => {
      const mockEngine = createMockMapEngine();
      service.initLabels(mockEngine);
      service.destroy(mockEngine);

      expect(mockEngine.removeLayer).toHaveBeenCalledWith('territory-labels');
      expect(mockEngine.removeLayer).toHaveBeenCalledWith('territory-label-badge');
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

      // One removal per layer (badge + symbol) on the first destroy only.
      expect(mockEngine.removeLayer).toHaveBeenCalledTimes(2);
      expect(mockEngine.removeSource).toHaveBeenCalledTimes(1);
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