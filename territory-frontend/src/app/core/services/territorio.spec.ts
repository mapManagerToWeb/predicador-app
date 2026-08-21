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

  function isBatch(req: { url: string; method: string }): boolean {
    return req.method === 'GET' && req.url.includes('/reports/batch');
  }
  function isVersions(req: { url: string; method: string }): boolean {
    return req.method === 'GET' && req.url.includes('/reports/versions');
  }
  function territoriosFrom(url: string): string[] {
    const query = url.split('?')[1] ?? '';
    return query.split('&')
      .filter(p => p.startsWith('territorios='))
      .map(p => p.slice('territorios='.length));
  }

  it('paints instantly from cache and only downloads changed territories', async () => {
    service['reportCache'].setTerritorio(1, reporte(10, 1));
    service['reportCache'].setTerritorio(2, reporte(11, 2));

    const promise = service.getReportesPorTerritorios([1, 2]);
    const versionsReq = httpMock.expectOne(isVersions);
    expect(territoriosFrom(versionsReq.request.url)).toEqual(['1', '2']);
    versionsReq.flush({ 1: 10, 2: 12 });
    await Promise.resolve();

    // Version 1 matches cache (10); version 2 changed (12 != 11) -> only 2 downloaded.
    const batchReq = httpMock.expectOne(isBatch);
    expect(territoriosFrom(batchReq.request.url)).toEqual(['2']);
    batchReq.flush({ 2: [reporte(12, 2)] });

    const result = await promise;
    expect(result.get(1)?.[0]?.id).toBe(10);
    expect(result.get(2)?.[0]?.id).toBe(12);
  });

  it('revalidates each territory only once per session', async () => {
    const promise = service.getReportesPorTerritorios([1]);
    const versionsReq = httpMock.expectOne(isVersions);
    versionsReq.flush({ 1: 10 });
    await Promise.resolve();
    httpMock.expectOne(isBatch).flush({ 1: [reporte(10, 1)] });

    await promise;

    // Second call: no network at all (version already seen).
    const second = service.getReportesPorTerritorios([1]);
    await Promise.resolve();
    httpMock.expectNone(isVersions);
    httpMock.expectNone(isBatch);
    await second;
    expect(service['versionsSeen'].has(1)).toBe(true);
  });

  it('falls back to cache when /versions fails (offline)', async () => {
    service['reportCache'].setTerritorio(1, reporte(10, 1));
    const result = service.getReportesDesdeCache([1]);
    expect(result.get(1)?.[0]?.id).toBe(10);

    const promise = service.revalidarReportes([1]);
    const versionsReq = httpMock.expectOne(isVersions);
    versionsReq.error(new ProgressEvent('error'), { status: 0, statusText: 'Offline' });
    const after = await promise;
    expect(after.get(1)?.[0]?.id).toBe(10);
  });

  it('fetches all /versions chunks in parallel and tolerates a failed chunk', async () => {
    // 55 territories -> 2 chunks of 50 + 5. Both requests must fire before any flush,
    // proving the chunks are fetched in parallel rather than serially.
    const nums = Array.from({ length: 55 }, (_, i) => i);
    const promise = service.revalidarReportes(nums);

    const versionsReqs = httpMock.match(isVersions);
    expect(versionsReqs).toHaveLength(2);
    const sorted = versionsReqs.sort((a, b) => territoriosFrom(a.request.url).length - territoriosFrom(b.request.url).length);
    const chunkDe50 = sorted[1];
    const chunkDe5 = sorted[0];
    expect(territoriosFrom(chunkDe5.request.url)).toContain('54');

    // Larger chunk fails (offline blip); smaller succeeds. Revalidation must continue.
    chunkDe50.error(new ProgressEvent('error'), { status: 0, statusText: 'Offline' });
    chunkDe5.flush({ 54: 7 });
    await Promise.resolve();

    const batchReq = httpMock.expectOne(isBatch);
    expect(territoriosFrom(batchReq.request.url)).toEqual(['54']);
    batchReq.flush({ 54: [reporte(2, 54)] });

    const result = await promise;
    expect(result.get(54)?.[0]?.id).toBe(2);
    expect(service['versionsSeen'].get(54)).toBe(7);
  });

  it('does not request territories that have no backend version and no cache', async () => {
    const promise = service.getReportesPorTerritorios([99]);
    const versionsReq = httpMock.expectOne(isVersions);
    versionsReq.flush({});

    const result = await promise;
    expect(result.has(99)).toBe(false);
    httpMock.expectNone(isBatch);
  });

  it('does not refetch a territory already known to be empty this session', async () => {
    service['versionsSeen'].set(99, -1);

    const result = await service.getReportesPorTerritorio(99);

    httpMock.expectNone(r => r.method === 'GET' && r.url.includes('/reports?territorioNumero='));
    expect(result).toEqual([]);
  });

  it('fetches fresh when a saved report is in cache but versionsSeen is stale (‑1)', async () => {
    service['versionsSeen'].set(98, -1);
    service['reportCache'].setTerritorio(98, reporte(20, 98));

    const promise = service.getReportesPorTerritorio(98);
    const req = httpMock.expectOne(r => r.method === 'GET' && r.url.includes('/reports?territorioNumero=98'));
    req.flush([reporte(20, 98)]);

    const result = await promise;
    expect(result[0].id).toBe(20);
    expect(service['versionsSeen'].get(98)).toBe(20);
  });

  describe('reconciliarCacheConBackend', () => {
    it('prunes cache entries (and versionsSeen) for territories deleted in the backend', async () => {
      service['reportCache'].setTerritorio(1, reporte(10, 1));
      service['reportCache'].setTerritorio(2, reporte(11, 2));
      service['versionsSeen'].set(2, 11);

      const promise = service.reconciliarCacheConBackend();
      const req = httpMock.expectOne(r => r.method === 'GET' && r.url.includes('/territories'));
      req.flush([1]);
      const vigentes = await promise;

      expect(vigentes).toEqual(new Set([1]));
      expect(service['reportCache'].getCache().has(1)).toBe(true);
      expect(service['reportCache'].getCache().has(2)).toBe(false);
      expect(service['versionsSeen'].has(2)).toBe(false);
      expect(service.hasCacheReportes()).toBe(true);
    });

    it('keeps the cache untouched and returns null when the backend is unreachable', async () => {
      service['reportCache'].setTerritorio(1, reporte(10, 1));

      const promise = service.reconciliarCacheConBackend();
      const req = httpMock.expectOne(r => r.method === 'GET' && r.url.includes('/territories'));
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Offline' });
      const vigentes = await promise;

      expect(vigentes).toBeNull();
      expect(service['reportCache'].getCache().has(1)).toBe(true);
    });

    it('prunes everything when the backend has no territories at all', async () => {
      service['reportCache'].setTerritorio(1, reporte(10, 1));

      const promise = service.reconciliarCacheConBackend();
      const req = httpMock.expectOne(r => r.method === 'GET' && r.url.includes('/territories'));
      req.flush([]);
      const vigentes = await promise;

      expect(vigentes).toEqual(new Set());
      expect(service['reportCache'].hasData()).toBe(false);
      expect(service.hasCacheReportes()).toBe(false);
    });
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

  it('revalidarReportes retries a transient 503 on /versions before continuing', async () => {
    vi.useFakeTimers();
    try {
      const promise = service.revalidarReportes([1]);

      let req = httpMock.expectOne(isVersions);
      req.flush('', { status: 503, statusText: 'Service Unavailable' });

      await vi.advanceTimersByTimeAsync(1000);
      req = httpMock.expectOne(isVersions);
      req.flush({ 1: 10 });
      await Promise.resolve();

      const batchReq = httpMock.expectOne(isBatch);
      batchReq.flush({ 1: [reporte(10, 1)] });

      const result = await promise;
      expect(result.get(1)?.[0]?.id).toBe(10);
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