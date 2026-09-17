import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapPartialMarkService } from './map-partial-mark.service';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapInteractionService } from './map-interaction.service';
import { MapSelectionService } from './map-selection.service';
import { Toast } from '../../../core/services/toast';

describe('MapPartialMarkService', () => {
  let service: MapPartialMarkService;
  let state: MapStateService;
  let rendering: {
    getMap: ReturnType<typeof vi.fn>;
    getAllTerritoriesLayer: ReturnType<typeof vi.fn>;
    getCurrentTerritoryColor: ReturnType<typeof vi.fn>;
    limpiarCapasParciales: ReturnType<typeof vi.fn>;
  };
  let selection: {
    restaurarManzanaAnterior: ReturnType<typeof vi.fn>;
    limpiarParcial: ReturnType<typeof vi.fn>;
  };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    rendering = {
      getMap: vi.fn().mockReturnValue(null),
      getAllTerritoriesLayer: vi.fn().mockReturnValue([]),
      getCurrentTerritoryColor: vi.fn().mockReturnValue('#22c55e'),
      limpiarCapasParciales: vi.fn(),
    };
    selection = { restaurarManzanaAnterior: vi.fn(), limpiarParcial: vi.fn() };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        MapPartialMarkService,
        MapStateService,
        { provide: MapRenderingFacade, useValue: rendering },
        { provide: MapInteractionService, useValue: { handleMarkerDrag: vi.fn() } },
        { provide: MapSelectionService, useValue: selection },
        { provide: Toast, useValue: toast },
      ],
    });
    service = TestBed.inject(MapPartialMarkService);
    state = TestBed.inject(MapStateService);
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
  });

  describe('deshacerPunto', () => {
    it('removes the last point', () => {
      state.puntosParciales.set([
        { latlng: { lat: 0, lng: 0 }, edgeIdx: 0, t: 0 },
        { latlng: { lat: 1, lng: 1 }, edgeIdx: 0, t: 0.5 },
      ]);

      service.deshacerPunto();

      expect(state.puntosParciales()).toHaveLength(1);
    });

    it('does nothing when empty', () => {
      service.deshacerPunto();

      expect(state.puntosParciales()).toEqual([]);
    });
  });

  describe('finalizarParcial', () => {
    it('shows a toast when fewer than 2 points', () => {
      state.puntosParciales.set([{ latlng: { lat: 0, lng: 0 }, edgeIdx: 0, t: 0 }]);

      service.finalizarParcial();

      expect(toast.show).toHaveBeenCalled();
    });

    it('shows a toast when no territory is selected', () => {
      state.puntosParciales.set([
        { latlng: { lat: 0, lng: 0 }, edgeIdx: 0, t: 0 },
        { latlng: { lat: 1, lng: 1 }, edgeIdx: 0, t: 1 },
      ]);

      service.finalizarParcial();

      expect(toast.show).toHaveBeenCalled();
    });
  });

  describe('cancelarParcial', () => {
    it('delegates to selection service', () => {
      service.cancelarParcial();

      expect(selection.limpiarParcial).toHaveBeenCalled();
      expect(selection.restaurarManzanaAnterior).toHaveBeenCalled();
      expect(state.modoMarcado()).toBe('none');
    });
  });
});
