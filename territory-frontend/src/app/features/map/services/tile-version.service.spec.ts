import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TileVersionService } from './tile-version.service';
import { MapVectorTileService } from './map-vector-tile.service';
import type { MapEngine } from './map-engine.interface';

describe('TileVersionService', () => {
  let service: TileVersionService;
  let httpMock: HttpTestingController;
  let vectorTile: { updateTileUrl: ReturnType<typeof vi.fn> };
  let mockEngine: MapEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    vectorTile = { updateTileUrl: vi.fn() };
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
      req.flush({ tilejson: '3.0.0', bounds: [-74, -38, -72, -36], tiles: ['/tiles/{z}/{x}/{y}.pbf'] });
      // Let the firstValueFrom promise resolve
      await vi.advanceTimersByTimeAsync(0);
    });

    it('should be idempotent', async () => {
      service.startPolling(mockEngine);
      service.startPolling(mockEngine);

      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.flush({ tilejson: '3.0.0', bounds: [-74, -38, -72, -36], tiles: ['/tiles/{z}/{x}/{y}.pbf'] });
      await vi.advanceTimersByTimeAsync(0);
    });

    it('should use custom tile JSON URL', async () => {
      service.startPolling(mockEngine, '/custom/tiles.json');

      const req = httpMock.expectOne('/custom/tiles.json');
      req.flush({ tilejson: '3.0.0', bounds: [-74, -38, -72, -36], tiles: ['/tiles/{z}/{x}/{y}.pbf'] });
      await vi.advanceTimersByTimeAsync(0);
    });

    it('should not update tile URL on first fetch (no previous bounds)', async () => {
      service.startPolling(mockEngine);

      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.flush({ tilejson: '3.0.0', bounds: [-74, -38, -72, -36], tiles: ['/tiles/{z}/{x}/{y}.pbf'] });
      await vi.advanceTimersByTimeAsync(0);

      expect(vectorTile.updateTileUrl).not.toHaveBeenCalled();
    });

    it('should update tile URL when bounds change after interval', async () => {
      service.startPolling(mockEngine);

      // First fetch — baseline
      const req1 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req1.flush({ tilejson: '3.0.0', bounds: [-74, -38, -72, -36], tiles: ['/tiles/{z}/{x}/{y}.pbf'] });
      await vi.advanceTimersByTimeAsync(0);

      // Advance past the polling interval (30s)
      await vi.advanceTimersByTimeAsync(30_000);

      // Second fetch — bounds changed
      const req2 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req2.flush({ tilejson: '3.0.0', bounds: [-75, -39, -71, -35], tiles: ['/tiles/{z}/{x}/{y}.pbf'] });
      await vi.advanceTimersByTimeAsync(0);

      expect(vectorTile.updateTileUrl).toHaveBeenCalledTimes(1);
      expect(vectorTile.updateTileUrl).toHaveBeenCalledWith(
        mockEngine,
        expect.stringMatching(/\/tiles\/\{z\}\/\{x\}\/\{y\}\.pbf\?v=\d+/),
      );
    });

    it('should not update tile URL when bounds are unchanged', async () => {
      service.startPolling(mockEngine);

      const req1 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req1.flush({ tilejson: '3.0.0', bounds: [-74, -38, -72, -36], tiles: ['/tiles/{z}/{x}/{y}.pbf'] });
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(30_000);

      const req2 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req2.flush({ tilejson: '3.0.0', bounds: [-74, -38, -72, -36], tiles: ['/tiles/{z}/{x}/{y}.pbf'] });
      await vi.advanceTimersByTimeAsync(0);

      expect(vectorTile.updateTileUrl).not.toHaveBeenCalled();
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

  describe('stopPolling', () => {
    it('should stop polling', async () => {
      service.startPolling(mockEngine);
      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.flush({ tilejson: '3.0.0', bounds: [-74, -38, -72, -36], tiles: ['/tiles/{z}/{x}/{y}.pbf'] });
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
      req.flush({ tilejson: '3.0.0', bounds: [-74, -38, -72, -36], tiles: ['/tiles/{z}/{x}/{y}.pbf'] });
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
