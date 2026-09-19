import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapRenderingFacade, buildTerritorioMetadata } from './map-rendering.facade';
import { MapVectorTileService } from './map-vector-tile.service';
import { MapMarkedOverlayService } from './map-marked-overlay.service';
import { MapStateService } from './map-state.service';

describe('MapRenderingFacade', () => {
  let facade: MapRenderingFacade;
  let state: MapStateService;
  let vectorTile: {
    setSelectedTerritoriesOpacity: ReturnType<typeof vi.fn>;
    resetFillOpacity: ReturnType<typeof vi.fn>;
  };
  let markedOverlay: {
    initOverlay: ReturnType<typeof vi.fn>;
    updateOverlay: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    isInitialized: ReturnType<typeof vi.fn>;
  };
  const fakeEngine = {};

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

  beforeEach(() => {
    vectorTile = {
      setSelectedTerritoriesOpacity: vi.fn(),
      resetFillOpacity: vi.fn(),
    };
    markedOverlay = {
      initOverlay: vi.fn(),
      updateOverlay: vi.fn(),
      destroy: vi.fn(),
      isInitialized: vi.fn().mockReturnValue(false),
    };
    TestBed.configureTestingModule({
      providers: [
        MapRenderingFacade,
        MapStateService,
        { provide: MapVectorTileService, useValue: vectorTile },
        { provide: MapMarkedOverlayService, useValue: markedOverlay },
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
        [],
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
    it('fits the union of selected territories with 30px padding', () => {
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
        { padding: 30 },
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
    it('hides non-selected territories via MapVectorTileService when attached', () => {
      facade.attachEngine(fakeEngine as never);
      facade.ocultarPoligonosNoSeleccionados([1, 2]);

      expect(vectorTile.setSelectedTerritoriesOpacity).toHaveBeenCalledWith(
        fakeEngine,
        [1, 2],
        [],
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

      expect(vectorTile.resetFillOpacity).toHaveBeenCalledWith(fakeEngine, []);
      expect(vectorTile.setSelectedTerritoriesOpacity).not.toHaveBeenCalled();
    });
  });

  describe('restaurarVisibilidadPoligonos', () => {
    it('calls resetFillOpacity via MapVectorTileService when attached', () => {
      facade.attachEngine(fakeEngine as never);
      facade.restaurarVisibilidadPoligonos();

      expect(vectorTile.resetFillOpacity).toHaveBeenCalledWith(fakeEngine, []);
    });

    it('no-ops when no engine is attached', () => {
      facade.restaurarVisibilidadPoligonos();

      expect(vectorTile.resetFillOpacity).not.toHaveBeenCalled();
    });
  });

  describe('getCompletedTerritorios', () => {
    function withMarks(
      marks: Array<{ id: string; territorioNumero: number }>,
    ): MapRenderingFacade {
      const s = serviceWithMetadata();
      const map = new Map<string, { id: string; nombreBloque: string; color: string; territorioNumero: number }>();
      for (const m of marks) {
        map.set(m.id, { id: m.id, nombreBloque: '', color: '#fff', territorioNumero: m.territorioNumero });
      }
      state.manzanasById.set(map);
      return s;
    }

    it('returns territories whose non-partial marks meet the manzana count', () => {
      const s = withMarks([
        { id: '56-56.a', territorioNumero: 56 },
        { id: '56-56.b', territorioNumero: 56 },
        { id: '57-57.a', territorioNumero: 57 },
      ]);

      expect(s.getCompletedTerritorios()).toEqual([56, 57]);
    });

    it('excludes partial marks from the completion count', () => {
      const s = withMarks([
        { id: '56-56.a', territorioNumero: 56 },
        { id: 'parcial-1', territorioNumero: 56 },
      ]);

      expect(s.getCompletedTerritorios()).toEqual([]);
    });

    it('returns an empty list when metadata is missing', () => {
      expect(facade.getCompletedTerritorios()).toEqual([]);
    });
  });

  describe('refreshOverlayMarks', () => {
    it('matches marks against the snapshot and pushes color + completo features', () => {
      const s = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);

      const map = new Map<string, { id: string; nombreBloque: string; color: string; territorioNumero: number }>();
      map.set('56-56.a', { id: '56-56.a', nombreBloque: '56.a', color: '#ff0000', territorioNumero: 56 });
      // Numeric fid mark has no snapshot counterpart in this fixture → skipped.
      map.set('999', { id: '999', nombreBloque: '', color: '#00ff00', territorioNumero: 57 });
      state.manzanasById.set(map);

      s.refreshOverlayMarks();

      expect(markedOverlay.updateOverlay).toHaveBeenCalledTimes(1);
      const [engine, features] = markedOverlay.updateOverlay.mock.calls[0] as [
        unknown,
        Array<{ properties: Record<string, unknown> }>,
      ];
      expect(engine).toBe(fakeEngine);
      expect(features).toHaveLength(1);
      expect(features[0].properties['color']).toBe('#ff0000');
      // Territory 56 has only 1 of its 2 manzanas marked → incomplete.
      expect(features[0].properties['completo']).toBe(false);
    });

    it('no-ops before initOverlay and without an engine', () => {
      facade.refreshOverlayMarks();
      expect(markedOverlay.updateOverlay).not.toHaveBeenCalled();
    });
  });

  describe('initMarkedOverlay', () => {
    it('initializes the overlay and populates it with current marks', () => {
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);

      facade.initMarkedOverlay(fakeEngine as never);

      expect(markedOverlay.initOverlay).toHaveBeenCalledWith(fakeEngine);
      expect(markedOverlay.updateOverlay).toHaveBeenCalled();
    });
  });

  describe('refreshMarksVisual', () => {
    it('re-applies the selection-aware opacity and the overlay', () => {
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);
      state.territoriosSeleccionados.set([1]);

      facade.refreshMarksVisual();

      expect(vectorTile.setSelectedTerritoriesOpacity).toHaveBeenCalledWith(fakeEngine, [1], []);
      expect(markedOverlay.updateOverlay).toHaveBeenCalled();
    });

    it('restores the base completion opacity when no selection is active', () => {
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);

      facade.refreshMarksVisual();

      expect(vectorTile.resetFillOpacity).toHaveBeenCalledWith(fakeEngine, []);
      expect(markedOverlay.updateOverlay).toHaveBeenCalled();
    });
  });
});