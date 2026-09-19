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
      properties: { id: '56-56.a', nombre_bloque: '56.a', territorio_padre: 56 },
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
      properties: { id: '57-57.a', nombre_bloque: '57.a', territorio_padre: 57 },
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
    overlay = { addOverlay: vi.fn(), updateOverlay: vi.fn(), removeOverlay: vi.fn() };
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

    it('builds a LineString preview with the active color when the engine is set', async () => {
      await service.iniciarDibujo('554', '56.a', '#ff0000', 56, engine);
      overlay.addOverlay.mockClear();
      overlay.updateOverlay.mockClear();
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
      expect(overlay.updateOverlay).toHaveBeenCalledWith(fc, engine);
    });
  });

  describe('deshacerPunto', () => {
    it('removes the last point and shrinks the preview', async () => {
      await service.iniciarDibujo('554', '56.a', '#ff0000', 56, engine);
      overlay.updateOverlay.mockClear();
      service.agregarPunto({ latlng: { lat: 0, lng: 0 }, edgeIdx: 0, t: 0 });
      service.agregarPunto({ latlng: { lat: 1, lng: 1 }, edgeIdx: 0, t: 0.5 });

      service.deshacerPunto();

      expect(state.puntosParciales()).toHaveLength(1);
      expect(overlay.updateOverlay).toHaveBeenCalled();
    });

    it('clears the preview when the last point is removed', async () => {
      await service.iniciarDibujo('554', '56.a', '#ff0000', 56, engine);
      service.agregarPunto({ latlng: { lat: 0, lng: 0 }, edgeIdx: 0, t: 0 });
      service.deshacerPunto();

      expect(state.partialDrawGeoJson()).toBeNull();
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
      expect(state.puntosParciales()).toEqual([]);
      expect(state.modoMarcado()).toBe('none');
      expect(rendering.refreshMarksVisual).toHaveBeenCalled();
      expect(overlay.removeOverlay).toHaveBeenCalledWith(engine);
      expect(state.partialDrawGeoJson()).toBeNull();
      expect(toast.show).toHaveBeenCalledWith('Zona parcial marcada — tocá para eliminar');
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
});