import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapStateService } from './map-state.service';
import { DraftMarksService } from '../../../core/services/map-draft';
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

  it('derives puedeConfirmar from partial points', () => {
    service.puntosParciales.set([
      { latlng: makeLatLng(0, 0), edgeIdx: 0, t: 0 },
      { latlng: makeLatLng(1, 1), edgeIdx: 0, t: 1 },
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