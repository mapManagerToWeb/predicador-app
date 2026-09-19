import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapStateService } from './map-state.service';
import { DraftMarksService } from './map-draft';
import { makeLatLng } from '../map-geometry';
import type { ManzanaMarcada } from '../types/map.types';

describe('MapStateService', () => {
  let service: MapStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MapStateService] });
    service = TestBed.inject(MapStateService);
  });

  it('starts with empty, unselected state', () => {
    expect(service.manzanasMarcadaList()).toEqual([]);
    expect(service.manzanasCount()).toBe(0);
    expect(service.totalManzanas()).toBe(0);
    expect(service.territorioSeleccionado()).toBeNull();
    expect(service.territoriosSeleccionados()).toEqual([]);
    expect(service.tieneTerritorio()).toBe(false);
    expect(service.modoMarcado()).toBe('none');
    expect(service.puntosParciales()).toEqual([]);
    expect(service.puedeConfirmar()).toBe(false);
    expect(service.enviando()).toBe(false);
  });

  it('derives manzanasCount from manzanasById', () => {
    service.manzanasById.set(new Map([['a', { id: 'a', nombreBloque: 'A', color: '#fff', territorioNumero: 1 }]]));
    expect(service.manzanasCount()).toBe(1);
  });

  it('derives tieneTerritorio from territoriosSeleccionados', () => {
    expect(service.tieneTerritorio()).toBe(false);
    service.territoriosSeleccionados.set([1]);
    expect(service.tieneTerritorio()).toBe(true);
  });

  it('derives puedeConfirmar from partial points (polygon needs 3)', () => {
    service.puntosParciales.set([
      { latlng: makeLatLng(0, 0), edgeIdx: 0, t: 0 },
      { latlng: makeLatLng(1, 1), edgeIdx: 0, t: 1 },
    ]);
    expect(service.puedeConfirmar()).toBe(false);

    service.puntosParciales.set([
      { latlng: makeLatLng(0, 0), edgeIdx: 0, t: 0 },
      { latlng: makeLatLng(1, 1), edgeIdx: 0, t: 1 },
      { latlng: makeLatLng(2, 2), edgeIdx: 0, t: 2 },
    ]);
    expect(service.puedeConfirmar()).toBe(true);
  });

  it('stores and retrieves partial data per territory', () => {
    const data = { puntos: [{ latlng: makeLatLng(0, 0), edgeIdx: 0, t: 0 }], geometria: '{"type":"LineString"}' };
    service.setDatosParciales(3, data);

    expect(service.getDatosParciales(3)).toEqual(data);
    service.clearDatosParciales(3);
    expect(service.getDatosParciales(3)).toBeNull();
  });

  it('clears all partial data when no territory is given', () => {
    service.setDatosParciales(1, { puntos: [], geometria: '{}' });
    service.setDatosParciales(2, { puntos: [], geometria: '{}' });
    service.clearDatosParciales();

    expect(service.getDatosParciales(1)).toBeNull();
    expect(service.getDatosParciales(2)).toBeNull();
  });

  it('stores the selected manzana state (pure fields)', () => {
    service.manzanaSeleccionadaColor.set('#ff0000');
    service.manzanaSeleccionadaNombre.set('A-1');
    service.manzanaSeleccionadaTerritorio.set(5);
    service.manzanaEdges.set([{ from: makeLatLng(0, 0), to: makeLatLng(0, 1) }]);

    expect(service.manzanaSeleccionadaColor()).toBe('#ff0000');
    expect(service.manzanaSeleccionadaNombre()).toBe('A-1');
    expect(service.manzanaSeleccionadaTerritorio()).toBe(5);
    expect(service.manzanaEdges()).toHaveLength(1);
  });

  it('resets all UI state via resetUIState', () => {
    service.manzanasById.set(new Map([['a', { id: 'a', nombreBloque: 'A', color: '#fff', territorioNumero: 1 }]]));
    service.totalManzanas.set(10);
    service.territorioSeleccionado.set(1);
    service.territoriosSeleccionados.set([1]);
    service.modoMarcado.set('parcial');
    service.puntosParciales.set([{ latlng: makeLatLng(0, 0), edgeIdx: 0, t: 0 }]);
    service.enviando.set(true);
    service.screenshotPreview.set('data:image/jpeg;base64,x');
    service.setDatosParciales(1, { puntos: [], geometria: '{}' });
    service.manzanaSeleccionadaColor.set('#ff0000');
    service.manzanaSeleccionadaNombre.set('A-1');
    service.manzanaSeleccionadaTerritorio.set(5);
    service.manzanaEdges.set([{ from: makeLatLng(0, 0), to: makeLatLng(0, 1) }]);

    service.resetUIState();

    expect(service.manzanasMarcadaList()).toEqual([]);
    expect(service.totalManzanas()).toBe(0);
    expect(service.territorioSeleccionado()).toBeNull();
    expect(service.territoriosSeleccionados()).toEqual([]);
    expect(service.modoMarcado()).toBe('none');
    expect(service.puntosParciales()).toEqual([]);
    expect(service.enviando()).toBe(false);
    expect(service.screenshotPreview()).toBeNull();
    expect(service.getDatosParciales(1)).toBeNull();
    expect(service.manzanaSeleccionadaColor()).toBe('');
    expect(service.manzanaSeleccionadaNombre()).toBe('');
    expect(service.manzanaSeleccionadaTerritorio()).toBeNull();
    expect(service.manzanaEdges()).toEqual([]);
  });

  describe('restored (display-only) marks', () => {
    const restored = (id: string, territorioNumero: number): ManzanaMarcada =>
      ({ id, nombreBloque: '', color: '#00A86B', territorioNumero });

    it('renders restored marks without registering them as editable marks', () => {
      service.setRestoredMarksForTerritorio(1, [restored('m1', 1), restored('m2', 1)]);

      // Visible for rendering…
      expect(service.manzanasVisiblesList().map(m => m.id).sort()).toEqual(['m1', 'm2']);
      expect(service.manzanasVisiblesByTerritorio().get(1)).toHaveLength(2);
      // …but NOT part of the editable marks that drive counters and the
      // save/send payload (no duplicate WhatsApp sends for reported territories).
      expect(service.manzanasMarcadaList()).toEqual([]);
      expect(service.manzanasCount()).toBe(0);
      expect(service.manzanasByTerritorio().size).toBe(0);
    });

    it('lets editable marks win over a restored mark with the same id', () => {
      service.setRestoredMarksForTerritorio(1, [restored('m1', 1), restored('m2', 1)]);
      service.manzanasById.set(new Map([['m2', { ...restored('m2', 1), color: '#3b82f6' }]]));

      const visibles = service.manzanasVisiblesList();
      expect(visibles).toHaveLength(2);
      expect(visibles.find(m => m.id === 'm2')?.color).toBe('#3b82f6');
    });

    it('replaces the restored marks of one territory only', () => {
      service.setRestoredMarksForTerritorio(1, [restored('m1', 1), restored('m2', 1)]);
      service.setRestoredMarksForTerritorio(2, [restored('m9', 2)]);

      service.setRestoredMarksForTerritorio(1, [restored('m3', 1)]);

      expect(service.manzanasVisiblesList().map(m => m.id).sort()).toEqual(['m3', 'm9']);
    });

    it('drops the restored marks of a territory when handed an empty list', () => {
      service.setRestoredMarksForTerritorio(1, [restored('m1', 1)]);

      service.setRestoredMarksForTerritorio(1, []);

      expect(service.manzanasVisiblesList()).toEqual([]);
    });

    it('clears restored marks on resetUIState', () => {
      service.setRestoredMarksForTerritorio(1, [restored('m1', 1)]);

      service.resetUIState();

      expect(service.manzanasVisiblesList()).toEqual([]);
    });
  });
});

describe('MapStateService draft effect', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('persists marks to the draft after the debounce window', () => {
    TestBed.configureTestingModule({ providers: [MapStateService] });
    const state = TestBed.inject(MapStateService);
    const drafts = TestBed.inject(DraftMarksService);

    state.manzanasById.set(new Map<string, ManzanaMarcada>([
      ['A', { id: 'A', nombreBloque: 'Bloque A', color: '#3b82f6', territorioNumero: 1 }],
    ]));
    state.territoriosSeleccionados.set([1]);
    state.modoMarcado.set('completa');

    vi.advanceTimersByTime(500);

    const restored = drafts.cargar();
    expect(restored?.manzanasById['A'].territorioNumero).toBe(1);
    expect(restored?.territoriosSeleccionados).toEqual([1]);
    expect(restored?.modoMarcado).toBe('completa');
  });
});