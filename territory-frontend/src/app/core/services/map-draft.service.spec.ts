import { TestBed } from '@angular/core/testing';
import { DraftMarksService, MapDraft } from './map-draft';
import type { ManzanaMarcada } from '../types/map.types';

function sampleDraft(): MapDraft {
  const manzana: ManzanaMarcada = { id: 'A', nombreBloque: 'Bloque A', color: '#3b82f6', territorioNumero: 1 };
  return {
    manzanasById: { A: manzana },
    territoriosSeleccionados: [1],
    territorioSeleccionado: 1,
    datosParcialesGuardados: {
      1: { puntos: [{ lat: -33.4, lng: -70.6, edgeIdx: 0, t: 0.5 }], geometria: '{"type":"Polygon"}' },
    },
    modoMarcado: 'completa',
    predicacion: 'tarde',
    savedAt: Date.now(),
  };
}

describe('DraftMarksService', () => {
  let service: DraftMarksService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DraftMarksService] });
    service = TestBed.inject(DraftMarksService);
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  it('guardar/cargar round-trips and survives re-instantiation', () => {
    service.guardar(sampleDraft());
    const fresh = TestBed.inject(DraftMarksService);
    const restored = fresh.cargar();
    expect(restored?.territoriosSeleccionados).toEqual([1]);
    expect(restored?.manzanasById['A'].nombreBloque).toBe('Bloque A');
    expect(restored?.datosParcialesGuardados[1].puntos[0].lat).toBeCloseTo(-33.4);
    expect(fresh.tieneDraft()).toBe(true);
  });

  it('eliminarTerritorios removes only the given territories', () => {
    const draft = sampleDraft();
    draft.territoriosSeleccionados = [1, 2];
    draft.manzanasById['B'] = { id: 'B', nombreBloque: 'B', color: '#000', territorioNumero: 2 };
    service.guardar(draft);

    service.eliminarTerritorios([2]);

    const restored = service.cargar();
    expect(restored?.territoriosSeleccionados).toEqual([1]);
    expect(restored?.manzanasById['B']).toBeUndefined();
  });

  it('discards corrupt payloads', () => {
    localStorage.setItem('territory_map_draft', '{ not json');
    const fresh = TestBed.inject(DraftMarksService);
    expect(fresh.cargar()).toBeNull();
    expect(fresh.tieneDraft()).toBe(false);
    expect(localStorage.getItem('territory_map_draft')).toBeNull();
  });

  it('clear removes everything', () => {
    service.guardar(sampleDraft());
    service.clear();
    expect(service.cargar()).toBeNull();
    expect(service.tieneDraft()).toBe(false);
  });

  it('is a no-op when localStorage is unavailable (SSR guard)', () => {
    const storage = globalThis.localStorage;
    vi.stubGlobal('localStorage', undefined);
    try {
      const fresh = TestBed.inject(DraftMarksService);
      fresh.guardar(sampleDraft());
      expect(fresh.cargar()).toBeNull();
      expect(fresh.tieneDraft()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
      if (storage) globalThis.localStorage = storage;
    }
  });
});