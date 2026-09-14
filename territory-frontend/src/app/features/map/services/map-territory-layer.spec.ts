import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Layer } from 'leaflet';
import { MapTerritoryLayerService } from './map-territory-layer.service';
import { MapEngineService } from './map-engine.service';

// Mock de Leaflet para poder ejercitar addTerritoryLayer (requiere un mapa).
// El bbox devuelto por polygonCtor coincide con el geoJson de los tests de
// integración (manzana m1: [-34.5,-34.4] × [-58.5,-58.4]).
const { fakeMap, fakeGeoJson, fakeMarker, fakeLatLngBounds, polygonCtor } = vi.hoisted(() => {
  const map = {
    getBounds: vi.fn(() => ({ pad: vi.fn(() => ({ intersects: vi.fn(() => true) })) })),
    getZoom: vi.fn(() => 15),
    setView: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    remove: vi.fn(),
  };
  // initializeMap encadena new Map(...).setView(...); setView debe devolver el mapa.
  map.setView.mockReturnValue(map);
  const geoJson = { addTo: vi.fn(), remove: vi.fn() };
  const marker = { addTo: vi.fn(), remove: vi.fn(), setOpacity: vi.fn() };
  // addTerritoryLabel encadena new Marker(...).addTo(map); addTo debe devolver el marker.
  marker.addTo.mockReturnValue(marker);
  const bounds = {
    isValid: vi.fn(() => true),
    intersects: vi.fn(() => true),
    getCenter: vi.fn(() => ({ lat: 0, lng: 0 })),
  };
  const polygonCtor = vi.fn().mockImplementation(function (this: { getLatLngs?: unknown; on?: unknown }) {
    // Retornar `this` (no un objeto literal) preserva el prototype del mock,
    // necesario para que `l instanceof Polygon` sea true en onEachFeature.
    this.getLatLngs = vi.fn(() => [
      [
        { lat: -34.5, lng: -58.5 },
        { lat: -34.5, lng: -58.4 },
        { lat: -34.4, lng: -58.4 },
        { lat: -34.4, lng: -58.5 },
      ],
    ]);
    this.on = vi.fn();
    return this;
  });
  return { fakeMap: map, fakeGeoJson: geoJson, fakeMarker: marker, fakeLatLngBounds: bounds, polygonCtor };
});

vi.mock('leaflet', () => ({
  Map: vi.fn().mockImplementation(function () {
    return fakeMap;
  }),
  Canvas: vi.fn().mockImplementation(function () {
    return {};
  }),
  GeoJSON: vi.fn().mockImplementation(function (
    data: unknown,
    options: { onEachFeature?: (feature: unknown, layer: unknown) => void }
  ) {
    // Simula el recorrido de Leaflet: llama onEachFeature por cada feature con un Polygon.
    if (options?.onEachFeature && data && typeof data === 'object' && 'features' in data) {
      const fc = data as { features: unknown[] };
      for (const f of fc.features) {
        options.onEachFeature(f, new polygonCtor());
      }
    }
    return fakeGeoJson;
  }),
  Marker: vi.fn().mockImplementation(function () {
    return fakeMarker;
  }),
  DivIcon: vi.fn().mockImplementation(function () {
    return {};
  }),
  LatLng: vi.fn().mockImplementation(function (lat: number, lng: number) {
    return { lat, lng };
  }),
  LatLngBounds: vi.fn().mockImplementation(function () {
    return fakeLatLngBounds;
  }),
  Polygon: polygonCtor,
}));

