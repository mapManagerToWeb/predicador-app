import { TestBed } from '@angular/core/testing';
import { DraftMarksService, MapDraft } from '../../features/map/services/map-draft';
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

  describe('guardar (storage failure)', () => {
    it('discards the stored draft when setItem throws (quota exceeded)', () => {
      const removeItem = vi.fn();
      vi.stubGlobal('localStorage', {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(() => {
          throw new Error('QuotaExceededError');
        }),
        removeItem,
      });
      try {
        service.guardar(sampleDraft());
        expect(removeItem).toHaveBeenCalledWith('territory_map_draft');
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('eliminarTerritorios (territorioSeleccionado)', () => {
    it('reassigns the selection to the single remaining territory', () => {
      const draft = sampleDraft();
      draft.territoriosSeleccionados = [1, 2];
      draft.territorioSeleccionado = 1;
      service.guardar(draft);

      service.eliminarTerritorios([1]);

      const restored = service.cargar();
      expect(restored?.territoriosSeleccionados).toEqual([2]);
      expect(restored?.territorioSeleccionado).toBe(2);
    });

    it('clears the selection when no selected territory remains', () => {
      const draft = sampleDraft();
      draft.territoriosSeleccionados = [1];
      draft.territorioSeleccionado = 1;
      service.guardar(draft);

      service.eliminarTerritorios([1]);

      const restored = service.cargar();
      expect(restored?.territoriosSeleccionados).toEqual([]);
      expect(restored?.territorioSeleccionado).toBeNull();
    });

    it('keeps the selection when the selected territory is not removed', () => {
      const draft = sampleDraft();
      draft.territoriosSeleccionados = [1, 2];
      draft.territorioSeleccionado = 2;
      service.guardar(draft);

      service.eliminarTerritorios([1]);

      const restored = service.cargar();
      expect(restored?.territorioSeleccionado).toBe(2);
    });

    it('is a no-op when there is no draft', () => {
      expect(() => service.eliminarTerritorios([1])).not.toThrow();
      expect(service.cargar()).toBeNull();
    });
  });

  describe('cargar (validation guards)', () => {
    function discard(payload: unknown): void {
      localStorage.setItem('territory_map_draft', JSON.stringify(payload));
      expect(service.cargar()).toBeNull();
      expect(localStorage.getItem('territory_map_draft')).toBeNull();
    }

    it('rejects a draft whose territoriosSeleccionados is not an array', () => {
      discard({ ...sampleDraft(), territoriosSeleccionados: 'nope' });
    });

    it('rejects a draft whose modoMarcado is not a string', () => {
      discard({ ...sampleDraft(), modoMarcado: 7 });
    });

    it('rejects a draft whose predicacion is not a string', () => {
      discard({ ...sampleDraft(), predicacion: null });
    });

    it('rejects a draft with a malformed manzana', () => {
      discard({ ...sampleDraft(), manzanasById: { A: { id: 'A' } } });
    });

    it('rejects a draft with a non-object manzana', () => {
      discard({ ...sampleDraft(), manzanasById: { A: 'nope' } });
    });

    it('rejects a draft whose datosParcialesGuardados is missing', () => {
      const draft = sampleDraft() as unknown as Record<string, unknown>;
      delete draft['datosParcialesGuardados'];
      discard(draft);
    });

    it('rejects a draft whose parcial points are not an array', () => {
      discard({
        ...sampleDraft(),
        datosParcialesGuardados: { 1: { puntos: 'x', geometria: '{}' } },
      });
    });

    it('rejects a draft with a malformed point', () => {
      discard({
        ...sampleDraft(),
        datosParcialesGuardados: { 1: { puntos: [{ lat: 'x', lng: 1 }], geometria: '{}' } },
      });
    });

    it('rejects a draft whose geometria is not a string', () => {
      discard({
        ...sampleDraft(),
        datosParcialesGuardados: { 1: { puntos: [], geometria: 42 } },
      });
    });

    it('returns null when the stored value is not an object', () => {
      discard('just a string');
    });
  });
});