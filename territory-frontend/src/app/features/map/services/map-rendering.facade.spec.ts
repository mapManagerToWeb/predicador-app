import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapVectorTileService } from './map-vector-tile.service';
import { MapStateService } from './map-state.service';

describe('MapRenderingFacade', () => {
  let facade: MapRenderingFacade;
  let state: MapStateService;
  let vectorTile: {
    setSelectedTerritoriesOpacity: ReturnType<typeof vi.fn>;
    resetFillOpacity: ReturnType<typeof vi.fn>;
  };
  const fakeEngine = {};

  beforeEach(() => {
    vectorTile = {
      setSelectedTerritoriesOpacity: vi.fn(),
      resetFillOpacity: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        MapRenderingFacade,
        MapStateService,
        { provide: MapVectorTileService, useValue: vectorTile },
      ],
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

  describe('attachEngine', () => {
    it('stores the engine so subsequent visibility calls hit it', () => {
      facade.attachEngine(fakeEngine as never);
      facade.ocultarPoligonosNoSeleccionados([1]);

      expect(vectorTile.setSelectedTerritoriesOpacity).toHaveBeenCalledWith(
        fakeEngine,
        [1],
      );
    });
  });

  describe('no-op methods', () => {
    it('getAllTerritoriesLayer returns empty array', () => {
      expect(facade.getAllTerritoriesLayer()).toEqual([]);
    });

    it('getFeatureLayerByTerritorio returns undefined', () => {
      expect(facade.getFeatureLayerByTerritorio(1)).toBeUndefined();
    });

    it('getManzanaCountByTerritorio returns 0', () => {
      expect(facade.getManzanaCountByTerritorio(1)).toBe(0);
    });
  });

  describe('ocultarPoligonosNoSeleccionados', () => {
    it('dims non-selected territories via MapVectorTileService when attached', () => {
      facade.attachEngine(fakeEngine as never);
      facade.ocultarPoligonosNoSeleccionados([1, 2]);

      expect(vectorTile.setSelectedTerritoriesOpacity).toHaveBeenCalledWith(
        fakeEngine,
        [1, 2],
      );
      expect(vectorTile.resetFillOpacity).not.toHaveBeenCalled();
    });

    it('no-ops when no engine is attached', () => {
      facade.ocultarPoligonosNoSeleccionados([1]);

      expect(vectorTile.setSelectedTerritoriesOpacity).not.toHaveBeenCalled();
      expect(vectorTile.resetFillOpacity).not.toHaveBeenCalled();
    });

    it('resets the fill opacity when the selection is empty', () => {
      facade.attachEngine(fakeEngine as never);
      facade.ocultarPoligonosNoSeleccionados([]);

      expect(vectorTile.resetFillOpacity).toHaveBeenCalledWith(fakeEngine);
      expect(vectorTile.setSelectedTerritoriesOpacity).not.toHaveBeenCalled();
    });
  });

  describe('restaurarVisibilidadPoligonos', () => {
    it('calls resetFillOpacity via MapVectorTileService when attached', () => {
      facade.attachEngine(fakeEngine as never);
      facade.restaurarVisibilidadPoligonos();

      expect(vectorTile.resetFillOpacity).toHaveBeenCalledWith(fakeEngine);
    });

    it('no-ops when no engine is attached', () => {
      facade.restaurarVisibilidadPoligonos();

      expect(vectorTile.resetFillOpacity).not.toHaveBeenCalled();
    });
  });
});