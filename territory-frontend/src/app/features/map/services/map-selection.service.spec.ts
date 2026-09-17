import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapMarkRestorationService } from './map-mark-restoration.service';
import { Toast } from '../../../core/services/toast';
import { DraftMarksService } from './map-draft';

function fakePath(): { setStyle: ReturnType<typeof vi.fn>; getLatLngs: ReturnType<typeof vi.fn> } {
  return {
    setStyle: vi.fn(),
    getLatLngs: vi.fn(() => [
      [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 0 },
        { lat: 1, lng: 1 },
        { lat: 0, lng: 1 },
        { lat: 0, lng: 0 },
      ],
    ]),
  };
}

function fakeManzana(id: string, territorioNumero: number, polygon?: ReturnType<typeof fakePath>) {
  return {
    id,
    nombreBloque: `Bloque-${id}`,
    color: '#ff0000',
    territorioNumero,
    bbox: { minLat: -1, maxLat: 2, minLng: -1, maxLng: 2 },
    polygon: polygon ?? fakePath(),
  };
}

describe('MapSelectionService', () => {
  let service: MapSelectionService;
  let state: MapStateService;
  let rendering: {
    getManzanaIndex: ReturnType<typeof vi.fn>;
    getAllTerritoriesLayer: ReturnType<typeof vi.fn>;
    ocultarPoligonosNoSeleccionados: ReturnType<typeof vi.fn>;
    setCurrentTerritoryColor: ReturnType<typeof vi.fn>;
    getCurrentTerritoryColor: ReturnType<typeof vi.fn>;
    ensureTerritoryLoaded: ReturnType<typeof vi.fn>;
    getMap: ReturnType<typeof vi.fn>;
    applyBaseTerritoryStyle: ReturnType<typeof vi.fn>;
    applyStyleToFeatureLayer: ReturnType<typeof vi.fn>;
    addExtraLayer: ReturnType<typeof vi.fn>;
    removeExtraLayer: ReturnType<typeof vi.fn>;
    clearExtraLayers: ReturnType<typeof vi.fn>;
    limpiarCapasParciales: ReturnType<typeof vi.fn>;
    limpiarMarcasVisuales: ReturnType<typeof vi.fn>;
    reaplicarMarcasTerritorio: ReturnType<typeof vi.fn>;
    restaurarVisibilidadPoligonos: ReturnType<typeof vi.fn>;
    cancelPendingStyleUpdates: ReturnType<typeof vi.fn>;
    getFeatureLayerByTerritorio: ReturnType<typeof vi.fn>;
    getManzanaCountByTerritorio: ReturnType<typeof vi.fn>;
  };
  let toast: { show: ReturnType<typeof vi.fn> };
  let restoration: {
    restaurarDesdeDB: ReturnType<typeof vi.fn>;
    restaurarConReportes: ReturnType<typeof vi.fn>;
  };
  let drafts: { clear: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    rendering = {
      getManzanaIndex: vi.fn().mockReturnValue([{ territorioNumero: 1 }]),
      getAllTerritoriesLayer: vi.fn().mockReturnValue([]),
      ocultarPoligonosNoSeleccionados: vi.fn(),
      setCurrentTerritoryColor: vi.fn(),
      getCurrentTerritoryColor: vi.fn().mockReturnValue('#fff'),
      ensureTerritoryLoaded: vi.fn(),
      getMap: vi.fn().mockReturnValue(null),
      applyBaseTerritoryStyle: vi.fn(),
      applyStyleToFeatureLayer: vi.fn(),
      addExtraLayer: vi.fn(),
      removeExtraLayer: vi.fn(),
      clearExtraLayers: vi.fn(),
      limpiarCapasParciales: vi.fn(),
      limpiarMarcasVisuales: vi.fn(),
      reaplicarMarcasTerritorio: vi.fn(),
      restaurarVisibilidadPoligonos: vi.fn(),
      cancelPendingStyleUpdates: vi.fn(),
      getFeatureLayerByTerritorio: vi.fn().mockReturnValue(undefined),
      getManzanaCountByTerritorio: vi.fn().mockReturnValue(0),
    };
    toast = { show: vi.fn() };
    restoration = {
      restaurarDesdeDB: vi.fn().mockResolvedValue(undefined),
      restaurarConReportes: vi.fn(),
    };
    drafts = { clear: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        MapSelectionService,
        MapStateService,
        { provide: MapRenderingFacade, useValue: rendering },
        { provide: MapMarkRestorationService, useValue: restoration },
        { provide: Toast, useValue: toast },
        { provide: DraftMarksService, useValue: drafts },
      ],
    });
    service = TestBed.inject(MapSelectionService);
    state = TestBed.inject(MapStateService);
  });

  describe('toggleManzana', () => {
    it('unregisters the exact manzana that was unmarked, not a neighbor', () => {
      state.territoriosSeleccionados.set([1]);
      state.manzanasById.set(new Map([
        ['m1', { id: 'm1', nombreBloque: 'A', color: '#fff', territorioNumero: 1 }],
        ['m2', { id: 'm2', nombreBloque: 'B', color: '#fff', territorioNumero: 1 }],
      ]));

      service.toggleManzana('m1', 'A', undefined, '#fff', 1);

      expect(state.manzanasById().has('m1')).toBe(false);
      expect(state.manzanasById().has('m2')).toBe(true);
      expect(state.manzanasMarcadaList()).toEqual([
        { id: 'm2', nombreBloque: 'B', color: '#fff', territorioNumero: 1 },
      ]);
    });

    it('removes the territory from the selection when its last manzana is unmarked', () => {
      state.territoriosSeleccionados.set([1]);
      state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#fff', territorioNumero: 1 }]]));

      service.toggleManzana('m1', 'A', undefined, '#fff', 1);

      expect(state.territoriosSeleccionados()).not.toContain(1);
      expect(state.manzanasById().has('m1')).toBe(false);
    });

    it('marks a manzana and selects its territory', () => {
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1', 1), fakeManzana('m2', 1)]);
      rendering.getAllTerritoriesLayer.mockReturnValue([
        { territorioPadre: 1, color: '#ff0000', layer: {} },
      ]);

      service.toggleManzana('m1', 'Bloque-m1', undefined, '#ff0000', 1);

      expect(state.manzanasMarcadaList()).toEqual([
        { id: 'm1', nombreBloque: 'Bloque-m1', color: '#ff0000', territorioNumero: 1 },
      ]);
      expect(state.manzanasById().has('m1')).toBe(true);
      expect(state.territoriosSeleccionados()).toContain(1);
      expect(rendering.ocultarPoligonosNoSeleccionados).toHaveBeenCalled();
    });
  });

  describe('marcarManzana', () => {
    it('marks a manzana, selects its territory and updates totalManzanas', () => {
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1', 1)]);
      rendering.getManzanaCountByTerritorio.mockReturnValue(10);
      rendering.getFeatureLayerByTerritorio.mockReturnValue({ color: '#ff0000', layer: {} });

      service.marcarManzana('m1', 'Bloque-m1', undefined, '#ff0000', 1);

      expect(state.manzanasMarcadaList()).toEqual([
        { id: 'm1', nombreBloque: 'Bloque-m1', color: '#ff0000', territorioNumero: 1 },
      ]);
      expect(state.manzanasById().has('m1')).toBe(true);
      expect(state.territoriosSeleccionados()).toContain(1);
      expect(rendering.ocultarPoligonosNoSeleccionados).toHaveBeenCalled();
      expect(state.totalManzanas()).toBe(10);
    });

    it('does not unmark an already-marked manzana (mark-only)', () => {
      rendering.getManzanaCountByTerritorio.mockReturnValue(5);
      state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#ff0000', territorioNumero: 1 }]]));
      state.territoriosSeleccionados.set([1]);
      state.totalManzanas.set(7);

      service.marcarManzana('m1', 'A', undefined, '#ff0000', 1);

      expect(state.manzanasMarcadaList()).toEqual([
        { id: 'm1', nombreBloque: 'A', color: '#ff0000', territorioNumero: 1 },
      ]);
      expect(state.manzanasById().has('m1')).toBe(true);
      expect(state.territoriosSeleccionados()).toEqual([1]);
      // La selección no cambió, así que el total permanece intacto.
      expect(state.totalManzanas()).toBe(7);
    });
  });

  describe('selectManzanaById', () => {
    it('sets selection state and selects territory without requiring a Leaflet Polygon', () => {
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1', 1)]);
      rendering.getAllTerritoriesLayer.mockReturnValue([
        { territorioPadre: 1, color: '#ff0000', layer: {} },
      ]);
      rendering.getFeatureLayerByTerritorio.mockReturnValue({ color: '#ff0000', layer: {} });
      rendering.getManzanaCountByTerritorio.mockReturnValue(10);

      service.selectManzanaById('m1', 'Bloque-m1', '#ff0000', 1);

      expect(state.manzanaSeleccionadaColor()).toBe('#ff0000');
      expect(state.manzanaSeleccionadaNombre()).toBe('Bloque-m1');
      expect(state.manzanaSeleccionadaTerritorio()).toBe(1);
      expect(state.manzanaEdges()).toEqual([]);
      expect(state.territoriosSeleccionados()).toContain(1);
      expect(rendering.setCurrentTerritoryColor).toHaveBeenCalledWith('#ff0000');
    });

    it('restores previous selection before selecting a new one', () => {
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1', 1)]);
      rendering.getAllTerritoriesLayer.mockReturnValue([
        { territorioPadre: 1, color: '#ff0000', layer: {} },
      ]);
      rendering.getFeatureLayerByTerritorio.mockReturnValue({ color: '#ff0000', layer: {} });
      rendering.getManzanaCountByTerritorio.mockReturnValue(10);

      service.selectManzanaById('m1', 'A', '#ff0000', 1);
      expect(state.manzanaSeleccionadaNombre()).toBe('A');

      service.selectManzanaById('m2', 'B', '#00ff00', 1);
      expect(state.manzanaSeleccionadaNombre()).toBe('B');
      expect(state.manzanaSeleccionadaColor()).toBe('#00ff00');
    });
  });

  describe('toggleManzanaById', () => {
    it('marks a manzana by ID without requiring a Leaflet Path', () => {
      rendering.getManzanaCountByTerritorio.mockReturnValue(10);
      rendering.getFeatureLayerByTerritorio.mockReturnValue({ color: '#ff0000', layer: {} });

      service.toggleManzanaById('m1', 'Bloque-m1', '#ff0000', 1);

      expect(state.manzanasMarcadaList()).toEqual([
        { id: 'm1', nombreBloque: 'Bloque-m1', color: '#ff0000', territorioNumero: 1 },
      ]);
      expect(state.territoriosSeleccionados()).toContain(1);
    });

    it('unmarks a manzana by ID', () => {
      state.territoriosSeleccionados.set([1]);
      state.manzanasById.set(new Map([
        ['m1', { id: 'm1', nombreBloque: 'A', color: '#fff', territorioNumero: 1 }],
      ]));
      rendering.getManzanaCountByTerritorio.mockReturnValue(5);

      service.toggleManzanaById('m1', 'A', '#fff', 1);

      expect(state.manzanasById().has('m1')).toBe(false);
      expect(state.manzanasMarcadaList()).toEqual([]);
    });
  });

  describe('marcarManzanaById', () => {
    it('marks a manzana by ID and selects its territory', () => {
      rendering.getManzanaCountByTerritorio.mockReturnValue(10);
      rendering.getFeatureLayerByTerritorio.mockReturnValue({ color: '#ff0000', layer: {} });

      service.marcarManzanaById('m1', 'Bloque-m1', '#ff0000', 1);

      expect(state.manzanasMarcadaList()).toEqual([
        { id: 'm1', nombreBloque: 'Bloque-m1', color: '#ff0000', territorioNumero: 1 },
      ]);
      expect(state.territoriosSeleccionados()).toContain(1);
      expect(rendering.ocultarPoligonosNoSeleccionados).toHaveBeenCalled();
    });
  });

  describe('seleccionarManzana', () => {
    it('tracks the selected manzana and selects its territory', () => {
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1', 1)]);
      rendering.getAllTerritoriesLayer.mockReturnValue([
        { territorioPadre: 1, color: '#ff0000', layer: {} },
      ]);
      rendering.getFeatureLayerByTerritorio.mockReturnValue({ color: '#ff0000', layer: {} });
      rendering.getManzanaCountByTerritorio.mockReturnValue(10);
      const polygon = fakePath();

      service.seleccionarManzana(polygon as never, '#ff0000', 'Bloque-m1', 1);

      expect(state.manzanaSeleccionadaColor()).toBe('#ff0000');
      expect(state.manzanaSeleccionadaNombre()).toBe('Bloque-m1');
      expect(state.manzanaSeleccionadaTerritorio()).toBe(1);
      expect(state.territoriosSeleccionados()).toContain(1);
      expect(rendering.setCurrentTerritoryColor).toHaveBeenCalledWith('#ff0000');
    });

    it('clears edges on selection (MapLibre picks via GPU)', () => {
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1', 1)]);
      rendering.getAllTerritoriesLayer.mockReturnValue([
        { territorioPadre: 1, color: '#ff0000', layer: {} },
      ]);
      rendering.getFeatureLayerByTerritorio.mockReturnValue({ color: '#ff0000', layer: {} });
      rendering.getManzanaCountByTerritorio.mockReturnValue(10);

      service.seleccionarManzana(fakePath() as never, '#ff0000', 'Bloque-m1', 1);

      expect(state.manzanaEdges()).toEqual([]);
    });
  });

  describe('prepareTerritorioSeleccionado', () => {
    it('selects the territories when not marking', () => {
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1', 5)]);

      const result = service.prepareTerritorioSeleccionado([5]);

      expect(result).toEqual([5]);
      expect(state.territoriosSeleccionados()).toEqual([5]);
      expect(rendering.ocultarPoligonosNoSeleccionados).toHaveBeenCalled();
      expect(state.totalManzanas()).toBe(0);
    });

    it('merges the new selection into the existing one while marking', () => {
      state.modoMarcado.set('completa');
      state.territoriosSeleccionados.set([1]);

      const result = service.prepareTerritorioSeleccionado([5]);

      expect(result).toEqual([5]);
      expect(state.territoriosSeleccionados()).toEqual([1, 5]);
    });
  });

  describe('setModoMarcado', () => {
    it('activates completa mode, hides non-selected polygons and shows a hint', () => {
      state.territoriosSeleccionados.set([1]);

      service.setModoMarcado('completa');

      expect(state.modoMarcado()).toBe('completa');
      expect(rendering.ocultarPoligonosNoSeleccionados).toHaveBeenCalledWith([1]);
      expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('manzana'));
    });

    it('deactivates the mode and restores polygon visibility', () => {
      service.setModoMarcado('none');

      expect(state.modoMarcado()).toBe('none');
      expect(rendering.restaurarVisibilidadPoligonos).toHaveBeenCalled();
    });
  });

  describe('limpiarMarcas', () => {
    it('clears the state, the visual marks and the draft', () => {
      state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#fff', territorioNumero: 1 }]]));
      state.territoriosSeleccionados.set([1]);
      state.totalManzanas.set(10);

      service.limpiarMarcas();

      expect(state.manzanasMarcadaList()).toEqual([]);
      expect(state.territoriosSeleccionados()).toEqual([]);
      expect(state.totalManzanas()).toBe(0);
      expect(rendering.limpiarMarcasVisuales).toHaveBeenCalled();
      expect(rendering.setCurrentTerritoryColor).toHaveBeenCalledWith('');
      expect(drafts.clear).toHaveBeenCalled();
    });

    it('restores polygon visibility with an empty selection so ALL territories reappear', () => {
      state.territoriosSeleccionados.set([1, 2]);
      state.manzanasById.set(
        new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#fff', territorioNumero: 1 }]])
      );

      service.limpiarMarcas();

      expect(rendering.restaurarVisibilidadPoligonos).toHaveBeenCalledWith([], []);
    });
  });
});
