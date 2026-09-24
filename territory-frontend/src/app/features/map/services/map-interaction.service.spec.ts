import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Polygon, LeafletMouseEvent, GeoJSON as LeafletGeoJSON } from 'leaflet';
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
    polygon: new Polygon([
      [
        { lat: -1, lng: -1 },
        { lat: 2, lng: -1 },
        { lat: 2, lng: 2 },
        { lat: -1, lng: 2 },
      ],
    ]),
  } as ManzanaIndex;
}

// Manzana MultiPolygon real (Leaflet 2.0 comparte Polygon/MultiPolygon:
// getLatLngs() devuelve [[ring],[ring]]). Regresión del marcado parcial:
// antes, rings[0] era [ringA] y pointInPolygon recibía un ARRAY como ring
// -> nunca detectaba la segunda parte (marcado fallaba en silencio).
function fakeManzanaMultiPolygon(id: string, territorioNumero = 5): ManzanaIndex {
  // Un MultiPolygon GeoJSON real produce getLatLngs() [[ring],[ring]] en las
  // versiones de Leaflet (1.9 y 2.0-alpha); new Polygon([[r1],[r2]]) NO lo
  // produce (deja [r1,r2]), por eso se construye vía L.geoJSON.
  const gj = new LeafletGeoJSON({
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [-1, -1],
            [2, -1],
            [2, 2],
            [-1, 2],
            [-1, -1],
          ],
        ],
        [
          [
            [10, 10],
            [12, 10],
            [12, 12],
            [10, 12],
            [10, 10],
          ],
        ],
      ],
    },
  });
  let child: Polygon | null = null;
  gj.eachLayer(l => {
    child = l as Polygon;
  });
  return {
    id,
    nombreBloque: `Bloque-${id}`,
    color: '#ff0000',
    territorioNumero,
    bbox: { minLat: -1, maxLat: 12, minLng: -1, maxLng: 12 },
    polygon: child as Polygon,
  } as ManzanaIndex;
}

