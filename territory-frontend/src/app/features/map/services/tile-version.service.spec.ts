import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TileVersionService } from './tile-version.service';
import { MapVectorTileService } from './map-vector-tile.service';
import type { MapEngine } from './map-engine.interface';

const TILE_URL = '/tiles/{z}/{x}/{y}.pbf';
const BOUNDS = [-74, -38, -72, -36];

describe('TileVersionService', () => {
  let service: TileVersionService;
  let httpMock: HttpTestingController;
  let vectorTile: { updateTileUrl: ReturnType<typeof vi.fn>; getBaseTileUrl: ReturnType<typeof vi.fn> };
  let mockEngine: MapEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    vectorTile = { updateTileUrl: vi.fn(), getBaseTileUrl: vi.fn().mockReturnValue(TILE_URL) };
    mockEngine = createMockMapEngine();

    TestBed.configureTestingModule({
      providers: [
        TileVersionService,
        { provide: MapVectorTileService, useValue: vectorTile },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(TileVersionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.stopPolling();
    httpMock.verify();
    vi.useRealTimers();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('startPolling', () => {
    it('should fetch TileJSON on start', async () => {
      service.startPolling(mockEngine);

      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      expect(req.request.method).toBe('GET');
      req.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      // Let the firstValueFrom promise resolve
      await vi.advanceTimersByTimeAsync(0);
    });

    it('should be idempotent', async () => {
      service.startPolling(mockEngine);
      service.startPolling(mockEngine);

      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);
    });

    it('should use custom tile JSON URL', async () => {
      service.startPolling(mockEngine, '/custom/tiles.json');

      const req = httpMock.expectOne('/custom/tiles.json');
      req.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);
    });

    it('applies ?v=<number> immediately on the first poll when data_version is present', async () => {
      service.startPolling(mockEngine);

      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);

      expect(vectorTile.updateTileUrl).toHaveBeenCalledTimes(1);
      expect(vectorTile.updateTileUrl).toHaveBeenCalledWith(
        mockEngine,
        expect.stringMatching(/\/tiles\/\{z\}\/\{x\}\/\{y\}\.pbf\?v=\d+$/),
      );
      expect(vectorTile.updateTileUrl).toHaveBeenCalledWith(mockEngine, `${TILE_URL}?v=1`);
    });

    it('does not update tile URL on first fetch when data_version is absent (legacy bounds-hash)', async () => {
      service.startPolling(mockEngine);

      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL] });
      await vi.advanceTimersByTimeAsync(0);

      expect(vectorTile.updateTileUrl).not.toHaveBeenCalled();
    });

    it('updates the tile URL when data_version changes even if bounds are unchanged', async () => {
      service.startPolling(mockEngine);

      // First poll — baseline + immediate ?v=1
      const req1 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req1.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);
      expect(vectorTile.updateTileUrl).toHaveBeenCalledTimes(1);

      // Advance past the polling interval (30s) — same bounds, new data_version
      await vi.advanceTimersByTimeAsync(30_000);

      const req2 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req2.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 2 });
      await vi.advanceTimersByTimeAsync(0);

      expect(vectorTile.updateTileUrl).toHaveBeenCalledTimes(2);
      expect(vectorTile.updateTileUrl).toHaveBeenLastCalledWith(mockEngine, `${TILE_URL}?v=2`);
    });

    it('does not update tile URL when data_version is unchanged', async () => {
      service.startPolling(mockEngine);

      const req1 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req1.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);
      expect(vectorTile.updateTileUrl).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30_000);

      const req2 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req2.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);

      expect(vectorTile.updateTileUrl).toHaveBeenCalledTimes(1);
    });

    it('falls back to bounds-hash + Date.now versioning when data_version is absent', async () => {
      service.startPolling(mockEngine);

      // First fetch — baseline (legacy: no update on first poll)
      const req1 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req1.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL] });
      await vi.advanceTimersByTimeAsync(0);
      expect(vectorTile.updateTileUrl).not.toHaveBeenCalled();

      // Advance past the polling interval (30s)
      await vi.advanceTimersByTimeAsync(30_000);

      // Second fetch — bounds changed (no data_version field anywhere)
      const req2 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req2.flush({ tilejson: '3.0.0', bounds: [-75, -39, -71, -35], tiles: [TILE_URL] });
      await vi.advanceTimersByTimeAsync(0);

      expect(vectorTile.updateTileUrl).toHaveBeenCalledTimes(1);
      expect(vectorTile.updateTileUrl).toHaveBeenCalledWith(
        mockEngine,
        expect.stringMatching(/\/tiles\/\{z\}\/\{x\}\/\{y\}\.pbf\?v=\d+$/),
      );
    });

    it('should warn and not throw when TileJSON endpoint returns 404', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      service.startPolling(mockEngine);

      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.flush('Not Found', { status: 404, statusText: 'Not Found' });
      await vi.advanceTimersByTimeAsync(0);

      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain('TileJSON fetch failed');
      warnSpy.mockRestore();
    });

    it('should warn on network error', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      service.startPolling(mockEngine);

      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.error(new ProgressEvent('error'));
      await vi.advanceTimersByTimeAsync(0);

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('handleTileError', () => {
    async function startWithVersionOne(): Promise<void> {
      service.startPolling(mockEngine);
      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);
      expect(vectorTile.updateTileUrl).toHaveBeenCalledTimes(1);
    }

    it('forces a cache-busted tile refresh when data_version is unchanged', async () => {
      await startWithVersionOne();
      vectorTile.updateTileUrl.mockClear();

      service.handleTileError();
      // recoverTiles refetches TileJSON first (no version bump expected).
      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);

      expect(vectorTile.updateTileUrl).toHaveBeenCalledTimes(1);
      expect(vectorTile.updateTileUrl).toHaveBeenCalledWith(
        mockEngine,
        expect.stringMatching(/\/tiles\/\{z\}\/\{x\}\/\{y\}\.pbf\?v=\d+$/),
      );
    });

    it('swallows repeated errors inside the recovery cooldown (backoff)', async () => {
      await startWithVersionOne();
      vectorTile.updateTileUrl.mockClear();

      service.handleTileError();
      const req1 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req1.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);
      expect(vectorTile.updateTileUrl).toHaveBeenCalledTimes(1);

      // A second error inside the 5s cooldown window is ignored.
      service.handleTileError();
      await vi.advanceTimersByTimeAsync(4_999);
      expect(httpMock.match('/api/v1/territories/tiles.json')).toHaveLength(0);
      expect(vectorTile.updateTileUrl).toHaveBeenCalledTimes(1);

      // After the cooldown expires, the next error triggers a refresh again.
      await vi.advanceTimersByTimeAsync(1);
      service.handleTileError();
      const req2 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req2.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);
      expect(vectorTile.updateTileUrl).toHaveBeenCalledTimes(2);
    });

    it('does nothing without an attached engine', () => {
      service.handleTileError();
      expect(httpMock.match('/api/v1/territories/tiles.json')).toHaveLength(0);
      expect(vectorTile.updateTileUrl).not.toHaveBeenCalled();
    });
  });

  describe('stopPolling', () => {
    it('should stop polling', async () => {
      service.startPolling(mockEngine);
      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);

      service.stopPolling();
      expect(service.isPolling()).toBe(false);
    });

    it('should be idempotent', () => {
      service.stopPolling();
      service.stopPolling();
      expect(service.isPolling()).toBe(false);
    });
  });

  describe('isPolling', () => {
    it('should return false initially', () => {
      expect(service.isPolling()).toBe(false);
    });

    it('should return true after startPolling', async () => {
      service.startPolling(mockEngine);
      expect(service.isPolling()).toBe(true);
      // Flush the pending request to avoid afterEach verify failure
      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  describe('checkVersionNow', () => {
    it('reusa el engine adjunto y refresca la versión de inmediato', async () => {
      service.startPolling(mockEngine);
      const req1 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req1.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);
      vectorTile.updateTileUrl.mockClear();

      service.checkVersionNow();

      const req2 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req2.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 2 });
      await vi.advanceTimersByTimeAsync(0);

      expect(vectorTile.updateTileUrl).toHaveBeenCalledWith(mockEngine, `${TILE_URL}?v=2`);
    });

    it('acepta un engine explícito cuando el polling no está activo', async () => {
      service.checkVersionNow(mockEngine);

      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 7 });
      await vi.advanceTimersByTimeAsync(0);

      expect(vectorTile.updateTileUrl).toHaveBeenCalledWith(mockEngine, `${TILE_URL}?v=7`);
    });
  });

  describe('visibilitychange', () => {
    function setVisibility(state: DocumentVisibilityState): void {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => state,
      });
    }

    afterEach(() => {
      delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState;
    });

    it('revisa la versión al volver la pestaña a visible', async () => {
      service.startPolling(mockEngine);
      const req1 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req1.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);

      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));

      const req2 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req2.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);
      // Sin cambio de versión: no reescribe la URL.
      expect(vectorTile.updateTileUrl).toHaveBeenCalledTimes(1);
    });

    it('ignora el evento cuando la pestaña queda oculta', async () => {
      service.startPolling(mockEngine);
      const req1 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req1.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);

      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);

      expect(httpMock.match('/api/v1/territories/tiles.json')).toHaveLength(0);
    });

    it('ignora el evento si el polling ya se detuvo', async () => {
      service.startPolling(mockEngine);
      const req1 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req1.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);
      service.stopPolling();

      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);

      expect(httpMock.match('/api/v1/territories/tiles.json')).toHaveLength(0);
    });
  });

  describe('checkVersion edge cases', () => {
    it('trata data_version: null como backend legado (hash de bounds)', async () => {
      service.startPolling(mockEngine);
      const req1 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req1.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: null });
      await vi.advanceTimersByTimeAsync(0);
      expect(vectorTile.updateTileUrl).not.toHaveBeenCalled();

      // Segundo poll con los mismos bounds: sin cambio, sin actualización.
      await vi.advanceTimersByTimeAsync(30_000);
      const req2 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req2.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: null });
      await vi.advanceTimersByTimeAsync(0);
      expect(vectorTile.updateTileUrl).not.toHaveBeenCalled();
    });

    it('usa & como separador cuando la plantilla ya trae query string', async () => {
      service.startPolling(mockEngine);
      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.flush({
        tilejson: '3.0.0',
        bounds: BOUNDS,
        tiles: ['/tiles/{z}/{x}/{y}.pbf?layer=territory'],
        data_version: 4,
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(vectorTile.updateTileUrl).toHaveBeenCalledWith(
        mockEngine,
        '/tiles/{z}/{x}/{y}.pbf?layer=territory&v=4',
      );
    });

    it('no hace nada si el polling se detiene con la petición en vuelo', async () => {
      service.startPolling(mockEngine);
      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      service.stopPolling();
      req.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 9 });
      await vi.advanceTimersByTimeAsync(0);

      expect(vectorTile.updateTileUrl).not.toHaveBeenCalled();
      expect(service.isPolling()).toBe(false);
    });
  });

  describe('recoverTiles branches', () => {
    it('no usa cache-buster cuando la versión cambió durante la recuperación', async () => {
      service.startPolling(mockEngine);
      const req1 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req1.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);
      vectorTile.updateTileUrl.mockClear();

      service.handleTileError();
      const req2 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req2.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 2 });
      await vi.advanceTimersByTimeAsync(0);

      // Solo la actualización por ?v=2; sin Date.now() extra.
      expect(vectorTile.updateTileUrl).toHaveBeenCalledTimes(1);
      expect(vectorTile.updateTileUrl).toHaveBeenCalledWith(mockEngine, `${TILE_URL}?v=2`);
    });

    it('no cache-bustea en backend legado sin data_version', async () => {
      service.startPolling(mockEngine);
      const req1 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req1.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL] });
      await vi.advanceTimersByTimeAsync(0);
      vectorTile.updateTileUrl.mockClear();

      service.handleTileError();
      const req2 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req2.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL] });
      await vi.advanceTimersByTimeAsync(0);

      // previousVersion sigue en null: no hay bust ni actualización.
      expect(vectorTile.updateTileUrl).not.toHaveBeenCalled();
    });

    it('aborta si el polling se detiene durante la recuperación', async () => {
      service.startPolling(mockEngine);
      const req1 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req1.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);
      vectorTile.updateTileUrl.mockClear();

      service.handleTileError();
      const req2 = httpMock.expectOne('/api/v1/territories/tiles.json');
      service.stopPolling();
      req2.flush({ tilejson: '3.0.0', bounds: BOUNDS, tiles: [TILE_URL], data_version: 1 });
      await vi.advanceTimersByTimeAsync(0);

      expect(vectorTile.updateTileUrl).not.toHaveBeenCalled();
    });
  });
});

function createMockMapEngine(): MapEngine {
  return {
    init: vi.fn(),
    addSource: vi.fn(),
    addGeoJsonSource: vi.fn(),
    updateGeoJsonSourceData: vi.fn(),
    project: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    removeSource: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    setSourceUrl: vi.fn(),
    queryRenderedFeatures: vi.fn().mockReturnValue([]),
    on: vi.fn(),
    off: vi.fn(),
    fitBounds: vi.fn(),
    getZoom: vi.fn().mockReturnValue(15),
    setZoom: vi.fn(),
    getCenter: vi.fn().mockReturnValue({ lng: 0, lat: 0 }),
    setCenter: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    setFeatureState: vi.fn(),
    removeFeatureState: vi.fn(),
    captureCanvas: vi.fn().mockResolvedValue(null),
  };
}