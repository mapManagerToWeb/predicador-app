import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  MapPartialMarkService,
  findTargetManzana,
  featureToEdges,
} from './map-partial-mark.service';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { MapEditOverlayService } from './map-edit-overlay.service';
import { createMapLibreProjectionAdapter } from './map-libre-projection-adapter';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import type { MapEngine } from './map-engine.interface';
import type * as GeoJSON from 'geojson';

const engine = {
  addGeoJsonSource: vi.fn(),
  updateGeoJsonSourceData: vi.fn(),
  removeLayer: vi.fn(),
  removeSource: vi.fn(),
  addLayer: vi.fn(),
  captureCanvas: vi.fn(),
  // Deterministic fake projection: x = lng*1000, y = -lat*1000 (1 lng/lat
  // degree == 1000 px), so pixel distances are trivial to reason about.
  project: vi.fn(([lng, lat]: [number, number]) => ({ x: lng * 1000, y: lat * -1000 })),
  getZoom: vi.fn(() => 14),
  getCenter: vi.fn(() => ({ lng: -73.25, lat: -37.45 })),
} as unknown as MapEngine;

const TERRITORY_GEOJSON: GeoJSON.FeatureCollection = {
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
      properties: { fid: 5541, id: '56-56.a', nombre_bloque: '56.a', territorio_padre: 56 },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-72.9, -37.0],
              [-72.8, -37.0],
              [-72.8, -36.9],
              [-72.9, -36.9],
              [-72.9, -37.0],
            ],
          ],
        ],
      },
      properties: { fid: 5543, id: '57-57.a', nombre_bloque: '57.a', territorio_padre: 57 },
    },
  ],
};

// Two manzanas of territory 56 side by side vertically: 56.a north
// (lat -37.4..-37.3), 56.b south (lat -37.6..-37.5). Splitting the
// [-37.5,-37.4] band would put 56.b's top edge at the same latitude as
// 56.a's bottom edge, making the nearest-edge tie ambiguous in the snap
// tests — with the current latitudes every candidate distance is distinct.
const TWO_MANZANA_GEOJSON: GeoJSON.FeatureCollection = {
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
      properties: { fid: 5541, id: '56-56.a', nombre_bloque: '56.a', territorio_padre: 56 },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-73.3, -37.6],
            [-73.2, -37.6],
            [-73.2, -37.5],
            [-73.3, -37.5],
            [-73.3, -37.6],
          ],
        ],
      },
      properties: { fid: 5542, id: '56-56.b', nombre_bloque: '56.b', territorio_padre: 56 },
    },
  ],
};