describe('MapInteractionService', () => {
  let service: MapInteractionService;
  let state: MapStateService;
  let registry: MapLayerRegistry;
  let toast: { show: ReturnType<typeof vi.fn> };
  let rendering: {
    queryManzanasAt: ReturnType<typeof vi.fn>;
    queryManzanasNear: ReturnType<typeof vi.fn>;
    getMap: ReturnType<typeof vi.fn>;
  };

  function clickAt(lat: number, lng: number) {
    return { latlng: { lat, lng } } as LeafletMouseEvent;
  }

  beforeEach(() => {
    toast = { show: vi.fn() };
    rendering = {
      queryManzanasAt: vi.fn().mockReturnValue([]),
      queryManzanasNear: vi.fn().mockReturnValue([]),
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
      rendering.queryManzanasAt.mockReturnValue([fakeManzana('m1')]);
      state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'Bloque-m1', color: '#ff0000', territorioNumero: 5 }]]));

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('toggle_manzana');
      expect(result.manzana?.id).toBe('m1');
    });

    it('selects the territory when clicking an unmarked manzana', () => {
      state.modoMarcado.set('none');
      rendering.queryManzanasAt.mockReturnValue([fakeManzana('m2')]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('select_territory');
      expect(result.manzana?.territorioNumero).toBe(5);
      expect(toast.show).not.toHaveBeenCalled();
    });

    it('returns none when clicking empty space', () => {
      state.modoMarcado.set('none');
      rendering.queryManzanasAt.mockReturnValue([]);

      expect(service.handleMapClick(clickAt(50, 50)).action).toBe('none');
    });
    it('detects a MultiPolygon manzana when the click lands on a non-first part (regression)', () => {
      state.modoMarcado.set('none');
      const manzana = fakeManzanaMultiPolygon('m-multi');
      // Guard del fixture: debe producir el shape real [[ring],[ring]] de
      // Leaflet (ring envuelto), no el shape [ring,ring] de un Polygon simple.
      const raw = manzana.polygon.getLatLngs() as unknown[][][];
      expect(raw.length).toBe(2);
      expect(Array.isArray(raw[0])).toBe(true);
      expect(Array.isArray(raw[0][0])).toBe(true);
      // El click cae en la SEGUNDA parte (10..12). Antes del fix, rings[0] era
      // [ringA] (un ARRAY) y pointInPolygon devolvía false -> 'none'.
      rendering.queryManzanasAt.mockReturnValue([manzana]);

      const result = service.handleMapClick(clickAt(11, 11));

      expect(result.action).toBe('select_territory');
      expect(result.manzana?.id).toBe('m-multi');
    });
  it('still selects a foreign territory in mode none', () => {
      state.modoMarcado.set('none');
      rendering.queryManzanasAt.mockReturnValue([fakeManzana('m9', 9)]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('select_territory');
      expect(toast.show).not.toHaveBeenCalled();
    });
  });

  describe('modo completa', () => {
    it('marks an unmarked manzana of the already selected territory', () => {
      state.modoMarcado.set('completa');
      state.territoriosSeleccionados.set([5]);
      rendering.queryManzanasAt.mockReturnValue([fakeManzana('m1')]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('toggle_manzana');
      expect(toast.show).not.toHaveBeenCalled();
    });

    it('never unmarks an already-marked manzana (only marks while marking)', () => {
      state.modoMarcado.set('completa');
      state.territoriosSeleccionados.set([5]);
      rendering.queryManzanasAt.mockReturnValue([fakeManzana('m1')]);
      state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'Bloque-m1', color: '#ff0000', territorioNumero: 5 }]]));

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('none');
      expect(result.manzana).toBeUndefined();
      expect(toast.show).not.toHaveBeenCalled();
    });

    it('ignores click on unselected territory (no select_territory)', () => {
      state.modoMarcado.set('completa');
      state.territoriosSeleccionados.set([]);
      rendering.queryManzanasAt.mockReturnValue([fakeManzana('m1')]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('none');
    });

    it('locks and toasts on a foreign-territory manzana click', () => {
      state.modoMarcado.set('completa');
      state.territoriosSeleccionados.set([5]);
      rendering.queryManzanasAt.mockReturnValue([fakeManzana('m1', 9)]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('none');
      expect(toast.show).toHaveBeenCalled();
    });

    it('returns none when clicking empty space', () => {
      state.modoMarcado.set('completa');
      rendering.queryManzanasAt.mockReturnValue([]);

      expect(service.handleMapClick(clickAt(50, 50)).action).toBe('none');
    });
  });

  describe('modo parcial (por lados)', () => {
    function zonaAntigua(): void {
      const parcial = new Polygon([
        [
          { lat: -1, lng: -1 },
          { lat: 2, lng: -1 },
          { lat: 2, lng: 2 },
          { lat: -1, lng: 2 },
        ],
      ]);
      registry.register('parcial-123', parcial);
      state.manzanasById.set(new Map([['parcial-123', { id: 'parcial-123', nombreBloque: 'Zona parcial', color: '#ff0000', territorioNumero: 5 }]]));
    }

    it('abre la manzana tocada para elegir sus lados', () => {
      state.modoMarcado.set('parcial');
      state.territoriosSeleccionados.set([5]);
      rendering.queryManzanasAt.mockReturnValue([fakeManzana('m1')]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('abrir_lados');
      expect(result.manzana?.id).toBe('m1');
    });

    it('tocar en la calle, cerca de la manzana, también la abre', () => {
      state.modoMarcado.set('parcial');
      state.territoriosSeleccionados.set([5]);
      rendering.queryManzanasAt.mockReturnValue([]);
      rendering.queryManzanasNear.mockReturnValue([fakeManzana('m1')]);

      const result = service.handleMapClick(clickAt(2.5, 0));

      expect(result.action).toBe('abrir_lados');
      expect(result.manzana?.id).toBe('m1');
    });

    it('una manzana ya completa no se abre (avisa)', () => {
      state.modoMarcado.set('parcial');
      state.territoriosSeleccionados.set([5]);
      rendering.queryManzanasAt.mockReturnValue([fakeManzana('m1')]);
      state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'Bloque-m1', color: '#ff0000', territorioNumero: 5 }]]));

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('none');
      expect(toast.show).toHaveBeenCalled();
    });

    it('bloquea manzanas de territorios no seleccionados', () => {
      state.modoMarcado.set('parcial');
      state.territoriosSeleccionados.set([5]);
      rendering.queryManzanasAt.mockReturnValue([fakeManzana('m9', 9)]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('none');
      expect(toast.show).toHaveBeenCalled();
    });

    it('sin manzanas cerca no hace nada', () => {
      state.modoMarcado.set('parcial');
      rendering.queryManzanasAt.mockReturnValue([]);

      expect(service.handleMapClick(clickAt(50, 50)).action).toBe('none');
    });

    it('una zona antigua (trazo libre, sin manzana) se quita tocándola', () => {
      state.modoMarcado.set('parcial');
      zonaAntigua();
      rendering.queryManzanasAt.mockReturnValue([]);

      const result = service.handleMapClick(clickAt(0.5, 0.5));

      expect(result.action).toBe('remove_partial');
      expect(result.partialId).toBe('parcial-123');
    });

    it('fuera del modo parcial, tocar una zona no la borra', () => {
      state.modoMarcado.set('completa');
      zonaAntigua();
      rendering.queryManzanasAt.mockReturnValue([]);

      expect(service.handleMapClick(clickAt(0.5, 0.5)).action).toBe('none');
    });
  });
});
