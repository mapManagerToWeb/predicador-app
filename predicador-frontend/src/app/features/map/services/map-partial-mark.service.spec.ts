import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapPartialMarkService } from './map-partial-mark.service';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapInteractionService } from './map-interaction.service';
import { MapSelectionService } from './map-selection.service';
import { MapLayerRegistry } from './map-layer-registry.service';
import { Toast } from '../../../core/services/toast';
import { getPartialPolygonCompleteStyle } from './map-style.service';

function containerPoint(lat: number, lng: number): { x: number; y: number; distanceTo: (p: { x: number; y: number }) => number } {
  const x = lat * 1000;
  const y = lng * 1000;
  return {
    x,
    y,
    distanceTo: (p: { x: number; y: number }) => Math.hypot(x - p.x, y - p.y),
  };
}

describe('MapPartialMarkService', () => {
  let service: MapPartialMarkService;
  let state: MapStateService;
  let registry: MapLayerRegistry;
  let rendering: {
    getMap: ReturnType<typeof vi.fn>;
    getAllTerritoriesLayer: ReturnType<typeof vi.fn>;
    getCurrentTerritoryColor: ReturnType<typeof vi.fn>;
    redibujarParcial: ReturnType<typeof vi.fn>;
    getPoligonoParcial: ReturnType<typeof vi.fn>;
    addExtraLayer: ReturnType<typeof vi.fn>;
    clearPoligonoParcialRef: ReturnType<typeof vi.fn>;
    limpiarCapasParciales: ReturnType<typeof vi.fn>;
    restaurarVisibilidadPoligonos: ReturnType<typeof vi.fn>;
    removeExtraLayer: ReturnType<typeof vi.fn>;
  };
  let selection: {
    restaurarManzanaAnterior: ReturnType<typeof vi.fn>;
    limpiarParcial: ReturnType<typeof vi.fn>;
  };
  let toast: { show: ReturnType<typeof vi.fn> };
  let fakeMap: { latLngToContainerPoint: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    fakeMap = {
      latLngToContainerPoint: (ll: { lat: number; lng: number }) => containerPoint(ll.lat, ll.lng),
    };
    rendering = {
      getMap: vi.fn().mockReturnValue(fakeMap),
      getAllTerritoriesLayer: vi.fn().mockReturnValue([]),
      getCurrentTerritoryColor: vi.fn().mockReturnValue('#22c55e'),
      redibujarParcial: vi.fn(),
      getPoligonoParcial: vi.fn().mockReturnValue(null),
      addExtraLayer: vi.fn(),
      clearPoligonoParcialRef: vi.fn(),
      limpiarCapasParciales: vi.fn(),
      restaurarVisibilidadPoligonos: vi.fn(),
      removeExtraLayer: vi.fn(),
    };
    selection = { restaurarManzanaAnterior: vi.fn(), limpiarParcial: vi.fn() };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        MapPartialMarkService,
        MapStateService,
        MapLayerRegistry,
        { provide: MapRenderingFacade, useValue: rendering },
        { provide: MapInteractionService, useValue: { handleMarkerDrag: vi.fn() } },
        { provide: MapSelectionService, useValue: selection },
        { provide: Toast, useValue: toast },
      ],
    });
    service = TestBed.inject(MapPartialMarkService);
    state = TestBed.inject(MapStateService);
    registry = TestBed.inject(MapLayerRegistry);
  });

  describe('agregarPunto', () => {
    it('does nothing when there is no map', () => {
      rendering.getMap.mockReturnValue(null);

      service.agregarPunto({ latlng: { lat: 0, lng: 0 }, edgeIdx: -1, t: 0 });

      expect(state.puntosParciales()).toEqual([]);
      expect(rendering.redibujarParcial).not.toHaveBeenCalled();
    });

    it('adds the first point and redraws', () => {
      service.agregarPunto({ latlng: { lat: 0, lng: 0 }, edgeIdx: -1, t: 0 });

      expect(state.puntosParciales()).toHaveLength(1);
      expect(rendering.redibujarParcial).toHaveBeenCalledTimes(1);
    });

    it('ignores a point too close to the previous one', () => {
      service.agregarPunto({ latlng: { lat: 0, lng: 0 }, edgeIdx: -1, t: 0 });
      rendering.redibujarParcial.mockClear();

      service.agregarPunto({ latlng: { lat: 0.001, lng: 0 }, edgeIdx: -1, t: 0 });

      expect(state.puntosParciales()).toHaveLength(1);
      expect(rendering.redibujarParcial).not.toHaveBeenCalled();
    });
  });

  describe('deshacerPunto', () => {
    it('does nothing when there are no points', () => {
      service.deshacerPunto();

      expect(rendering.redibujarParcial).not.toHaveBeenCalled();
    });

    it('removes the last point and redraws', () => {
      state.puntosParciales.set([
        { latlng: { lat: 0, lng: 0 }, edgeIdx: -1, t: 0 },
        { latlng: { lat: 1, lng: 0 }, edgeIdx: -1, t: 0 },
      ]);

      service.deshacerPunto();

      expect(state.puntosParciales()).toHaveLength(1);
      expect(rendering.redibujarParcial).toHaveBeenCalledTimes(1);
    });
  });

  describe('finalizarParcial', () => {
    it('shows a toast when there are fewer than 2 points', () => {
      state.puntosParciales.set([{ latlng: { lat: 0, lng: 0 }, edgeIdx: -1, t: 0 }]);

      service.finalizarParcial();

      expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('2 puntos'));
    });

    it('shows a toast when there is no active territory', () => {
      state.puntosParciales.set([
        { latlng: { lat: 0, lng: 0 }, edgeIdx: -1, t: 0 },
        { latlng: { lat: 1, lng: 0 }, edgeIdx: -1, t: 0 },
      ]);

      service.finalizarParcial();

      expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('territorios'));
    });

    it('persists the partial polygon, registers it and resets the drawing state', () => {
      state.puntosParciales.set([
        { latlng: { lat: 0, lng: 0 }, edgeIdx: -1, t: 0 },
        { latlng: { lat: 1, lng: 0 }, edgeIdx: -1, t: 0 },
      ]);
      state.territoriosSeleccionados.set([1]);
      rendering.getAllTerritoriesLayer.mockReturnValue([{ territorioPadre: 1, color: '#ff0000', layer: {} }]);
      const polygon = {
        toGeoJSON: () => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } }),
        setStyle: vi.fn(),
        on: vi.fn(),
      };
      rendering.getPoligonoParcial.mockReturnValue(polygon as never);

      service.finalizarParcial();

      expect(state.getDatosParciales(1)).not.toBeNull();
      expect(state.manzanasMarcadas()).toHaveLength(1);
      expect(state.manzanasMarcadas()[0].territorioNumero).toBe(1);
      expect(polygon.setStyle).toHaveBeenCalledWith(getPartialPolygonCompleteStyle('#ff0000'));
      expect(rendering.addExtraLayer).toHaveBeenCalledWith(polygon);
      expect(rendering.clearPoligonoParcialRef).toHaveBeenCalled();
      expect(state.puntosParciales()).toEqual([]);
      expect(state.modoMarcado()).toBe('none');
      expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('Zona parcial marcada'));
      expect(registry.get(state.manzanasMarcadas()[0].id)).toBe(polygon);
    });
  });

  describe('cancelarParcial', () => {
    it('clears the in-progress drawing and leaves the marking mode', () => {
      state.modoMarcado.set('parcial');

      service.cancelarParcial();

      expect(selection.limpiarParcial).toHaveBeenCalled();
      expect(selection.restaurarManzanaAnterior).toHaveBeenCalled();
      expect(state.modoMarcado()).toBe('none');
    });
  });

  describe('eliminarParcial', () => {
    it('does nothing when the id is not marked', () => {
      service.eliminarParcial('parcial-1');

      expect(rendering.removeExtraLayer).not.toHaveBeenCalled();
      expect(toast.show).not.toHaveBeenCalled();
    });

    it('removes the layer, the mark and the partial data', () => {
      const layer = {} as never;
      registry.register('parcial-9', layer);
      state.manzanasMarcadas.set([
        { id: 'parcial-9', nombreBloque: 'Zona parcial', color: '#ff0000', territorioNumero: 1 },
      ]);
      state.setDatosParciales(1, { puntos: [], geometria: '{}' });

      service.eliminarParcial('parcial-9');

      expect(rendering.removeExtraLayer).toHaveBeenCalledWith(layer);
      expect(registry.get('parcial-9')).toBeNull();
      expect(state.manzanasMarcadas()).toEqual([]);
      expect(state.getDatosParciales(1)).toBeNull();
      expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('eliminada'));
    });
  });
});