describe('MapPartialMarkService', () => {
  let service: MapPartialMarkService;
  let state: MapStateService;
  let rendering: {
    getAllTerritoriesLayer: ReturnType<typeof vi.fn>;
    getCurrentTerritoryColor: ReturnType<typeof vi.fn>;
    refreshMarksVisual: ReturnType<typeof vi.fn>;
  };
  let selection: {
    selectManzanaById: ReturnType<typeof vi.fn>;
    restaurarManzanaAnterior: ReturnType<typeof vi.fn>;
    limpiarParcial: ReturnType<typeof vi.fn>;
  };
  let overlay: {
    addOverlay: ReturnType<typeof vi.fn>;
    updateOverlay: ReturnType<typeof vi.fn>;
    updatePartialPreview: ReturnType<typeof vi.fn>;
    removePartialPreview: ReturnType<typeof vi.fn>;
    removeOverlay: ReturnType<typeof vi.fn>;
  };
  let territorios: { getGeoJsonByTerritorio: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    rendering = {
      getAllTerritoriesLayer: vi.fn().mockReturnValue([]),
      getCurrentTerritoryColor: vi.fn().mockReturnValue('#22c55e'),
      refreshMarksVisual: vi.fn(),
    };
    selection = {
      selectManzanaById: vi.fn(),
      restaurarManzanaAnterior: vi.fn(),
      limpiarParcial: vi.fn(),
    };
    overlay = {
      addOverlay: vi.fn(),
      updateOverlay: vi.fn(),
      updatePartialPreview: vi.fn(),
      removePartialPreview: vi.fn(),
      removeOverlay: vi.fn(),
    };
    territorios = {
      getGeoJsonByTerritorio: vi.fn().mockResolvedValue(JSON.stringify(TERRITORY_GEOJSON)),
    };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        MapPartialMarkService,
        MapStateService,
        { provide: MapRenderingFacade, useValue: rendering },
        { provide: MapSelectionService, useValue: selection },
        { provide: MapEditOverlayService, useValue: overlay },
        { provide: TerritorioService, useValue: territorios },
        { provide: Toast, useValue: toast },
      ],
    });
    service = TestBed.inject(MapPartialMarkService);
    state = TestBed.inject(MapStateService);
  });

  describe('findTargetManzana', () => {
    it('matches by nombre_bloque within the territory', () => {
      const target = findTargetManzana(TERRITORY_GEOJSON, '', '56.a', 56);
      expect(target?.properties?.['id']).toBe('56-56.a');
    });

    it('matches by feature id ("{t}-{b}")', () => {
      const target = findTargetManzana(TERRITORY_GEOJSON, '56-56.a', '', 56);
      expect(target?.properties?.['nombre_bloque']).toBe('56.a');
    });

    it('does not match a repeated block name in another territory', () => {
      const multi = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [] },
            properties: { id: '99-56.a', nombre_bloque: '56.a', territorio_padre: 99 },
          },
        ],
      } as unknown as GeoJSON.FeatureCollection;
      expect(findTargetManzana(multi, '', '56.a', 56)).toBeNull();
    });

    it('returns null when nothing matches', () => {
      expect(findTargetManzana(TERRITORY_GEOJSON, '999', 'zzz', 56)).toBeNull();
    });
  });

  describe('featureToEdges', () => {
    it('converts a closed polygon ring into edges', () => {
      const edges = featureToEdges(TERRITORY_GEOJSON.features[0]);
      expect(edges).toHaveLength(4);
      expect(edges[0]).toEqual({ from: { lat: -37.4, lng: -73.3 }, to: { lat: -37.4, lng: -73.2 } });
      expect(edges[3]).toEqual({ from: { lat: -37.3, lng: -73.3 }, to: { lat: -37.4, lng: -73.3 } });
    });

    it('flattens every ring of a MultiPolygon', () => {
      const edges = featureToEdges(TERRITORY_GEOJSON.features[1]);
      expect(edges).toHaveLength(4);
    });

    it('returns an empty list for non-polygonal geometry', () => {
      const line = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
        properties: {},
      } as unknown as GeoJSON.Feature;
      expect(featureToEdges(line)).toEqual([]);
    });
  });

  describe('iniciarDibujo', () => {
    it('selects the manzana and loads its territory geometry for snapping', async () => {
      await service.iniciarDibujo('554', '56.a', '#ff0000', 56, engine);

      expect(selection.selectManzanaById).toHaveBeenCalledWith('554', '56.a', '#ff0000', 56);
      expect(overlay.addOverlay).toHaveBeenCalledWith(TERRITORY_GEOJSON, engine);
      expect(state.editGeoJson()).toEqual(TERRITORY_GEOJSON);
      // Manzana "56.a" matched by nombre_bloque → 4 edges from its ring.
      expect(state.manzanaEdges()).toHaveLength(4);
      expect(state.partialDrawGeoJson()).toBeNull();
    });

    it('adds the overlay even when no manzana matches (free-form draw)', async () => {
      await service.iniciarDibujo('999', '', '#ff0000', 56, engine);

      expect(overlay.addOverlay).toHaveBeenCalledWith(TERRITORY_GEOJSON, engine);
      expect(state.manzanaEdges()).toEqual([]);
    });

    it('keeps the selection usable when the geometry fetch fails', async () => {
      territorios.getGeoJsonByTerritorio.mockRejectedValue(new Error('offline'));
      await expect(service.iniciarDibujo('554', '56.a', '#ff0000', 56, engine)).resolves.toBeUndefined();

      expect(selection.selectManzanaById).toHaveBeenCalled();
      expect(overlay.addOverlay).not.toHaveBeenCalled();
      expect(state.manzanaEdges()).toEqual([]);
    });
  });

  describe('agregarPunto', () => {
    it('adds the first point', () => {
      service.agregarPunto({ latlng: { lat: 0, lng: 0 }, edgeIdx: -1, t: 0 });

      expect(state.puntosParciales()).toHaveLength(1);
    });

    it('adds a second point', () => {
      service.agregarPunto({ latlng: { lat: 0, lng: 0 }, edgeIdx: -1, t: 0 });
      service.agregarPunto({ latlng: { lat: 0.00001, lng: 0.00001 }, edgeIdx: -1, t: 0 });

      expect(state.puntosParciales()).toHaveLength(2);
    });

    it('stops at 6 points with a toast', () => {
      for (let i = 0; i < 6; i++) {
        service.agregarPunto({ latlng: { lat: i, lng: i }, edgeIdx: -1, t: 0 });
      }
      service.agregarPunto({ latlng: { lat: 99, lng: 99 }, edgeIdx: -1, t: 0 });

      expect(state.puntosParciales()).toHaveLength(6);
      expect(toast.show).toHaveBeenCalledWith('Máximo 6 puntos');
    });

    it('builds a LineString preview with the active color until the polygon can close', async () => {
      await service.iniciarDibujo('554', '56.a', '#ff0000', 56, engine);
      overlay.addOverlay.mockClear();
      overlay.updatePartialPreview.mockClear();
      rendering.getCurrentTerritoryColor.mockReturnValue('#ff0000');

      service.agregarPunto({ latlng: { lat: -37.35, lng: -73.25 }, edgeIdx: 0, t: 0 });
      service.agregarPunto({ latlng: { lat: -37.3, lng: -73.2 }, edgeIdx: 1, t: 0.5 });

      const fc = state.partialDrawGeoJson();
      expect(fc?.features[0].geometry.type).toBe('LineString');
      expect((fc?.features[0].geometry as GeoJSON.LineString).coordinates).toEqual([
        [-73.25, -37.35],
        [-73.2, -37.3],
      ]);
      expect(fc?.features[0].properties?.['color']).toBe('#ff0000');
      expect(overlay.updatePartialPreview).toHaveBeenCalledWith(fc, engine);
    });

    it('builds a closed, filled polygon preview once there are 3 points', async () => {
      await service.iniciarDibujo('554', '56.a', '#ff0000', 56, engine);
      rendering.getCurrentTerritoryColor.mockReturnValue('#ff0000');
      overlay.updatePartialPreview.mockClear();

      service.agregarPunto({ latlng: { lat: 0, lng: 0 }, edgeIdx: 0, t: 0 });
      service.agregarPunto({ latlng: { lat: 0, lng: 1 }, edgeIdx: 0, t: 0.5 });
      service.agregarPunto({ latlng: { lat: 1, lng: 0 }, edgeIdx: 0, t: 1 });

      const fc = state.partialDrawGeoJson();
      expect(fc?.features[0].geometry.type).toBe('Polygon');
      expect((fc?.features[0].geometry as GeoJSON.Polygon).coordinates).toEqual([
        [
          [0, 0],
          [1, 0],
          [0, 1],
          [0, 0],
        ],
      ]);
      expect(overlay.updatePartialPreview).toHaveBeenCalledWith(fc, engine);
    });

    it('auto-fills the polygon along the real manzana contour when the points share a manzana', async () => {
      await service.iniciarDibujo('554', '56.a', '#ff0000', 56, engine);
      overlay.updatePartialPreview.mockClear();
      // All three points snap to the SAME manzana → the preview traces the
      // real contour between them (edge0 t0.5 → edge2 t0.5 → edge1 t0.5).
      const edges = featureToEdges(TERRITORY_GEOJSON.features[0]);
      service.agregarPunto({ latlng: { lat: -37.4, lng: -73.25 }, edgeIdx: 0, t: 0.5 }, edges);
      service.agregarPunto({ latlng: { lat: -37.3, lng: -73.25 }, edgeIdx: 2, t: 0.5 }, edges);
      service.agregarPunto({ latlng: { lat: -37.35, lng: -73.2 }, edgeIdx: 1, t: 0.5 }, edges);

      const ring = (state.partialDrawGeoJson()?.features[0].geometry as GeoJSON.Polygon)
        .coordinates[0];
      // Real contour: a closed 8-entry ring walking the manzana edges and
      // the contiguity points — not a bare triangle.
      expect(ring).toHaveLength(8);
      expect(ring[0][0]).toBeCloseTo(-73.25, 9);
      expect(ring[0][1]).toBeCloseTo(-37.4, 9);
      expect(ring[ring.length - 1][0]).toBeCloseTo(ring[0][0], 9);
      expect(ring[ring.length - 1][1]).toBeCloseTo(ring[0][1], 9);
      // The manzana's right edge and its north-west corner are traversed.
      expect(ring.some(c => c[0] === -73.2 && c[1] === -37.4)).toBe(true);
      expect(ring.some(c => c[0] === -73.2 && c[1] === -37.3)).toBe(true);
      expect(overlay.updatePartialPreview).toHaveBeenCalled();
    });
  });

  describe('snapToNearestManzana', () => {
    const adapter = createMapLibreProjectionAdapter(engine);

    function withTwoManzanas(): void {
      state.editGeoJson.set(TWO_MANZANA_GEOJSON);
      state.territoriosSeleccionados.set([56]);
    }

    it('snaps to the nearest UNMARKED manzana of the active territory (auto-fill)', () => {
      withTwoManzanas();

      const { snapped, edges } = service.snapToNearestManzana(
        { lat: -37.55, lng: -73.25 },
        adapter,
      );

      // 56.b (south manzana) is closest: all its edges are 50px away; the
      // first edge (bottom, t=0.5) wins the tie, pinning 56.b unambiguously.
      expect(snapped.edgeIdx).toBe(0);
      expect(snapped.t).toBeCloseTo(0.5, 9);
      expect(snapped.latlng.lat).toBeCloseTo(-37.6, 9);
      expect(snapped.latlng.lng).toBeCloseTo(-73.25, 9);
      expect(edges).toHaveLength(4);
    });

    it('skips marked manzanas so a partial zone cannot overlap an existing mark', () => {
      withTwoManzanas();
      state.manzanasById.set(
        new Map([
          ['56-56.b', { id: '56-56.b', nombreBloque: '', color: '#ff0000', territorioNumero: 56 }],
        ]),
      );

      const { snapped } = service.snapToNearestManzana({ lat: -37.55, lng: -73.25 }, adapter);

      // 56.b is excluded (marked); 56.a is ~158px away, beyond the 100px
      // threshold → free-form fallback point.
      expect(snapped.edgeIdx).toBe(-1);
      expect(snapped.latlng.lat).toBe(-37.55);
      expect(snapped.latlng.lng).toBe(-73.25);
    });

    it('excludes fid-keyed marks by bridging them through the editGeoJson features', () => {
      withTwoManzanas();
      // The per-territory GeoJSON identifies manzanas by fid (5541/5542)
      // AND by id ("56-56.b"), while this mark stores only the MVT fid
      // (5542). The bridge maps both key spaces so 5542 excludes "56-56.b".
      state.manzanasById.set(
        new Map([
          ['5542', { id: '5542', nombreBloque: '', color: '#ff0000', territorioNumero: 56 }],
        ]),
      );

      const { snapped } = service.snapToNearestManzana({ lat: -37.55, lng: -73.25 }, adapter);

      // 56.b (fid 5542) is excluded through the fid → "56-56.b" bridge; the
      // nearest remaining candidate, 56.a, is beyond the 100px threshold →
      // free-form fallback point.
      expect(snapped.edgeIdx).toBe(-1);
      expect(snapped.latlng.lat).toBe(-37.55);
      expect(snapped.latlng.lng).toBe(-73.25);
    });

    it('falls back to a free point when the tap is beyond the snap threshold', () => {
      withTwoManzanas();

      const { snapped } = service.snapToNearestManzana({ lat: -37.7, lng: -73.5 }, adapter);

      // ~223px from every edge of both manzanas → free point.
      expect(snapped.edgeIdx).toBe(-1);
      expect(snapped.latlng.lat).toBe(-37.7);
      expect(snapped.latlng.lng).toBe(-73.5);
    });
  });

  describe('deshacerPunto', () => {
    it('removes the last point and shrinks the preview', async () => {
      await service.iniciarDibujo('554', '56.a', '#ff0000', 56, engine);
      overlay.updatePartialPreview.mockClear();
      service.agregarPunto({ latlng: { lat: 0, lng: 0 }, edgeIdx: 0, t: 0 });
      service.agregarPunto({ latlng: { lat: 1, lng: 1 }, edgeIdx: 0, t: 0.5 });

      service.deshacerPunto();

      expect(state.puntosParciales()).toHaveLength(1);
      expect(overlay.updatePartialPreview).toHaveBeenCalled();
    });

    it('clears the preview when the last point is removed', async () => {
      await service.iniciarDibujo('554', '56.a', '#ff0000', 56, engine);
      service.agregarPunto({ latlng: { lat: 0, lng: 0 }, edgeIdx: 0, t: 0 });
      service.deshacerPunto();

      expect(state.partialDrawGeoJson()).toBeNull();
      expect(overlay.updatePartialPreview).toHaveBeenLastCalledWith(
        { type: 'FeatureCollection', features: [] },
        engine,
      );
    });

    it('does nothing when empty', () => {
      service.deshacerPunto();

      expect(state.puntosParciales()).toEqual([]);
    });
  });

  describe('finalizarParcial', () => {
    function pendingPoints(count: number): void {
      state.puntosParciales.set(
        Array.from({ length: count }, (_, i) => ({ latlng: { lat: i, lng: i }, edgeIdx: 0, t: i })),
      );
    }

    it('shows a toast when fewer than 3 points (polygon minimum)', () => {
      pendingPoints(2);

      service.finalizarParcial();

      expect(toast.show).toHaveBeenCalledWith('Necesitás al menos 3 puntos');
      expect(state.manzanasById().size).toBe(0);
    });

    it('shows a toast when no territory is selected', () => {
      pendingPoints(3);

      service.finalizarParcial();

      expect(toast.show).toHaveBeenCalled();
    });

    it('creates the "parcial-" mark, saves the draw points and tears down the overlay', async () => {
      state.manzanaSeleccionadaTerritorio.set(56);
      state.manzanaSeleccionadaNombre.set('56.a');
      rendering.getCurrentTerritoryColor.mockReturnValue('#ff0000');
      await service.iniciarDibujo('554', '56.a', '#ff0000', 56, engine);
      overlay.addOverlay.mockClear();
      pendingPoints(3);

      service.finalizarParcial();

      const marks = Array.from(state.manzanasById().values());
      expect(marks).toHaveLength(1);
      expect(marks[0].id).toMatch(/^parcial-/);
      expect(marks[0].nombreBloque).toBe('Parcial: 56.a');
      expect(marks[0].color).toBe('#ff0000');
      expect(marks[0].territorioNumero).toBe(56);
      expect(state.getDatosParciales(56)?.puntos).toHaveLength(3);
      // The REAL traced polygon is persisted (pendingPoints are free points
      // with no manzana edges → straight segments) — bug fix "modo parcial".
      const parcialGuardado = state.getDatosParciales(56);
      expect(JSON.parse(parcialGuardado!.geometria)).toEqual({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [2, 2],
            [0, 0],
          ],
        ],
      });
      expect(state.puntosParciales()).toEqual([]);
      expect(state.modoMarcado()).toBe('none');
      expect(rendering.refreshMarksVisual).toHaveBeenCalled();
      expect(overlay.removeOverlay).toHaveBeenCalledWith(engine);
      expect(state.partialDrawGeoJson()).toBeNull();
      expect(toast.show).toHaveBeenCalledWith('Zona parcial marcada — tocá para eliminar');
    });

    it('uses the generic name when no manzana is selected', () => {
      state.territoriosSeleccionados.set([56]);
      rendering.getCurrentTerritoryColor.mockReturnValue('#00ff00');
      pendingPoints(3);

      service.finalizarParcial();

      const marks = Array.from(state.manzanasById().values());
      expect(marks).toHaveLength(1);
      expect(marks[0].nombreBloque).toBe('Zona parcial');
      expect(marks[0].territorioNumero).toBe(56);
    });

    it('persists a LineString when the traced ring degenerates', () => {
      state.manzanaSeleccionadaTerritorio.set(56);
      rendering.getCurrentTerritoryColor.mockReturnValue('#00ff00');
      // Three coincident points dedupe down to a single vertex → the ring
      // cannot close (≥4 coords), so the geometry falls back to LineString.
      state.puntosParciales.set([
        { latlng: { lat: 1, lng: 1 }, edgeIdx: 0, t: 0 },
        { latlng: { lat: 1, lng: 1 }, edgeIdx: 0, t: 1 },
        { latlng: { lat: 1, lng: 1 }, edgeIdx: 0, t: 2 },
      ]);

      service.finalizarParcial();

      const guardado = state.getDatosParciales(56);
      expect(JSON.parse(guardado!.geometria)).toEqual({
        type: 'LineString',
        coordinates: [[1, 1]],
      });
    });

    it('falls back to the default green when no territory color is available', () => {
      state.manzanaSeleccionadaTerritorio.set(56);
      rendering.getCurrentTerritoryColor.mockReturnValue('');
      rendering.getAllTerritoriesLayer.mockReturnValue([]);
      pendingPoints(3);

      service.finalizarParcial();

      const marks = Array.from(state.manzanasById().values());
      expect(marks[0].color).toBe('#22c55e');
    });

    it('ignores a feature layer without a color', () => {
      state.manzanaSeleccionadaTerritorio.set(56);
      rendering.getCurrentTerritoryColor.mockReturnValue('');
      rendering.getAllTerritoriesLayer.mockReturnValue([{ territorioPadre: 56 }]);
      pendingPoints(3);

      service.finalizarParcial();

      const marks = Array.from(state.manzanasById().values());
      expect(marks[0].color).toBe('#22c55e');
    });

    it('works without an attached engine (SSR / teardown race)', () => {
      state.territoriosSeleccionados.set([56]);
      rendering.getCurrentTerritoryColor.mockReturnValue('#00ff00');
      pendingPoints(3);

      expect(() => service.finalizarParcial()).not.toThrow();

      const marks = Array.from(state.manzanasById().values());
      expect(marks).toHaveLength(1);
      expect(overlay.removeOverlay).not.toHaveBeenCalled();
    });
  });

  describe('limpiarDibujo without engine', () => {
    it('is a no-op on the overlay when no engine is attached', () => {
      expect(() => service.limpiarDibujo()).not.toThrow();
      expect(overlay.removeOverlay).not.toHaveBeenCalled();
      expect(state.partialDrawGeoJson()).toBeNull();
    });
  });

  describe('cancelarParcial', () => {
    it('delegates to selection service and tears down the overlay', async () => {
      await service.iniciarDibujo('554', '56.a', '#ff0000', 56, engine);
      overlay.addOverlay.mockClear();

      service.cancelarParcial();

      expect(selection.limpiarParcial).toHaveBeenCalled();
      expect(selection.restaurarManzanaAnterior).toHaveBeenCalled();
      expect(state.modoMarcado()).toBe('none');
      expect(overlay.removeOverlay).toHaveBeenCalledWith(engine);
      expect(state.partialDrawGeoJson()).toBeNull();
    });
  });

  describe('eliminarParcial', () => {
    function seedParcial(id: string, territorioNumero: number): void {
      state.manzanasById.set(
        new Map([
          [id, { id, nombreBloque: 'Zona parcial', color: '#22c55e', territorioNumero }],
        ]),
      );
      state.setDatosParciales(territorioNumero, {
        puntos: [{ lat: -33.4, lng: -70.6, edgeIdx: 0, t: 0.5 }],
        geometria: '{"type":"Polygon"}',
      });
    }

    it('removes the mark, its saved geometry and refreshes the overlay', () => {
      seedParcial('parcial-1', 56);

      service.eliminarParcial('parcial-1');

      expect(state.manzanasById().size).toBe(0);
      expect(state.datosParcialesGuardados.has(56)).toBe(false);
      expect(rendering.refreshMarksVisual).toHaveBeenCalled();
      expect(toast.show).toHaveBeenCalledWith('Zona parcial eliminada');
    });

    it('is a no-op for an unknown id', () => {
      seedParcial('parcial-1', 56);

      service.eliminarParcial('parcial-99');

      expect(state.manzanasById().has('parcial-1')).toBe(true);
      expect(state.datosParcialesGuardados.has(56)).toBe(true);
      expect(rendering.refreshMarksVisual).not.toHaveBeenCalled();
      expect(toast.show).not.toHaveBeenCalled();
    });
  });
});