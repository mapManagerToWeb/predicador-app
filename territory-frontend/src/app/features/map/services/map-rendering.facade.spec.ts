import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapRenderingFacade, buildTerritorioMetadata } from './map-rendering.facade';
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

  describe('GeoJSON metadata', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-73.3, -37.4],
                [-73.2, -37.4],
                [-73.2, -37.3],
                [-73.3, -37.3],
                [-73.3, -37.4],
              ],
            ],
          },
          properties: { territorio_padre: 56, id: '56-56.a', nombre_bloque: '56.a' },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-73.1, -37.2],
                [-73.05, -37.2],
                [-73.05, -37.15],
                [-73.1, -37.15],
                [-73.1, -37.2],
              ],
            ],
          },
          properties: { territorio_padre: 56, id: '56-56.b' },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-72.9, -37.0],
                [-72.8, -37.0],
                [-72.8, -36.9],
                [-72.9, -36.9],
                [-72.9, -37.0],
              ],
            ],
          },
          properties: { territorio_padre: 57, id: '57-57.a' },
        },
      ],
    } as never;

    function serviceWithMetadata(): MapRenderingFacade {
      const s = TestBed.inject(MapRenderingFacade);
      s['metadata'] = buildTerritorioMetadata(fc as never);
      return s;
    }

    it('buildTerritorioMetadata counts and groups features per territory', () => {
      const meta = buildTerritorioMetadata(fc as never);

      expect(meta.manzanaCounts.get(56)).toBe(2);
      expect(meta.manzanaCounts.get(57)).toBe(1);
      expect(meta.featuresByTerritorio.get(56)).toHaveLength(2);
      expect(meta.featuresByTerritorio.get(57)).toHaveLength(1);
    });

    it('computes union bounds and centroid per territory', () => {
      const meta = buildTerritorioMetadata(fc as never);

      expect(meta.boundsByTerritorio.get(56)).toEqual([-73.3, -37.4, -73.05, -37.15]);
      expect(meta.centroidsByTerritorio.get(56)).toEqual([-73.175, -37.275]);
    });

    it('exposes real counts and centroids after metadata load', () => {
      const s = serviceWithMetadata();

      expect(s.getManzanaCountByTerritorio(56)).toBe(2);
      expect(s.getManzanaCountByTerritorio(57)).toBe(1);
      expect(s.getManzanaCountByTerritorio(999)).toBe(0);
      expect(s.getCentroidByTerritorio(56)).toEqual([-73.175, -37.275]);
      expect(s.getBoundsByTerritorio(57)).toEqual([-72.9, -37.0, -72.8, -36.9]);
      expect(s.getGeoJsonFeaturesByTerritorio(56)).toHaveLength(2);
      expect(s.getTerritoriosConMetadata()).toEqual([56, 57]);
      expect(s.hasGeoJsonMetadata()).toBe(true);
    });

    it('loadGeoJsonMetadata fetches and parses the snapshot', async () => {
      const s = TestBed.inject(MapRenderingFacade);
      const raw = JSON.stringify(fc);
      await s.loadGeoJsonMetadata({ getAllGeoJson: vi.fn().mockResolvedValue(raw) } as never);

      expect(s.getManzanaCountByTerritorio(56)).toBe(2);
      expect(s.hasGeoJsonMetadata()).toBe(true);
    });

    it('loadGeoJsonMetadata tolerates failures (tiles still render)', async () => {
      const s = TestBed.inject(MapRenderingFacade);
      await s.loadGeoJsonMetadata({ getAllGeoJson: vi.fn().mockRejectedValue(new Error('offline')) } as never);

      expect(s.hasGeoJsonMetadata()).toBe(false);
      expect(s.getManzanaCountByTerritorio(56)).toBe(0);
    });
  });

  describe('fitBoundsToTerritorios', () => {
    it('fits the union of selected territories with [30, 30] padding', () => {
      const fitBounds = vi.fn();
      facade.attachEngine({ fitBounds } as never);
      const s = TestBed.inject(MapRenderingFacade);
      s['metadata'] = buildTerritorioMetadata({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-73.3, -37.4],
                  [-73.2, -37.4],
                  [-73.2, -37.3],
                  [-73.3, -37.3],
                  [-73.3, -37.4],
                ],
              ],
            },
            properties: { territorio_padre: 56 },
          },
        ],
      } as never);

      s.fitBoundsToTerritorios([56]);

      expect(fitBounds).toHaveBeenCalledWith(
        [
          [-73.3, -37.4],
          [-73.2, -37.3],
        ],
        { padding: [30, 30] },
      );
    });

    it('no-ops when the engine is not attached', () => {
      facade.fitBoundsToTerritorios([56]);
      expect(true).toBe(true);
    });

    it('no-ops with an empty selection', () => {
      const fitBounds = vi.fn();
      facade.attachEngine({ fitBounds } as never);
      facade.fitBoundsToTerritorios([]);
      expect(fitBounds).not.toHaveBeenCalled();
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