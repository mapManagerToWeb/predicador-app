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
  };
}