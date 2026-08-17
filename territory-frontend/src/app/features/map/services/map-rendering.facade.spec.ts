import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as L from 'leaflet';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapEngineService } from './map-engine.service';
import { MapTileLayerService } from './map-tile-layer.service';
import { MapTerritoryLayerService } from './map-territory-layer.service';
import { MapStyleService } from './map-style.service';
import { MapCaptureService } from './map-capture.service';
import { MapPartialDrawService } from './map-partial-draw.service';
import { MapStateService } from './map-state.service';
import { MapLayerRegistry } from './map-layer-registry.service';
import { getMarkedManzanaStyle } from './map-style.service';
import type { FeatureLayer, ManzanaMarcada } from '../types/map.types';

describe('MapRenderingFacade', () => {
  let facade: MapRenderingFacade;
  let state: MapStateService;
  let territories: MapTerritoryLayerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MapRenderingFacade,
        MapEngineService,
        MapTileLayerService,
        MapTerritoryLayerService,
        MapStyleService,
        MapCaptureService,
        MapPartialDrawService,
        MapStateService,
      ],
    });

    facade = TestBed.inject(MapRenderingFacade);
    state = TestBed.inject(MapStateService);
    territories = TestBed.inject(MapTerritoryLayerService);
  });

  it('should be created', () => {
    expect(facade).toBeTruthy();
  });

  describe('getMap', () => {
    it('should return null when map is not initialized', () => {
      expect(facade.getMap()).toBeNull();
    });
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

  describe('extraLayers', () => {
    it('should delegate addExtraLayer to territories', () => {
      const mockLayer = { addTo: vi.fn() } as unknown as L.Layer;
      const spy = vi.spyOn(territories, 'addExtraLayer');
      facade.addExtraLayer(mockLayer);
      expect(spy).toHaveBeenCalledWith(mockLayer);
    });

    it('should delegate removeExtraLayer to territories', () => {
      const mockLayer = {} as L.Layer;
      const spy = vi.spyOn(territories, 'removeExtraLayer');
      facade.removeExtraLayer(mockLayer);
      expect(spy).toHaveBeenCalledWith(mockLayer);
    });

    it('should delegate clearExtraLayers to territories', () => {
      const spy = vi.spyOn(territories, 'clearExtraLayers');
      facade.clearExtraLayers();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('index/data access', () => {
    it('should delegate getManzanaIndex to territories', () => {
      const spy = vi.spyOn(territories, 'getManzanaIndex');
      facade.getManzanaIndex();
      expect(spy).toHaveBeenCalled();
    });

    it('should delegate getAllTerritoriesLayer to territories', () => {
      const spy = vi.spyOn(territories, 'getAllTerritoriesLayer');
      facade.getAllTerritoriesLayer();
      expect(spy).toHaveBeenCalled();
    });

    it('should delegate getTerritoryDataCache to territories', () => {
      const spy = vi.spyOn(territories, 'getTerritoryDataCache');
      facade.getTerritoryDataCache();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('visibility', () => {
    it('should hide non-selected territories', () => {
      const fl: FeatureLayer = {
        territorioPadre: 1,
        color: '#ff0000',
        layer: {
          eachLayer: vi.fn((cb: (layer: unknown) => void) => {
            cb({ setStyle: vi.fn() });
          }),
        } as unknown as L.LayerGroup,
      };
      vi.spyOn(territories, 'getAllTerritoriesLayer').mockReturnValue([fl]);
      vi.spyOn(territories, 'updateLabelsForSelection').mockImplementation(() => {});

      facade.ocultarPoligonosNoSeleccionados([2]);

      expect(territories.updateLabelsForSelection).toHaveBeenCalledWith(new Set([2]));
    });
  });

  describe('restaurarVistaConMarcas', () => {
    it('re-applies marked styles for all territories and keeps layers visible', () => {
      const registry = TestBed.inject(MapLayerRegistry);
      const styles = TestBed.inject(MapStyleService);
      const markedPath = new L.Polygon([
        [
          { lat: -1, lng: -1 },
          { lat: 2, lng: -1 },
          { lat: 2, lng: 2 },
          { lat: -1, lng: 2 },
        ],
      ]);
      registry.register('m1', markedPath);

      const fl: FeatureLayer = {
        territorioPadre: 5,
        color: '#ff0000',
        layer: {
          eachLayer: vi.fn((cb: (layer: unknown) => void) => {
            cb({ setStyle: vi.fn() });
          }),
        } as unknown as L.LayerGroup,
      };
      vi.spyOn(territories, 'getAllTerritoriesLayer').mockReturnValue([fl]);
      vi.spyOn(territories, 'getFeatureLayerByTerritorio').mockReturnValue(fl);
      vi.spyOn(territories, 'getManzanaCountByTerritorio').mockReturnValue(3);
      vi.spyOn(territories, 'updateLabelsVisibility').mockImplementation(() => {});

      let queued: (() => void) | undefined;
      vi.spyOn(styles, 'queueStyleUpdate').mockImplementation(fn => {
        queued = fn;
      });

      const marcadas: ManzanaMarcada[] = [
        { id: 'm1', nombreBloque: 'A1', color: '#ff0000', territorioNumero: 5 },
      ];

      const cancelSpy = vi.spyOn(styles, 'cancelPendingStyleUpdates');

      facade.restaurarVistaConMarcas(marcadas);

      expect(cancelSpy).toHaveBeenCalled();
      queued?.();
      expect(markedPath.options.fillOpacity).toBe(getMarkedManzanaStyle('#ff0000').fillOpacity);
      expect(territories.updateLabelsVisibility).toHaveBeenCalled();
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

    it('should delegate limpiarMarcasVisuales', () => {
      const styles = TestBed.inject(MapStyleService);
      vi.spyOn(territories, 'getAllTerritoriesLayer').mockReturnValue([]);
      const spy = vi.spyOn(styles, 'limpiarMarcasVisuales');
      facade.limpiarMarcasVisuales();
      expect(spy).toHaveBeenCalledWith([]);
    });
  });
});
