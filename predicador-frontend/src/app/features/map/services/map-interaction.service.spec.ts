import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as L from 'leaflet';
import { MapInteractionService } from './map-interaction.service';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapLayerRegistry } from './map-layer-registry.service';
import { Toast } from '../../../core/services/toast';
import type { ManzanaIndex } from '../types/map.types';

function containerPoint(lat: number, lng: number): { x: number; y: number; distanceTo: (p: { x: number; y: number }) => number } {
  const x = lat * 1000;
  const y = lng * 1000;
  return {
    x,
    y,
    distanceTo: (p: { x: number; y: number }) => Math.hypot(x - p.x, y - p.y),
  };
}

function fakeManzana(id: string, territorioNumero = 5): ManzanaIndex {
  return {
    id,
    nombreBloque: `Bloque-${id}`,
    color: '#ff0000',
    territorioNumero,
    bbox: { minLat: -1, maxLat: 2, minLng: -1, maxLng: 2 },
    polygon: new L.Polygon([
      [
        { lat: -1, lng: -1 },
        { lat: 2, lng: -1 },
        { lat: 2, lng: 2 },
        { lat: -1, lng: 2 },
      ],
    ]),
  } as ManzanaIndex;
}

describe('MapInteractionService', () => {
  let service: MapInteractionService;
  let state: MapStateService;
  let registry: MapLayerRegistry;
  let toast: { show: ReturnType<typeof vi.fn> };
  let rendering: {
    getManzanaIndex: ReturnType<typeof vi.fn>;
    getMap: ReturnType<typeof vi.fn>;
  };

  function clickAt(lat: number, lng: number) {
    return { latlng: { lat, lng } } as L.LeafletMouseEvent;
  }

  beforeEach(() => {
    toast = { show: vi.fn() };
    rendering = {
      getManzanaIndex: vi.fn(),
      getMap: vi.fn().mockReturnValue({
        latLngToContainerPoint: (ll: { lat: number; lng: number }) => containerPoint(ll.lat, ll.lng),
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        MapInteractionService,
        MapStateService,
        { provide: MapRenderingFacade, useValue: rendering },
        MapLayerRegistry,
        { provide: Toast, useValue: toast },
      ],
    });
    service = TestBed.inject(MapInteractionService);
    state = TestBed.inject(MapStateService);
    registry = TestBed.inject(MapLayerRegistry);
  });

  describe('modo none', () => {
    it('toggles a manzana that is already marked', () => {
      state.modoMarcado.set('none');
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1')]);
      state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'Bloque-m1', color: '#ff0000', territorioNumero: 5 }]]));

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('toggle_manzana');
      expect(result.manzana?.id).toBe('m1');
    });

    it('selects the territory when clicking an unmarked manzana', () => {
      state.modoMarcado.set('none');
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m2')]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('select_territory');
      expect(result.manzana?.territorioNumero).toBe(5);
      expect(toast.show).not.toHaveBeenCalled();
    });

    it('returns none when clicking empty space', () => {
      state.modoMarcado.set('none');
      rendering.getManzanaIndex.mockReturnValue([]);

      expect(service.handleMapClick(clickAt(50, 50)).action).toBe('none');
    });
  it('still selects a foreign territory in mode none', () => {
      state.modoMarcado.set('none');
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m9', 9)]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('select_territory');
      expect(toast.show).not.toHaveBeenCalled();
    });
  });

  describe('modo completa', () => {
    it('toggles a manzana of the already selected territory', () => {
      state.modoMarcado.set('completa');
      state.territoriosSeleccionados.set([5]);
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1')]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('toggle_manzana');
      expect(toast.show).not.toHaveBeenCalled();
    });

    it('ignores click on unselected territory (no select_territory)', () => {
      state.modoMarcado.set('completa');
      state.territoriosSeleccionados.set([]);
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1')]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('none');
    });

    it('locks and toasts on a foreign-territory manzana click', () => {
      state.modoMarcado.set('completa');
      state.territoriosSeleccionados.set([5]);
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1', 9)]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('none');
      expect(toast.show).toHaveBeenCalled();
    });

    it('returns none when clicking empty space', () => {
      state.modoMarcado.set('completa');
      rendering.getManzanaIndex.mockReturnValue([]);

      expect(service.handleMapClick(clickAt(50, 50)).action).toBe('none');
    });
  });

  describe('modo parcial', () => {
    it('removes an existing partial polygon when clicking inside it', () => {
      state.modoMarcado.set('parcial');
      const parcial = new L.Polygon([
        [
          { lat: -1, lng: -1 },
          { lat: 2, lng: -1 },
          { lat: 2, lng: 2 },
          { lat: -1, lng: 2 },
        ],
      ]);
      registry.register('parcial-123', parcial);
      state.manzanasById.set(new Map([['parcial-123', { id: 'parcial-123', nombreBloque: 'Zona parcial', color: '#ff0000', territorioNumero: 5 }]]));
      rendering.getManzanaIndex.mockReturnValue([]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('remove_partial');
      expect(result.partialId).toBe('parcial-123');
    });

    it('toggles a manzana that is already marked', () => {
      state.modoMarcado.set('parcial');
      state.territoriosSeleccionados.set([5]);
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1')]);
      state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'Bloque-m1', color: '#ff0000', territorioNumero: 5 }]]));

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('toggle_manzana');
      expect(toast.show).not.toHaveBeenCalled();
    });

    it('does NOT toggle an already-marked manzana of a foreign territory (lock + toast)', () => {
      state.modoMarcado.set('parcial');
      state.territoriosSeleccionados.set([5]);
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m9', 9)]);
      state.manzanasById.set(new Map([['m9', { id: 'm9', nombreBloque: 'Bloque-m9', color: '#ff0000', territorioNumero: 9 }]]));

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('none');
      expect(result.manzana).toBeUndefined();
      expect(toast.show).toHaveBeenCalled();
    });

    it('locks and toasts on an unmarked foreign-territory manzana click', () => {
      state.modoMarcado.set('parcial');
      state.territoriosSeleccionados.set([5]);
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m9', 9)]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('none');
      expect(toast.show).toHaveBeenCalled();
    });

    it('ignores click on unselected territory (no select_manzana)', () => {
      state.modoMarcado.set('parcial');
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1')]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('none');
    });

    it('returns none when no manzana is selected and none is near', () => {
      state.modoMarcado.set('parcial');
      rendering.getManzanaIndex.mockReturnValue([]);

      expect(service.handleMapClick(clickAt(50, 50)).action).toBe('none');
    });

    it('adds a snapped point on the edge of the selected manzana', () => {
      state.modoMarcado.set('parcial');
      state.territoriosSeleccionados.set([5]);
      state.manzanaSeleccionadaTerritorio.set(5);
      state.manzanaEdges.set([{ from: { lat: 0, lng: 0 }, to: { lat: 1, lng: 0 } }]);
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1')]);

      const result = service.handleMapClick(clickAt(0.5, 0));

      expect(result.action).toBe('add_partial_point');
      expect(result.snappedPoint?.edgeIdx).toBe(0);
    });

    it('ignores a click that does not snap onto the manzana edges', () => {
      state.modoMarcado.set('parcial');
      state.territoriosSeleccionados.set([5]);
      state.manzanaSeleccionadaTerritorio.set(5);
      state.manzanaEdges.set([{ from: { lat: 0, lng: 0 }, to: { lat: 1, lng: 0 } }]);
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1')]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('none');
    });

    it('does not add points beyond the max partial points', () => {
      state.modoMarcado.set('parcial');
      state.territoriosSeleccionados.set([5]);
      state.manzanaSeleccionadaTerritorio.set(5);
      state.manzanaEdges.set([{ from: { lat: 0, lng: 0 }, to: { lat: 1, lng: 0 } }]);
      state.puntosParciales.set([
        { latlng: { lat: 0, lng: 0 }, edgeIdx: 0, t: 0 },
        { latlng: { lat: 0.2, lng: 0 }, edgeIdx: 0, t: 0.2 },
        { latlng: { lat: 0.4, lng: 0 }, edgeIdx: 0, t: 0.4 },
        { latlng: { lat: 0.6, lng: 0 }, edgeIdx: 0, t: 0.6 },
        { latlng: { lat: 0.8, lng: 0 }, edgeIdx: 0, t: 0.8 },
        { latlng: { lat: 1, lng: 0 }, edgeIdx: 0, t: 1 },
      ]);
      rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1')]);

      const result = service.handleMapClick(clickAt(0.3, 0));

      expect(result.action).toBe('none');
    });
  });
});
