import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapStateService } from './map-state.service';
import { DraftMarksService } from '../../../core/services/map-draft';
import type { ManzanaMarcada, ZonaParcial } from '../types/map.types';

function zona(id: string, territorio: number): ZonaParcial {
  return {
    id,
    territorio,
    manzanaId: '12',
    manzanaNombre: '12.a',
    lados: [0],
    geometria: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  };
}

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
    expect(service.zonasParciales().size).toBe(0);
    expect(service.edicionLados()).toBeNull();
    expect(service.enviando()).toBe(false);
  });

  describe('inicioSesion (tiempo de la salida para el panel)', () => {
    const marca = (id: string) => ({ id, nombreBloque: id, color: '#fff', territorioNumero: 1 });

    it('se fija con la primera manzana marcada y no cambia con las siguientes', () => {
      localStorage.removeItem('map_inicio_sesion');
      expect(service.inicioSesion()).toBeNull();

      service.manzanasById.set(new Map([['a', marca('a')]]));
      TestBed.tick();
      const inicio = service.inicioSesion();
      expect(inicio).not.toBeNull();
      expect(localStorage.getItem('map_inicio_sesion')).toBe(inicio);

      service.manzanasById.set(new Map([['a', marca('a')], ['b', marca('b')]]));
      TestBed.tick();
      expect(service.inicioSesion()).toBe(inicio);
    });

    it('se borra cuando la salida se envía (sin marcas)', () => {
      service.manzanasById.set(new Map([['a', marca('a')]]));
      TestBed.tick();
      service.manzanasById.set(new Map());
      TestBed.tick();
      expect(service.inicioSesion()).toBeNull();
      expect(localStorage.getItem('map_inicio_sesion')).toBeNull();
    });
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

  it('agrupa las zonas parciales por territorio', () => {
    service.zonasParciales.set(new Map([
      ['parcial-1', zona('parcial-1', 3)],
      ['parcial-2', zona('parcial-2', 4)],
      ['parcial-3', zona('parcial-3', 3)],
    ]));
    expect(service.zonasDeTerritorio(3).map(z => z.id)).toEqual(['parcial-1', 'parcial-3']);
    expect(service.zonasDeTerritorio(9)).toEqual([]);
  });

  it('stores the selected manzana state (pure fields)', () => {
    service.manzanaSeleccionadaColor.set('#ff0000');
    service.manzanaSeleccionadaNombre.set('A-1');
    service.manzanaSeleccionadaTerritorio.set(5);

    expect(service.manzanaSeleccionadaColor()).toBe('#ff0000');
    expect(service.manzanaSeleccionadaNombre()).toBe('A-1');
    expect(service.manzanaSeleccionadaTerritorio()).toBe(5);
  });

  it('resets all UI state via resetUIState', () => {
    service.manzanasById.set(new Map([['a', { id: 'a', nombreBloque: 'A', color: '#fff', territorioNumero: 1 }]]));
    service.totalManzanas.set(10);
    service.territorioSeleccionado.set(1);
    service.territoriosSeleccionados.set([1]);
    service.modoMarcado.set('parcial');
    service.enviando.set(true);
    service.screenshotPreview.set('data:image/jpeg;base64,x');
    service.zonasParciales.set(new Map([['parcial-1', zona('parcial-1', 1)]]));
    service.manzanaSeleccionadaColor.set('#ff0000');
    service.manzanaSeleccionadaNombre.set('A-1');
    service.manzanaSeleccionadaTerritorio.set(5);

    service.resetUIState();

    expect(service.manzanasMarcadaList()).toEqual([]);
    expect(service.totalManzanas()).toBe(0);
    expect(service.territorioSeleccionado()).toBeNull();
    expect(service.territoriosSeleccionados()).toEqual([]);
    expect(service.modoMarcado()).toBe('none');
    expect(service.zonasParciales().size).toBe(0);
    expect(service.enviando()).toBe(false);
    expect(service.screenshotPreview()).toBeNull();
    expect(service.manzanaSeleccionadaColor()).toBe('');
    expect(service.manzanaSeleccionadaNombre()).toBe('');
    expect(service.manzanaSeleccionadaTerritorio()).toBeNull();
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

  it('guarda en el borrador las zonas parciales de cada territorio con su detalle', () => {
    TestBed.configureTestingModule({ providers: [MapStateService] });
    const state = TestBed.inject(MapStateService);
    const drafts = TestBed.inject(DraftMarksService);

    state.zonasParciales.set(new Map([['parcial-1', zona('parcial-1', 7)]]));
    vi.advanceTimersByTime(500);

    const parcial = drafts.cargar()?.datosParcialesGuardados[7];
    expect(JSON.parse(parcial!.geometria).type).toBe('Polygon');
    expect(JSON.parse(parcial!.detalle!)).toMatchObject({ v: 2, zonas: [{ m: '12', l: [0] }] });
  });
});