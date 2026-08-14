import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TerritorioService } from './territorio';
import type { Reporte } from '../models/models';

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

    await promise;
  });

  it('eliminarReportes does not call the API with empty ids', async () => {
    await service.eliminarReportes([]);

    httpMock.expectNone(r => r.method === 'DELETE' && r.url.includes('/reports'));
  });
});