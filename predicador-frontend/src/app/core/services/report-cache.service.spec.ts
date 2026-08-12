import { TestBed } from '@angular/core/testing';
import { ReportCacheService } from './report-cache';
import type { Reporte } from '../models/models';

const ONLY_PLAIN = '{ "othermll": true }';

function reporte(id: number, territorio: number): Reporte {
  return {
    id, manzanaId: null, fecha: '2026-08-10T10:00:00Z', encargadoId: 1,
    encargadoNombre: 'Daniel', encargadoApellido: 'Uribe', sessionTime: '06:00',
    estado: 'completed', territorioNumero: territorio, totalManzanas: 3,
    manzanasMarcadas: 3, tipoSesion: 'completa', geometriaParcial: null,
    puntosParciales: null, manzanasIds: 'A,B,C',
  };
}

describe('ReportCacheService', () => {
  let service: ReportCacheService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ReportCacheService] });
    service = TestBed.inject(ReportCacheService);
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  it('set/get/remove/clear round-trip through localStorage', () => {
    service.setTerritorio(1, reporte(10, 1));
    service.setTerritorios(new Map([[2, reporte(11, 2)]]));
    expect(service.getCache().get(1)?.id).toBe(10);
    expect(service.getCache().get(2)?.id).toBe(11);

    service.removeTerritorios([1]);
    expect(service.getCache().has(1)).toBe(false);
    expect(service.hasData()).toBe(true);

    service.clear();
    expect(service.hasData()).toBe(false);
  });

  it('survives a service re-instantiation (read from localStorage)', () => {
    service.setTerritorio(1, reporte(10, 1));
    const fresh = TestBed.inject(ReportCacheService);
    expect(fresh.getCache().get(1)?.id).toBe(10);
  });

  it('discards corrupt payloads and keeps the service usable', () => {
    localStorage.setItem('predicador_reports_cache', ONLY_PLAIN);
    service = new ReportCacheService();
    expect(service.hasData()).toBe(false);
    expect(localStorage.getItem('predicador_reports_cache')).toBeNull();

    service.setTerritorio(1, reporte(10, 1));
    expect(service.getCache().get(1)?.id).toBe(10);
  });

  it('is a no-op when localStorage is unavailable (SSR guard)', () => {
    const storage = globalThis.localStorage;
    vi.stubGlobal('localStorage', undefined);
    try {
      const fresh = new ReportCacheService();
      fresh.setTerritorio(1, reporte(10, 1));
      expect(fresh.hasData()).toBe(false);
      expect(fresh.getCache().size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      if (storage) globalThis.localStorage = storage;
    }
  });
});