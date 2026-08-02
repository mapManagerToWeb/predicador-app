import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TerritorioService } from './territorio';

describe('TerritorioService', () => {
  let service: TerritorioService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TerritorioService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function isBatchRequest(req: { url: string; method: string }): boolean {
    return req.method === 'GET' && req.url.includes('/reports/batch');
  }

  function territoriesFromUrl(url: string): string[] {
    const query = url.split('?')[1] ?? '';
    return query
      .split('&')
      .filter(part => part.startsWith('territorios='))
      .map(part => part.slice('territorios='.length));
  }

  it('chunks report batch requests to respect the backend 100-territory limit', async () => {
    const territorios = Array.from({ length: 120 }, (_, i) => i + 1);
    const promise = service.getReportesPorTerritorios(territorios);

    for (const expectedChunk of [50, 50, 20]) {
      const req = httpMock.expectOne(isBatchRequest);
      expect(territoriesFromUrl(req.request.url)).toHaveLength(expectedChunk);
      req.flush({});
      await Promise.resolve();
    }

    const result = await promise;
    expect(result.size).toBe(120);
  });

  it('does not re-request cached territories', async () => {
    const promise = service.getReportesPorTerritorios([1, 2]);

    const req = httpMock.expectOne(isBatchRequest);
    req.flush({ 1: [], 2: [] });

    const result = await promise;
    expect(result.get(1)).toEqual([]);
    expect(result.get(2)).toEqual([]);

    // Segundo fetch: ambas entradas ya están cacheadas, no debe haber request.
    await service.getReportesPorTerritorios([1, 2]);
    httpMock.expectNone(isBatchRequest);
  });

  it('single-territory fetch bypasses cache when absent and caches it', async () => {
    const promise = service.getReportesPorTerritorio(7);

    const req = httpMock.expectOne((r) => r.url.includes('/reports?territorioNumero=7'));
    req.flush([]);

    expect(await promise).toEqual([]);

    // Ahora 7 está cacheado; el batch no debe pedirlo de nuevo.
    await service.getReportesPorTerritorios([7]);
    httpMock.expectNone(isBatchRequest);
  });

  it('re-requests a territory once the cache TTL has expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const first = service.getReportesPorTerritorio(7);
      const req1 = httpMock.expectOne((r) => r.url.includes('/reports?territorioNumero=7'));
      req1.flush([]);
      await first;

      // Avanzar el reloj más allá del TTL de 5 minutos.
      vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);

      const second = service.getReportesPorTerritorio(7);
      const req2 = httpMock.expectOne((r) => r.url.includes('/reports?territorioNumero=7'));
      req2.flush([]);
      await second;
    } finally {
      vi.useRealTimers();
    }
  });
});
