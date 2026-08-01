import { describe, it, expect } from 'vitest';
import { MapStateService } from './map-state.service';
import { makeLatLng } from '../map-geometry';

describe('MapStateService', () => {
  let service: MapStateService;

  beforeEach(() => {
    service = new MapStateService();
  });

  it('starts with empty, unselected state', () => {
    expect(service.manzanasMarcadas()).toEqual([]);
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

  it('derives manzanasCount from manzanasMarcadas', () => {
    service.manzanasMarcadas.set([{ id: 'a', territorioNumero: 1 } as never]);
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

  it('stores the selected manzana state', () => {
    const polygon = {} as never;
    service.manzanaSeleccionada = polygon;
    service.manzanaSeleccionadaColor = '#ff0000';
    service.manzanaSeleccionadaNombre = 'A-1';
    service.manzanaSeleccionadaTerritorio = 5;
    service.manzanaEdges = [{ from: makeLatLng(0, 0), to: makeLatLng(0, 1) }];

    expect(service.manzanaSeleccionada).toBe(polygon);
    expect(service.manzanaSeleccionadaColor).toBe('#ff0000');
    expect(service.manzanaSeleccionadaNombre).toBe('A-1');
    expect(service.manzanaSeleccionadaTerritorio).toBe(5);
    expect(service.manzanaEdges).toHaveLength(1);
  });

  it('resets all UI state via resetUIState', () => {
    service.manzanasMarcadas.set([{ id: 'a', territorioNumero: 1 } as never]);
    service.totalManzanas.set(10);
    service.territorioSeleccionado.set(1);
    service.territoriosSeleccionados.set([1]);
    service.modoMarcado.set('parcial');
    service.puntosParciales.set([{ latlng: makeLatLng(0, 0), edgeIdx: 0, t: 0 }]);
    service.enviando.set(true);
    service.screenshotPreview.set('data:image/jpeg;base64,x');
    service.setDatosParciales(1, { puntos: [], geometria: '{}' });

    service.resetUIState();

    expect(service.manzanasMarcadas()).toEqual([]);
    expect(service.totalManzanas()).toBe(0);
    expect(service.territorioSeleccionado()).toBeNull();
    expect(service.territoriosSeleccionados()).toEqual([]);
    expect(service.modoMarcado()).toBe('none');
    expect(service.puntosParciales()).toEqual([]);
    expect(service.enviando()).toBe(false);
    expect(service.screenshotPreview()).toBeNull();
    expect(service.getDatosParciales(1)).toBeNull();
    expect(service.manzanaSeleccionada).toBeNull();
  });
});