describe('MapTerritoryLayerService', () => {
  let service: MapTerritoryLayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MapTerritoryLayerService, MapEngineService],
    });
    service = TestBed.inject(MapTerritoryLayerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initial state', () => {
    it('should have empty manzana index', () => {
      expect(service.getManzanaIndex()).toEqual([]);
    });

    it('should have empty all territories layer', () => {
      expect(service.getAllTerritoriesLayer()).toEqual([]);
    });

    it('should have empty territory data cache', () => {
      expect(service.getTerritoryDataCache().size).toBe(0);
    });

    it('should have empty territory labels', () => {
      expect(service.getTerritoryLabels()).toEqual([]);
    });
  });

  describe('getManzanaCountByTerritorio', () => {
    it('should return 0 for unknown territory', () => {
      expect(service.getManzanaCountByTerritorio(999)).toBe(0);
    });
  });

  describe('getFeatureLayerByTerritorio', () => {
    it('should return undefined for unknown territory', () => {
      expect(service.getFeatureLayerByTerritorio(999)).toBeUndefined();
    });
  });

  describe('clearAllLayers', () => {
    it('should reset all state', () => {
      service.clearAllLayers();
      expect(service.getManzanaIndex()).toEqual([]);
      expect(service.getAllTerritoriesLayer()).toEqual([]);
      expect(service.getTerritoryDataCache().size).toBe(0);
      expect(service.getTerritoryLabels()).toEqual([]);
    });
  });

  describe('extra layers', () => {
    it('should add and remove extra layers', () => {
      const layer1 = { remove: () => {} } as unknown as Layer;
      const layer2 = { remove: () => {} } as unknown as Layer;

      service.addExtraLayer(layer1);
      service.addExtraLayer(layer2);
      expect(() => service.removeExtraLayer(layer1)).not.toThrow();
      expect(() => service.clearExtraLayers()).not.toThrow();
    });
  });

  describe('manzana click handler', () => {
    it('should accept and clear click handler', () => {
      const handler = vi.fn();
      expect(() => service.setManzanaClickHandler(handler)).not.toThrow();
      expect(() => service.setManzanaClickHandler(null)).not.toThrow();
    });
  });

  describe('loadAllTerritories', () => {
    const geoJson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'm1', territorio_padre: 1, color: '#ff0000' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-58.5, -34.5],
                [-58.4, -34.5],
                [-58.4, -34.4],
                [-58.5, -34.4],
              ],
            ],
          },
        },
      ],
    });

    function makeService() {
      return { getAllGeoJson: vi.fn().mockResolvedValue(geoJson) };
    }

    beforeEach(() => {
      sessionStorage.clear();
    });

    it('should throw on invalid input', async () => {
      const territorioService = { getAllGeoJson: vi.fn().mockResolvedValue('{ broken') };
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(service.loadAllTerritories(territorioService)).rejects.toThrow();
      spy.mockRestore();
    });

    it('should fetch, parse and populate the cache when session cache is empty', async () => {
      const territorioService = makeService();
      await service.loadAllTerritories(territorioService);

      expect(territorioService.getAllGeoJson).toHaveBeenCalled();
      expect(service.getTerritoryDataCache().size).toBe(1);
      const cached = sessionStorage.getItem(MapTerritoryLayerService.GEOJSON_CACHE_KEY);
      expect(cached).toBeTruthy();
    });

    it('should reuse the session cache and skip the fetch on subsequent loads', async () => {
      const territorioService = makeService();
      await service.loadAllTerritories(territorioService);
      expect(territorioService.getAllGeoJson).toHaveBeenCalledTimes(1);

      const secondService = makeService();
      await service.loadAllTerritories(secondService);

      expect(secondService.getAllGeoJson).not.toHaveBeenCalled();
      expect(service.getTerritoryDataCache().size).toBe(1);
    });

    it('should ignore a corrupt session cache and fall back to fetching', async () => {
      sessionStorage.setItem(MapTerritoryLayerService.GEOJSON_CACHE_KEY, '{ not json');
      const territorioService = makeService();

      await service.loadAllTerritories(territorioService);

      expect(territorioService.getAllGeoJson).toHaveBeenCalled();
      expect(service.getTerritoryDataCache().size).toBe(1);
    });
  });

  describe('cache reconciliation', () => {
    beforeEach(() => sessionStorage.clear());

    const geoJson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'm1', territorio_padre: 1, color: '#ff0000' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-58.5, -34.5],
                [-58.4, -34.5],
                [-58.4, -34.4],
                [-58.5, -34.4],
              ],
            ],
          },
        },
      ],
    });

    it('hasCachedGeojson reflects whether a usable snapshot is cached', async () => {
      expect(service.hasCachedGeojson()).toBe(false);
      await service.loadAllTerritories({ getAllGeoJson: vi.fn().mockResolvedValue(geoJson) });
      expect(service.hasCachedGeojson()).toBe(true);
    });

    it('prunes the snapshot when it references territories deleted in the backend', async () => {
      await service.loadAllTerritories({ getAllGeoJson: vi.fn().mockResolvedValue(geoJson) });
      expect(sessionStorage.getItem(MapTerritoryLayerService.GEOJSON_CACHE_KEY)).toBeTruthy();

      service.podarGeojsonCache(new Set([2]));

      expect(sessionStorage.getItem(MapTerritoryLayerService.GEOJSON_CACHE_KEY)).toBeNull();
    });

    it('keeps the snapshot when all cached territories still exist', async () => {
      await service.loadAllTerritories({ getAllGeoJson: vi.fn().mockResolvedValue(geoJson) });

      service.podarGeojsonCache(new Set([1]));

      expect(sessionStorage.getItem(MapTerritoryLayerService.GEOJSON_CACHE_KEY)).toBeTruthy();
    });

    it('is a no-op when there is no cached snapshot', () => {
      expect(() => service.podarGeojsonCache(new Set([1, 2]))).not.toThrow();
      expect(sessionStorage.getItem(MapTerritoryLayerService.GEOJSON_CACHE_KEY)).toBeNull();
    });
  });

  describe('processed geometry cache', () => {
    const geoJson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'm1', territorio_padre: 1, color: '#ff0000' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-58.5, -34.5],
                [-58.4, -34.5],
                [-58.4, -34.4],
                [-58.5, -34.4],
              ],
            ],
          },
        },
      ],
    });

    beforeEach(() => {
      sessionStorage.clear();
    });

    it('persists the processed geometry after the first load', async () => {
      await service.loadAllTerritories({ getAllGeoJson: vi.fn().mockResolvedValue(geoJson) });

      const raw = sessionStorage.getItem(MapTerritoryLayerService.PROCESSED_CACHE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!) as Record<string, { simplifiedFc: unknown; dissolvedFeature: unknown }>;
      expect(parsed['1']).toBeTruthy();
      expect(parsed['1'].simplifiedFc).toBeTruthy();
    });

    it('reuses the cached processed geometry on subsequent loads', async () => {
      await service.loadAllTerritories({ getAllGeoJson: vi.fn().mockResolvedValue(geoJson) });
      const first = sessionStorage.getItem(MapTerritoryLayerService.PROCESSED_CACHE_KEY);

      const secondService = { getAllGeoJson: vi.fn().mockResolvedValue(geoJson) };
      await service.loadAllTerritories(secondService);

      expect(secondService.getAllGeoJson).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(MapTerritoryLayerService.PROCESSED_CACHE_KEY)).toBe(first);
    });

    it('reprocesses and overwrites a corrupt processed cache', async () => {
      sessionStorage.setItem(MapTerritoryLayerService.PROCESSED_CACHE_KEY, '{ not json');
      await service.loadAllTerritories({ getAllGeoJson: vi.fn().mockResolvedValue(geoJson) });

      const raw = sessionStorage.getItem(MapTerritoryLayerService.PROCESSED_CACHE_KEY);
      expect(raw).toBeTruthy();
      expect(() => JSON.parse(raw!)).not.toThrow();
    });

    it('ignores an orphan processed cache (no raw snapshot) and reprocesses', async () => {
      sessionStorage.setItem(
        MapTerritoryLayerService.PROCESSED_CACHE_KEY,
        JSON.stringify({ '1': { simplifiedFc: { type: 'FeatureCollection', features: [] }, dissolvedFeature: null } })
      );

      await service.loadAllTerritories({ getAllGeoJson: vi.fn().mockResolvedValue(geoJson) });

      const raw = sessionStorage.getItem(MapTerritoryLayerService.PROCESSED_CACHE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!) as Record<string, { simplifiedFc: { features: unknown[] } }>;
      expect(parsed['1'].simplifiedFc.features.length).toBe(1);
    });

    it('prunes the processed cache together with the raw snapshot', async () => {
      await service.loadAllTerritories({ getAllGeoJson: vi.fn().mockResolvedValue(geoJson) });
      expect(sessionStorage.getItem(MapTerritoryLayerService.PROCESSED_CACHE_KEY)).toBeTruthy();

      service.podarGeojsonCache(new Set([2]));

      expect(sessionStorage.getItem(MapTerritoryLayerService.PROCESSED_CACHE_KEY)).toBeNull();
    });
  });

  describe('spatial index integration', () => {
    const geoJson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'm1', territorio_padre: 1, color: '#ff0000' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-58.5, -34.5],
                [-58.4, -34.5],
                [-58.4, -34.4],
                [-58.5, -34.4],
              ],
            ],
          },
        },
      ],
    });

    beforeEach(() => {
      sessionStorage.clear();
      // addTerritoryLayer requiere un mapa; el mock de leaflet devuelve fakeMap.
      TestBed.inject(MapEngineService).initializeMap(document.createElement('div'));
    });

    it('indexes loaded manzanas so queryManzanasAt finds them by cell', async () => {
      await service.loadAllTerritories({ getAllGeoJson: vi.fn().mockResolvedValue(geoJson) });
      expect(service.updateVisibleTerritories()).toEqual([1]);

      // m1 bbox [-34.5,-34.4] × [-58.5,-58.4]; el punto cae en una celda cubierta
      const found = service.queryManzanasAt({ lat: -34.45, lng: -58.45 });
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe('m1');
    });

    it('queryManzanasNear finds manzanas in neighbor cells that queryAt misses', async () => {
      await service.loadAllTerritories({ getAllGeoJson: vi.fn().mockResolvedValue(geoJson) });
      service.updateVisibleTerritories();

      // Celda adyacente al bbox de m1: queryAt no la ve, queryNear (radio 1) sí
      const at = service.queryManzanasAt({ lat: -34.398, lng: -58.398 });
      expect(at).toEqual([]);
      const near = service.queryManzanasNear({ lat: -34.398, lng: -58.398 });
      expect(near.map((m) => m.id)).toContain('m1');
    });

    it('clearAllLayers empties the spatial index', async () => {
      await service.loadAllTerritories({ getAllGeoJson: vi.fn().mockResolvedValue(geoJson) });
      service.updateVisibleTerritories();
      expect(service.queryManzanasAt({ lat: -34.45, lng: -58.45 })).toHaveLength(1);

      service.clearAllLayers();

      expect(service.queryManzanasAt({ lat: -34.45, lng: -58.45 })).toEqual([]);
    });
  });
});
