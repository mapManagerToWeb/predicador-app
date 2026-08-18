import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as L from 'leaflet';
import { MapTerritoryLayerService } from './map-territory-layer.service';
import { MapEngineService } from './map-engine.service';

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
      const layer1 = { remove: () => {} } as unknown as L.Layer;
      const layer2 = { remove: () => {} } as unknown as L.Layer;

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
});
