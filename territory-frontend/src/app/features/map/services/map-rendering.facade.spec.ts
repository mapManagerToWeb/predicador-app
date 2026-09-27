import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  MapRenderingFacade,
  buildTerritorioMetadata,
  parseTerritoryMetadata,
} from './map-rendering.facade';
import { MapVectorTileService } from './map-vector-tile.service';
import { MapMarkedOverlayService } from './map-marked-overlay.service';
import { MapSelectedManzanaOverlayService } from './map-selected-manzana-overlay.service';
import { MapStateService } from './map-state.service';
import { TerritorioService, type TerritoryMetadataDto } from '../../../core/services/territorio';
import type * as GeoJSON from 'geojson';

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
  let selectedOverlay: {
    initOverlay: ReturnType<typeof vi.fn>;
    setSelected: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    isInitialized: ReturnType<typeof vi.fn>;
  };
  let territorios: {
    getTerritoryMetadata: ReturnType<typeof vi.fn>;
    getGeoJsonByTerritorio: ReturnType<typeof vi.fn>;
    getColores: ReturnType<typeof vi.fn>;
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
  } as GeoJSON.FeatureCollection;

  /** Metadata DTOs matching the `fc` fixture (same counts/bounds/centers). */
  const METADATA_DTO: TerritoryMetadataDto[] = [
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
  ];

  function serviceWithMetadata(): MapRenderingFacade {
    const s = TestBed.inject(MapRenderingFacade);
    s['metadata'] = buildTerritorioMetadata(METADATA_DTO);
    // Pre-seed the on-demand geometry cache from the fixture so heals
    // never fetch (tests that need a fetch clear the territory first).
    const byTerritorio = new Map<number, GeoJSON.Feature[]>();
    for (const feature of fc.features) {
      const num = Number(feature.properties?.['territorio_padre']);
      const list = byTerritorio.get(num) ?? [];
      list.push(feature);
      byTerritorio.set(num, list);
    }
    for (const [num, list] of byTerritorio) s['geoJsonFeatures'].set(num, list);
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
    selectedOverlay = {
      initOverlay: vi.fn(),
      setSelected: vi.fn(),
      destroy: vi.fn(),
      isInitialized: vi.fn().mockReturnValue(true),
    };
    territorios = {
      getTerritoryMetadata: vi.fn(async () => METADATA_DTO),
      getGeoJsonByTerritorio: vi.fn(async () => JSON.stringify(fc)),
      getColores: vi.fn(async () => ({ '56': '#00A86B', '57': '#3b82f6' })),
    };
    TestBed.configureTestingModule({
      providers: [
        MapRenderingFacade,
        MapStateService,
        { provide: MapVectorTileService, useValue: vectorTile },
        { provide: MapMarkedOverlayService, useValue: markedOverlay },
        { provide: MapSelectedManzanaOverlayService, useValue: selectedOverlay },
        { provide: TerritorioService, useValue: territorios },
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

  describe('territory metadata', () => {
    it('buildTerritorioMetadata derives counts from the DTO list', () => {
      const meta = buildTerritorioMetadata(METADATA_DTO);

      expect(meta.manzanaCounts.get(56)).toBe(2);
      expect(meta.manzanaCounts.get(57)).toBe(1);
    });

    it('buildTerritorioMetadata derives bounds and centroids from the DTOs', () => {
      const meta = buildTerritorioMetadata(METADATA_DTO);

      expect(meta.boundsByTerritorio.get(56)).toEqual([-73.3, -37.4, -73.05, -37.15]);
      expect(meta.centroidsByTerritorio.get(56)).toEqual([-73.175, -37.275]);
      expect(meta.centroidsByTerritorio.get(57)).toEqual([-72.85, -36.95]);
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

    it('loadTerritoryMetadata fetches and parses the DTO list', async () => {
      const s = TestBed.inject(MapRenderingFacade);
      await s.loadTerritoryMetadata();

      expect(territorios.getTerritoryMetadata).toHaveBeenCalledTimes(1);
      expect(s.getManzanaCountByTerritorio(56)).toBe(2);
      expect(s.hasGeoJsonMetadata()).toBe(true);
    });

    it('loadTerritoryMetadata tolerates failures (tiles still render)', async () => {
      const s = TestBed.inject(MapRenderingFacade);
      territorios.getTerritoryMetadata.mockRejectedValue(new Error('offline'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await s.loadTerritoryMetadata();

      expect(s.hasGeoJsonMetadata()).toBe(false);
      expect(s.getManzanaCountByTerritorio(56)).toBe(0);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('loadTerritoryMetadata tolerates a malformed payload', async () => {
      const s = TestBed.inject(MapRenderingFacade);
      territorios.getTerritoryMetadata.mockResolvedValue({ nope: true });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await s.loadTerritoryMetadata();

      expect(s.hasGeoJsonMetadata()).toBe(false);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('loadTerritoryMetadata clears the on-demand geometry cache', async () => {
      const s = serviceWithMetadata();
      expect(s.getGeoJsonFeaturesByTerritorio(56)).toHaveLength(2);

      await s.loadTerritoryMetadata();

      expect(s.hasGeoJsonMetadata()).toBe(true);
      expect(s.getGeoJsonFeaturesByTerritorio(56)).toHaveLength(0);
    });

    it('parseTerritoryMetadata returns null for non-array payloads', () => {
      expect(parseTerritoryMetadata(null)).toBeNull();
      expect(parseTerritoryMetadata({})).toBeNull();
      expect(parseTerritoryMetadata('[]')).toBeNull();
    });

    it('parseTerritoryMetadata skips malformed items and keeps valid ones', () => {
      const meta = parseTerritoryMetadata([
        METADATA_DTO[0],
        { numero: 'not-a-number' },
        { ...METADATA_DTO[1], bounds: [1, 2] },
        null,
      ]);

      expect(meta).not.toBeNull();
      expect(meta?.manzanaCounts.get(56)).toBe(2);
      expect(meta?.manzanaCounts.has(57)).toBe(false);
      expect(meta?.boundsByTerritorio.get(56)).toEqual([-73.3, -37.4, -73.05, -37.15]);
    });
  });

  describe('fitBoundsToTerritorios', () => {
    it('fits the union of selected territories with 30px padding', () => {
      const fitBounds = vi.fn();
      facade.attachEngine({ fitBounds } as never);
      const s = TestBed.inject(MapRenderingFacade);
      s['metadata'] = buildTerritorioMetadata([
        {
          numero: 56,
          nombre: 'Territorio 56',
          color: '#00A86B',
          bounds: [-73.3, -37.4, -73.2, -37.3],
          center: [-73.25, -37.35],
          manzanaCount: 2,
          fids: [5541, 5542],
        },
      ]);

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

    it('counts marks restored from the backend as completion', () => {
      const s = serviceWithMetadata();
      // Marks restored at load are display-only: they never join manzanasById.
      state.setRestoredMarksForTerritorio(56, [
        { id: '56-56.a', nombreBloque: '', color: '#00A86B', territorioNumero: 56 },
        { id: '56-56.b', nombreBloque: '', color: '#00A86B', territorioNumero: 56 },
      ]);

      expect(state.manzanasById().size).toBe(0);
      expect(s.getCompletedTerritorios()).toEqual([56]);
    });
  });

  describe('refreshOverlayMarks', () => {
    it('matches marks against the cached geometry and pushes color + completo features', () => {
      const s = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);

      const map = new Map<string, { id: string; nombreBloque: string; color: string; territorioNumero: number }>();
      map.set('56-56.a', { id: '56-56.a', nombreBloque: '56.a', color: '#ff0000', territorioNumero: 56 });
      // Numeric fid mark has no counterpart in this fixture → skipped.
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

    it('renders display-only restored marks too', () => {
      serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);
      // The DB says 56.a was already reported; 56.b is restored alongside it.
      state.setRestoredMarksForTerritorio(56, [
        { id: '56-56.a', nombreBloque: '56.a', color: '#00A86B', territorioNumero: 56 },
        { id: '56-56.b', nombreBloque: '56.b', color: '#00A86B', territorioNumero: 56 },
      ]);

      facade.refreshOverlayMarks();

      const [, features] = markedOverlay.updateOverlay.mock.calls[0] as [
        unknown,
        Array<{ properties: Record<string, unknown> }>,
      ];
      expect(features).toHaveLength(2);
      expect(features.every(f => f.properties['color'] === '#00A86B')).toBe(true);
      // Both restored manzanas complete the territory → 0.6 fill, not grey.
      expect(features.every(f => f.properties['completo'] === true)).toBe(true);
    });

    it('no-ops before initOverlay and without an engine', () => {
      facade.refreshOverlayMarks();
      expect(markedOverlay.updateOverlay).not.toHaveBeenCalled();
    });

    it('only renders the selected territories\u2019 marks when a selection is active', () => {
      const s = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);
      state.territoriosSeleccionados.set([57]);

      const map = new Map<string, { id: string; nombreBloque: string; color: string; territorioNumero: number }>();
      map.set('56-56.a', { id: '56-56.a', nombreBloque: '56.a', color: '#ff0000', territorioNumero: 56 });
      map.set('57-57.a', { id: '57-57.a', nombreBloque: '57.a', color: '#00ff00', territorioNumero: 57 });
      state.manzanasById.set(map);

      s.refreshOverlayMarks();

      const [, features] = markedOverlay.updateOverlay.mock.calls[0] as [
        unknown,
        Array<{ properties: Record<string, unknown> }>,
      ];
      expect(features).toHaveLength(1);
      expect(features[0].properties['color']).toBe('#00ff00');
    });

    it('renders marks of every territory once the selection is cleared', () => {
      const s = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);
      state.territoriosSeleccionados.set([]);

      const map = new Map<string, { id: string; nombreBloque: string; color: string; territorioNumero: number }>();
      map.set('56-56.a', { id: '56-56.a', nombreBloque: '56.a', color: '#ff0000', territorioNumero: 56 });
      map.set('57-57.a', { id: '57-57.a', nombreBloque: '57.a', color: '#00ff00', territorioNumero: 57 });
      state.manzanasById.set(map);

      s.refreshOverlayMarks();

      const [, features] = markedOverlay.updateOverlay.mock.calls[0] as [
        unknown,
        Array<{ properties: Record<string, unknown> }>,
      ];
      expect(features).toHaveLength(2);
    });

    it('fetches uncached territory geometry on demand and repaints', async () => {
      const s = serviceWithMetadata();
      // Simulate a territory whose geometry was never fetched.
      s['geoJsonFeatures'].delete(57);
      territorios.getGeoJsonByTerritorio.mockResolvedValue(
        JSON.stringify({
          type: 'FeatureCollection',
          features: fc.features.filter(f => f.properties?.['territorio_padre'] === 57),
        }),
      );
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);

      const map = new Map<string, { id: string; nombreBloque: string; color: string; territorioNumero: number }>();
      map.set('57-57.a', { id: '57-57.a', nombreBloque: '57.a', color: '#00ff00', territorioNumero: 57 });
      state.manzanasById.set(map);

      s.refreshOverlayMarks();

      // Geometry not cached yet → first paint has nothing to match.
      expect(markedOverlay.updateOverlay).toHaveBeenCalledTimes(1);
      expect(markedOverlay.updateOverlay.mock.calls[0][1]).toEqual([]);
      expect(territorios.getGeoJsonByTerritorio).toHaveBeenCalledWith(57);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(territorios.getGeoJsonByTerritorio).toHaveBeenCalledTimes(1);
      expect(markedOverlay.updateOverlay).toHaveBeenCalledTimes(2);
      const [, features] = markedOverlay.updateOverlay.mock.calls[1] as [
        unknown,
        Array<{ properties: Record<string, unknown> }>,
      ];
      expect(features).toHaveLength(1);
      expect(features[0].properties['color']).toBe('#00ff00');
    });

    it('fails a territory geometry fetch once and degrades without retrying', async () => {
      const s = serviceWithMetadata();
      s['geoJsonFeatures'].delete(57);
      territorios.getGeoJsonByTerritorio.mockRejectedValue(new Error('offline'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);

      const map = new Map<string, { id: string; nombreBloque: string; color: string; territorioNumero: number }>();
      map.set('57-57.a', { id: '57-57.a', nombreBloque: '57.a', color: '#00ff00', territorioNumero: 57 });
      state.manzanasById.set(map);

      s.refreshOverlayMarks();
      await new Promise(resolve => setTimeout(resolve, 0));
      s.refreshOverlayMarks();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(territorios.getGeoJsonByTerritorio).toHaveBeenCalledTimes(1);
      expect(markedOverlay.updateOverlay).toHaveBeenLastCalledWith(fakeEngine, []);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('synthesizes a partial zone from its saved geometry with the mark color', () => {
      const s = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);
      state.manzanasById.set(
        new Map([
          ['parcial-X', { id: 'parcial-X', nombreBloque: '', color: '#ff0000', territorioNumero: 56 }],
        ]),
      );
      state.setDatosParciales(56, {
        puntos: [],
        geometria: JSON.stringify({
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        }),
      });

      s.refreshOverlayMarks();

      const [, features] = markedOverlay.updateOverlay.mock.calls[0] as [
        unknown,
        Array<{ properties: Record<string, unknown>; geometry: { type?: string } }>,
      ];
      expect(features).toHaveLength(1);
      expect(features[0].properties['color']).toBe('#ff0000');
      // A partial zone is never "complete" — it cannot grey out on zoom.
      expect(features[0].properties['completo']).toBe(false);
      expect(features[0].geometry.type).toBe('Polygon');
    });

    it('chains to the current territory color when the partial mark has none', () => {
      const s = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);
      state.currentTerritoryColor.set('#00ff00');
      state.manzanasById.set(
        new Map([
          ['parcial-X', { id: 'parcial-X', nombreBloque: '', color: '', territorioNumero: 56 }],
        ]),
      );
      state.setDatosParciales(56, {
        puntos: [],
        geometria: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
      });

      s.refreshOverlayMarks();

      const [, features] = markedOverlay.updateOverlay.mock.calls[0] as [
        unknown,
        Array<{ properties: Record<string, unknown> }>,
      ];
      expect(features[0].properties['color']).toBe('#00ff00');
    });

    it('renders the green fallback when no color source is set', () => {
      const s = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);
      state.manzanasById.set(
        new Map([
          ['parcial-X', { id: 'parcial-X', nombreBloque: '', color: '', territorioNumero: 56 }],
        ]),
      );
      state.setDatosParciales(56, {
        puntos: [],
        geometria: '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
      });

      s.refreshOverlayMarks();

      const [, features] = markedOverlay.updateOverlay.mock.calls[0] as [
        unknown,
        Array<{ properties: Record<string, unknown> }>,
      ];
      expect(features[0].properties['color']).toBe('#22c55e');
    });

    it('skips partial marks without saved geometry', () => {
      const s = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);
      state.manzanasById.set(
        new Map([
          ['parcial-X', { id: 'parcial-X', nombreBloque: '', color: '#ff0000', territorioNumero: 56 }],
        ]),
      );

      s.refreshOverlayMarks();

      expect(markedOverlay.updateOverlay).toHaveBeenCalledWith(fakeEngine, []);
    });

    it('skips partial marks whose saved geometry is malformed', () => {
      const s = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);
      state.manzanasById.set(
        new Map([
          ['parcial-X', { id: 'parcial-X', nombreBloque: '', color: '#ff0000', territorioNumero: 56 }],
        ]),
      );
      state.setDatosParciales(56, { puntos: [], geometria: 'not-json' });

      s.refreshOverlayMarks();

      expect(markedOverlay.updateOverlay).toHaveBeenCalledWith(fakeEngine, []);
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

  describe('selected manzana highlight', () => {
    it('initializes the overlay when the engine is attached', () => {
      facade.initSelectedManzanaOverlay(fakeEngine as never);

      expect(selectedOverlay.initOverlay).toHaveBeenCalledWith(fakeEngine);
    });

    it('highlights the tapped manzana from the per-territory geometry', () => {
      facade = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      facade.initSelectedManzanaOverlay(fakeEngine as never);
      state.territoriosSeleccionados.set([56]);
      selectedOverlay.setSelected.mockClear();

      facade.setSelectedManzana('56-56.a', '56.a', 56);

      expect(selectedOverlay.setSelected).toHaveBeenCalledWith(
        fakeEngine,
        expect.objectContaining({
          type: 'Feature',
          properties: expect.objectContaining({ id: '56-56.a', territorio_padre: 56 }),
        }),
      );
    });

    it('clears the highlight instead of leaving a stale polygon when the feature is unknown', () => {
      facade = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      facade.initSelectedManzanaOverlay(fakeEngine as never);
      state.territoriosSeleccionados.set([56]);

      facade.setSelectedManzana('999', 'no-existe', 56);

      expect(selectedOverlay.setSelected).toHaveBeenCalledWith(fakeEngine, null);
    });

    it('does not highlight a manzana whose territory is no longer selected', () => {
      facade = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      facade.initSelectedManzanaOverlay(fakeEngine as never);
      // Territory 56 is NOT in the selection.
      selectedOverlay.setSelected.mockClear();

      facade.setSelectedManzana('56-56.a', '56.a', 56);

      expect(selectedOverlay.setSelected).toHaveBeenCalledWith(fakeEngine, null);
    });

    it('re-renders the highlight when a selection is refreshed', () => {
      facade = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      facade.initSelectedManzanaOverlay(fakeEngine as never);
      state.territoriosSeleccionados.set([56]);
      facade.setSelectedManzana('56-56.a', '56.a', 56);
      selectedOverlay.setSelected.mockClear();

      facade.refreshMarksVisual();

      expect(selectedOverlay.setSelected).toHaveBeenCalled();
    });

    it('drops the highlight once the territory is deselected', () => {
      facade = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      facade.initSelectedManzanaOverlay(fakeEngine as never);
      state.territoriosSeleccionados.set([56]);
      facade.setSelectedManzana('56-56.a', '56.a', 56);
      selectedOverlay.setSelected.mockClear();

      state.territoriosSeleccionados.set([]);
      facade.refreshMarksVisual();

      expect(selectedOverlay.setSelected).toHaveBeenCalledWith(fakeEngine, null);
    });

    it('clears an active highlight on request', () => {
      facade.attachEngine(fakeEngine as never);
      facade.setSelectedManzana('56-56.a', '56.a', 56);
      selectedOverlay.setSelected.mockClear();

      facade.clearSelectedManzana();

      expect(selectedOverlay.setSelected).toHaveBeenCalledWith(fakeEngine, null);
    });

    it('destroys the highlight with the engine and resets the cached selection', () => {
      facade = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      facade.initSelectedManzanaOverlay(fakeEngine as never);
      facade.setSelectedManzana('56-56.a', '56.a', 56);
      selectedOverlay.destroy.mockClear();

      facade.destroySelectedManzanaOverlay(fakeEngine as never);

      expect(selectedOverlay.destroy).toHaveBeenCalledWith(fakeEngine);
    });

    it('cannot render a highlight once the overlay was destroyed (fresh engine)', () => {
      facade = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      facade.initSelectedManzanaOverlay(fakeEngine as never);
      facade.destroySelectedManzanaOverlay(fakeEngine as never);
      selectedOverlay.isInitialized.mockReturnValue(false);
      selectedOverlay.setSelected.mockClear();

      facade.setSelectedManzana('56-56.a', '56.a', 56);

      expect(selectedOverlay.setSelected).not.toHaveBeenCalled();
    });

    it('is a no-op when nothing is highlighted', () => {
      facade.attachEngine(fakeEngine as never);

      facade.clearSelectedManzana();

      expect(selectedOverlay.setSelected).not.toHaveBeenCalled();
    });

    it('renders nothing before the overlay is initialized', () => {
      facade.attachEngine(fakeEngine as never);
      selectedOverlay.isInitialized.mockReturnValue(false);

      facade.setSelectedManzana('56-56.a', '56.a', 56);

      expect(selectedOverlay.setSelected).not.toHaveBeenCalled();
    });
  });

  describe('legacy MapLibre shims', () => {
    it('fetchAndBuildFeatureLayers populates FeatureLayer metadata from colors', async () => {
      await facade.fetchAndBuildFeatureLayers(
        territorios as unknown as TerritorioService,
      );

      expect(facade.getFeatureLayerByTerritorio(56)).toEqual({
        territorioPadre: 56,
        color: '#00A86B',
        layer: null,
      });
      expect(facade.getAllTerritoriesLayer()).toHaveLength(2);
    });

    it('fetchAndBuildFeatureLayers tolerates a colors failure (tiles still render)', async () => {
      territorios.getColores.mockRejectedValue(new Error('offline'));

      await expect(
        facade.fetchAndBuildFeatureLayers(
          territorios as unknown as TerritorioService,
        ),
      ).resolves.toBeUndefined();

      expect(facade.getAllTerritoriesLayer()).toEqual([]);
    });

    it('loadAllTerritories is a no-op (tiles load territories)', async () => {
      await facade.loadAllTerritories();

      expect(facade.getAllTerritoriesLayer()).toEqual([]);
      expect(territorios.getTerritoryMetadata).not.toHaveBeenCalled();
    });

    it('getTerritoryDataCache returns an empty Map', () => {
      const cache = facade.getTerritoryDataCache();

      expect(cache).toBeInstanceOf(Map);
      expect(cache.size).toBe(0);
    });

    it('hasCachedGeojson is always false (geometry is fetched on demand)', () => {
      expect(facade.hasCachedGeojson()).toBe(false);
    });

    it('podarGeojsonCache is a no-op', () => {
      expect(() => facade.podarGeojsonCache(new Set([56, 57]))).not.toThrow();
    });
  });

  describe('metadata fallbacks', () => {
    it('returns null/empty before the metadata is loaded', () => {
      expect(facade.getBoundsByTerritorio(56)).toBeNull();
      expect(facade.getCentroidByTerritorio(56)).toBeNull();
      expect(facade.getTerritoriosConMetadata()).toEqual([]);
      expect(facade.hasGeoJsonMetadata()).toBe(false);
    });
  });

  describe('parseTerritoryMetadata DTO validation (trust boundary)', () => {
    const base: TerritoryMetadataDto = {
      numero: 1,
      nombre: 'T1',
      color: '#fff',
      bounds: null,
      center: null,
      manzanaCount: 1,
      fids: [],
    };

    it.each([
      ['a non-string nombre', { nombre: 42 }],
      ['a non-string color', { color: 42 }],
      ['a non-numeric manzanaCount', { manzanaCount: 'x' }],
      ['a negative manzanaCount', { manzanaCount: -1 }],
      ['a non-array fids', { fids: 'nope' }],
      ['a non-numeric fid', { fids: [1, 'x'] }],
      ['a non-array bounds', { bounds: 'nope' }],
      ['a wrong-length bounds tuple', { bounds: [1, 2] }],
      ['a non-finite bounds entry', { bounds: [1, 2, 3, 'x'] }],
      ['a wrong-length center tuple', { center: [1] }],
      ['a non-finite center entry', { center: [1, Number.POSITIVE_INFINITY] }],
    ] as Array<[string, Record<string, unknown>]>)(
      'skips a DTO with %s',
      (_, patch) => {
        const meta = parseTerritoryMetadata([{ ...base, ...patch }]);

        expect(meta).not.toBeNull();
        expect(meta?.manzanaCounts.size).toBe(0);
        expect(meta?.boundsByTerritorio.size).toBe(0);
        expect(meta?.centroidsByTerritorio.size).toBe(0);
      },
    );

    it('keeps a DTO with explicit null bounds/center (no geometry yet)', () => {
      const meta = parseTerritoryMetadata([base]);

      expect(meta).not.toBeNull();
      expect(meta?.manzanaCounts.get(1)).toBe(1);
      expect(meta?.boundsByTerritorio.size).toBe(0);
      expect(meta?.centroidsByTerritorio.size).toBe(0);
    });
  });

  describe('fitBoundsToTerritorios (extra branches)', () => {
    it('unions the bounds across several territories', () => {
      const fitBounds = vi.fn();
      facade.attachEngine({ fitBounds } as never);
      const s = TestBed.inject(MapRenderingFacade);
      s['metadata'] = buildTerritorioMetadata(METADATA_DTO);

      s.fitBoundsToTerritorios([56, 57]);

      expect(fitBounds).toHaveBeenCalledWith(
        [
          [-73.3, -37.4],
          [-72.8, -36.9],
        ],
        { padding: 30 },
      );
    });

    it('skips territories without known bounds', () => {
      const fitBounds = vi.fn();
      facade.attachEngine({ fitBounds } as never);
      const s = TestBed.inject(MapRenderingFacade);
      s['metadata'] = buildTerritorioMetadata(METADATA_DTO);

      s.fitBoundsToTerritorios([999, 56]);

      expect(fitBounds).toHaveBeenCalledWith(
        [
          [-73.3, -37.4],
          [-73.05, -37.15],
        ],
        { padding: 30 },
      );
    });

    it('no-ops when no selected territory has bounds', () => {
      const fitBounds = vi.fn();
      facade.attachEngine({ fitBounds } as never);
      const s = TestBed.inject(MapRenderingFacade);
      s['metadata'] = buildTerritorioMetadata(METADATA_DTO);

      s.fitBoundsToTerritorios([999, 1000]);

      expect(fitBounds).not.toHaveBeenCalled();
    });
  });

  describe('partial-zone saved geometry (parseSavedGeometry)', () => {
    function refreshWithSavedGeometry(geometria: string): void {
      const s = serviceWithMetadata();
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);
      state.manzanasById.set(
        new Map([
          ['parcial-X', { id: 'parcial-X', nombreBloque: '', color: '#ff0000', territorioNumero: 56 }],
        ]),
      );
      state.setDatosParciales(56, { puntos: [], geometria });

      s.refreshOverlayMarks();
    }

    it('renders a LineString partial zone from its saved geometry', () => {
      refreshWithSavedGeometry(
        '{"type":"LineString","coordinates":[[0,0],[1,1]]}',
      );

      const [, features] = markedOverlay.updateOverlay.mock.calls[0] as [
        unknown,
        Array<{ properties: Record<string, unknown>; geometry: { type?: string } }>,
      ];
      expect(features).toHaveLength(1);
      expect(features[0].geometry.type).toBe('LineString');
      expect(features[0].properties['color']).toBe('#ff0000');
    });

    it.each([
      ['a non-object JSON value', '5'],
      ['a JSON null', 'null'],
      ['an unsupported geometry type', '{"type":"Point","coordinates":[1,2]}'],
      ['a Polygon with empty coordinates', '{"type":"Polygon","coordinates":[]}'],
      ['a LineString with empty coordinates', '{"type":"LineString","coordinates":[]}'],
    ])('skips partial marks whose saved geometry is %s', (_, geometria) => {
      refreshWithSavedGeometry(geometria);

      expect(markedOverlay.updateOverlay).toHaveBeenCalledWith(fakeEngine, []);
    });
  });

  describe('refreshOverlayMarks (matched feature without properties)', () => {
    it('paints a matched feature carrying null properties', () => {
      const s = TestBed.inject(MapRenderingFacade);
      s['metadata'] = buildTerritorioMetadata(METADATA_DTO);
      s['geoJsonFeatures'].set(56, [
        {
          type: 'Feature',
          id: '56-56.a',
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
          properties: null,
        } as GeoJSON.Feature,
      ]);
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);
      state.manzanasById.set(
        new Map([
          ['56-56.a', { id: '56-56.a', nombreBloque: '56.a', color: '#ff0000', territorioNumero: 56 }],
        ]),
      );

      s.refreshOverlayMarks();

      const [, features] = markedOverlay.updateOverlay.mock.calls[0] as [
        unknown,
        Array<{ properties: Record<string, unknown> }>,
      ];
      expect(features).toHaveLength(1);
      expect(features[0].properties['color']).toBe('#ff0000');
      expect(features[0].properties['completo']).toBe(false);
    });
  });

  describe('ensureGeoJsonGeometry (private, direct unit tests)', () => {
    it('deduplicates concurrent fetches, then skips cached territories', async () => {
      const s = TestBed.inject(MapRenderingFacade);
      let resolveFetch: (raw: string) => void = () => undefined;
      territorios.getGeoJsonByTerritorio.mockReturnValue(
        new Promise<string>(resolve => {
          resolveFetch = resolve;
        }),
      );

      const first = s['ensureGeoJsonGeometry'](56);
      const second = s['ensureGeoJsonGeometry'](56);

      // In-flight dedup: the second call returns the very same promise.
      expect(second).toBe(first);
      expect(territorios.getGeoJsonByTerritorio).toHaveBeenCalledTimes(1);

      resolveFetch(JSON.stringify(fc));
      await first;

      expect(s.getGeoJsonFeaturesByTerritorio(56)).toHaveLength(3);

      // Already cached → resolved without a new fetch.
      await s['ensureGeoJsonGeometry'](56);
      expect(territorios.getGeoJsonByTerritorio).toHaveBeenCalledTimes(1);
    });

    it('does not retry a territory that already failed this session', async () => {
      const s = TestBed.inject(MapRenderingFacade);
      territorios.getGeoJsonByTerritorio.mockRejectedValueOnce(
        new Error('offline'),
      );
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      await s['ensureGeoJsonGeometry'](57);
      await s['ensureGeoJsonGeometry'](57);

      expect(territorios.getGeoJsonByTerritorio).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });

    it.each([
      ['malformed JSON', '{oops'],
      ['a non-object payload', '"hi"'],
      ['a payload without a features array', '{"type":"FeatureCollection"}'],
    ])('fails a territory whose geometry payload is %s', async (_, raw) => {
      const s = TestBed.inject(MapRenderingFacade);
      territorios.getGeoJsonByTerritorio.mockResolvedValue(raw);
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      await s['ensureGeoJsonGeometry'](57);

      expect(s.getGeoJsonFeaturesByTerritorio(57)).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('invalid geometry for territory 57'),
      );

      // Failed territory → no retry.
      await s['ensureGeoJsonGeometry'](57);
      expect(territorios.getGeoJsonByTerritorio).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });

    it('keeps only well-formed features from a payload with bad entries', async () => {
      const s = TestBed.inject(MapRenderingFacade);
      const valid57 = fc.features.find(
        f => f.properties?.['territorio_padre'] === 57,
      ) as GeoJSON.Feature;
      territorios.getGeoJsonByTerritorio.mockResolvedValue(
        JSON.stringify({
          type: 'FeatureCollection',
          features: [
            null,
            { type: 'NotAFeature', geometry: valid57.geometry },
            { type: 'Feature', geometry: null },
            valid57,
          ],
        }),
      );

      await s['ensureGeoJsonGeometry'](57);

      const features = s.getGeoJsonFeaturesByTerritorio(57);
      expect(features).toHaveLength(1);
      expect(features[0]).toEqual(valid57);
    });

    it('discards geometry that arrives after a metadata reload (stale generation)', async () => {
      const s = TestBed.inject(MapRenderingFacade);
      let resolveFetch: (raw: string) => void = () => undefined;
      territorios.getGeoJsonByTerritorio.mockReturnValue(
        new Promise<string>(resolve => {
          resolveFetch = resolve;
        }),
      );

      const pending = s['ensureGeoJsonGeometry'](57);
      await s.loadTerritoryMetadata(); // bumps the generation, clears caches
      resolveFetch(JSON.stringify(fc));
      await pending;

      expect(s.getGeoJsonFeaturesByTerritorio(57)).toEqual([]);
      expect(territorios.getGeoJsonByTerritorio).toHaveBeenCalledTimes(1);
    });

    it('ignores a fetch failure that lands after a metadata reload', async () => {
      const s = TestBed.inject(MapRenderingFacade);
      let rejectFetch: (reason?: unknown) => void = () => undefined;
      territorios.getGeoJsonByTerritorio.mockReturnValue(
        new Promise<string>((_, reject) => {
          rejectFetch = reject;
        }),
      );
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      const pending = s['ensureGeoJsonGeometry'](57);
      await s.loadTerritoryMetadata(); // bumps the generation
      rejectFetch(new Error('late failure'));
      await pending; // must resolve — the catch swallows the stale error

      expect(warn).not.toHaveBeenCalled();
      expect(s['geoJsonFailed'].has(57)).toBe(false);
      warn.mockRestore();
    });
  });

  describe('healGeoJsonGeometry (private, via public entry points)', () => {
    it('does not fetch geometry before an engine is attached', () => {
      const s = serviceWithMetadata();
      s['geoJsonFeatures'].delete(57);
      state.manzanasById.set(
        new Map([
          ['57-57.a', { id: '57-57.a', nombreBloque: '57.a', color: '#00ff00', territorioNumero: 57 }],
        ]),
      );

      // setSelectedManzana reaches the heal directly (no engine guard there).
      s.setSelectedManzana('57-57.a', '57.a', 57);

      expect(territorios.getGeoJsonByTerritorio).not.toHaveBeenCalled();
    });

    it('does not start a second heal while one is in flight', async () => {
      const s = serviceWithMetadata();
      s['geoJsonFeatures'].delete(57);
      let resolveFetch: (raw: string) => void = () => undefined;
      territorios.getGeoJsonByTerritorio.mockReturnValue(
        new Promise<string>(resolve => {
          resolveFetch = resolve;
        }),
      );
      facade.attachEngine(fakeEngine as never);
      markedOverlay.isInitialized.mockReturnValue(true);
      state.manzanasById.set(
        new Map([
          ['57-57.a', { id: '57-57.a', nombreBloque: '57.a', color: '#00ff00', territorioNumero: 57 }],
        ]),
      );

      facade.refreshOverlayMarks();
      facade.refreshOverlayMarks(); // still healing → skipped

      expect(territorios.getGeoJsonByTerritorio).toHaveBeenCalledTimes(1);

      resolveFetch(
        JSON.stringify({
          type: 'FeatureCollection',
          features: fc.features.filter(
            f => f.properties?.['territorio_padre'] === 57,
          ),
        }),
      );
      await new Promise(resolve => setTimeout(resolve, 0));

      const last = markedOverlay.updateOverlay.mock.calls.at(-1) as [
        unknown,
        Array<{ properties: Record<string, unknown> }>,
      ];
      expect(last[1]).toHaveLength(1);
      expect(last[1][0].properties['color']).toBe('#00ff00');
    });
  });

  describe('refreshMarksVisual (engine guard)', () => {
    it('no-ops when no engine is attached', () => {
      facade.refreshMarksVisual();

      expect(vectorTile.resetFillOpacity).not.toHaveBeenCalled();
      expect(vectorTile.setSelectedTerritoriesOpacity).not.toHaveBeenCalled();
      expect(markedOverlay.updateOverlay).not.toHaveBeenCalled();
      expect(selectedOverlay.setSelected).not.toHaveBeenCalled();
    });
  });
});