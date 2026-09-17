import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapStyleService } from './map-style.service';
import { MapStateService } from './map-state.service';

describe('MapRenderingFacade', () => {
  let facade: MapRenderingFacade;
  let state: MapStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MapRenderingFacade, MapStyleService, MapStateService],
    });

    facade = TestBed.inject(MapRenderingFacade);
    state = TestBed.inject(MapStateService);
  });

  it('should be created', () => {
    expect(facade).toBeTruthy();
  });

  describe('currentTerritoryColor', () => {
    it('should delegate to state.currentTerritoryColor', () => {
      facade.setCurrentTerritoryColor('#ff0000');
      expect(state.currentTerritoryColor()).toBe('#ff0000');
      expect(facade.getCurrentTerritoryColor()).toBe('#ff0000');
    });

    it('should reset to empty string', () => {
      facade.setCurrentTerritoryColor('#abc');
      facade.setCurrentTerritoryColor('');
      expect(facade.getCurrentTerritoryColor()).toBe('');
    });
  });

  describe('no-op methods', () => {
    it('getAllTerritoriesLayer returns empty array', () => {
      expect(facade.getAllTerritoriesLayer()).toEqual([]);
    });

    it('getManzanaIndex returns empty array', () => {
      expect(facade.getManzanaIndex()).toEqual([]);
    });

    it('getFeatureLayerByTerritorio returns undefined', () => {
      expect(facade.getFeatureLayerByTerritorio(1)).toBeUndefined();
    });

    it('getManzanaCountByTerritorio returns 0', () => {
      expect(facade.getManzanaCountByTerritorio(1)).toBe(0);
    });

    it('isSatellite returns false', () => {
      expect(facade.isSatellite()).toBe(false);
    });
  });

  describe('style functions', () => {
    it('should delegate queueStyleUpdate', () => {
      const styles = TestBed.inject(MapStyleService);
      const spy = vi.spyOn(styles, 'queueStyleUpdate');
      const fn = () => {};
      facade.queueStyleUpdate(fn);
      expect(spy).toHaveBeenCalledWith(fn);
    });

    it('should delegate cancelPendingStyleUpdates', () => {
      const styles = TestBed.inject(MapStyleService);
      const spy = vi.spyOn(styles, 'cancelPendingStyleUpdates');
      facade.cancelPendingStyleUpdates();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('async methods', () => {
    it('loadAllTerritories resolves', async () => {
      await expect(facade.loadAllTerritories({ getAllGeoJson: async () => '' })).resolves.toBeUndefined();
    });

    it('whenTerritoryLoadsIdle resolves immediately', async () => {
      await expect(facade.whenTerritoryLoadsIdle()).resolves.toBeUndefined();
    });

    it('prepararCaptura resolves', async () => {
      await expect(facade.prepararCaptura([], [])).resolves.toBeUndefined();
    });
  });
});
