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
});
