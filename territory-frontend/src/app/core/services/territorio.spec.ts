import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { TerritorioService } from './territorio';
import type { RegistroReporte, Reporte } from '../models/models';

function registro(territorio: number): RegistroReporte {
  return {
    territorioNumero: territorio, manzanaId: null, encargadoId: 1, encargadoNombre: 'Daniel',
    encargadoApellido: 'Uribe', sessionTime: '06:00', estado: 'completed',
    totalManzanas: 3, manzanasMarcadas: 3, tipoSesion: 'completa',
    geometriaParcial: null, puntosParciales: null, manzanasIds: 'A,B,C',
  };
}

function reporte(id: number, territorio: number): Reporte {
  return {
    id, manzanaId: null, fecha: '2026-08-10T10:00:00Z', encargadoId: 1,
    encargadoNombre: 'Daniel', encargadoApellido: 'Uribe', sessionTime: '06:00',
    estado: 'completed', territorioNumero: territorio, totalManzanas: 3,
    manzanasMarcadas: 3, tipoSesion: 'completa', geometriaParcial: null,
    puntosParciales: null, manzanasIds: 'A,B,C',
  };
}

describe('TerritorioService', () => {
  let service: TerritorioService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TerritorioService);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    httpMock.verify();
  });

  it('al vencer la sesión borra la caché de reportes de versiones anteriores, no el borrador', () => {
    localStorage.setItem('territory_reports_cache', '{"savedAt":1,"data":{}}');
    localStorage.setItem('territory_map_draft', '{"v":2}');

    service.olvidarCache();
    expect(localStorage.getItem('territory_reports_cache')).toBeNull();
    expect(localStorage.getItem('territory_map_draft')).not.toBeNull();

    service.logout();
    expect(localStorage.getItem('territory_map_draft')).toBeNull();
  });

  it('crearReportes returns the saved reports with ids', async () => {
    const promise = service.crearReportes([{
      territorioNumero: 1, manzanaId: null, encargadoId: 1, encargadoNombre: 'Daniel',
      encargadoApellido: 'Uribe', sessionTime: '06:00', estado: 'completed',
      totalManzanas: 3, manzanasMarcadas: 3, tipoSesion: 'completa',
      geometriaParcial: null, puntosParciales: null, manzanasIds: 'A,B,C',
    }]);
    const req = httpMock.expectOne(r => r.method === 'POST' && r.url.includes('/reports'));
    req.flush([{ ...reporte(10, 1) }]);

    const saved = await promise;
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe(10);
  });

  it('eliminarReportes deletes the reports by id', async () => {
    const promise = service.eliminarReportes([10, 11]);
    const req = httpMock.expectOne(r =>
      r.method === 'DELETE' && r.url.includes('/reports') && r.params.get('ids') === '10,11'
    );
    req.flush(null);

    await expect(promise).resolves.toBeUndefined();
  });

  it('eliminarReportes does not call the API with empty ids', async () => {
    await service.eliminarReportes([]);

    const deleteCalls = httpMock.match(r => r.method === 'DELETE' && r.url.includes('/reports'));
    expect(deleteCalls).toHaveLength(0);
  });

  it('crearReportes retries a transient 503 and succeeds', async () => {
    vi.useFakeTimers();
    try {
      const promise = service.crearReportes([registro(1)]);

      let req = httpMock.expectOne(r => r.method === 'POST' && r.url.includes('/reports'));
      req.flush('', { status: 503, statusText: 'Service Unavailable' });

      await vi.advanceTimersByTimeAsync(1500);
      req = httpMock.expectOne(r => r.method === 'POST' && r.url.includes('/reports'));
      req.flush([{ ...reporte(10, 1) }]);

      const saved = await promise;
      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe(10);
    } finally {
      vi.useRealTimers();
    }
  });

  it('crearReportes propagates the error after exhausting transient retries', async () => {
    vi.useFakeTimers();
    try {
      const promise = service.crearReportes([registro(1)]);

      let req = httpMock.expectOne(r => r.method === 'POST' && r.url.includes('/reports'));
      req.flush('', { status: 503, statusText: 'Service Unavailable' });
      await vi.advanceTimersByTimeAsync(1500);

      req = httpMock.expectOne(r => r.method === 'POST' && r.url.includes('/reports'));
      req.flush('', { status: 503, statusText: 'Service Unavailable' });

      await expect(promise).rejects.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('eliminarReportes retries a transient 503', async () => {
    vi.useFakeTimers();
    try {
      const promise = service.eliminarReportes([10]);

      let req = httpMock.expectOne(r => r.method === 'DELETE' && r.url.includes('/reports'));
      req.flush('', { status: 503, statusText: 'Service Unavailable' });

      await vi.advanceTimersByTimeAsync(1500);
      req = httpMock.expectOne(r => r.method === 'DELETE' && r.url.includes('/reports'));
      req.flush(null);

      await expect(promise).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});