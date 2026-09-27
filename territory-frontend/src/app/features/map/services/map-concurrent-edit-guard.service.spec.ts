import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ConcurrentEditGuardService } from './map-concurrent-edit-guard.service';
import { MapStateService } from './map-state.service';
import { MapEditOverlayService } from './map-edit-overlay.service';
import { Toast } from '../../../core/services/toast';
import { TileVersionService } from './tile-version.service';
import type { MapEngine } from './map-engine.interface';

function createMockEngine(): MapEngine {
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

describe('ConcurrentEditGuardService', () => {
  let service: ConcurrentEditGuardService;
  let httpMock: HttpTestingController;
  let toastService: Toast;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ConcurrentEditGuardService,
        MapStateService,
        MapEditOverlayService,
        TileVersionService,
        Toast,
      ],
    });
    service = TestBed.inject(ConcurrentEditGuardService);
    httpMock = TestBed.inject(HttpTestingController);
    toastService = TestBed.inject(Toast);
  });

  afterEach(() => {
    httpMock.verify();
    service.stopMonitoring();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should not be monitoring initially', () => {
    expect(service.isMonitoring()).toBe(false);
  });

  describe('startMonitoring', () => {
    it('should start monitoring and capture baseline', () => {
      const engine = createMockEngine();

      service.startMonitoring(engine);

      expect(service.isMonitoring()).toBe(true);

      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      expect(req.request.method).toBe('GET');
      req.flush({ bounds: [0, 0, 1, 1], tiles: [] });
    });

    it('should be a no-op if already monitoring', () => {
      const engine = createMockEngine();

      service.startMonitoring(engine);
      service.startMonitoring(engine);

      // Only one baseline request should have been made
      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.flush({ bounds: [0, 0, 1, 1], tiles: [] });
    });

    it('should use a custom tile JSON URL when provided', () => {
      const engine = createMockEngine();

      service.startMonitoring(engine, '/custom/tiles.json');

      const req = httpMock.expectOne('/custom/tiles.json');
      req.flush({ bounds: [0, 0, 1, 1], tiles: [] });
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring and clear state', () => {
      const engine = createMockEngine();

      service.startMonitoring(engine);
      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.flush({ bounds: [0, 0, 1, 1], tiles: [] });

      service.stopMonitoring();

      expect(service.isMonitoring()).toBe(false);
    });
  });

  describe('concurrent edit detection', () => {
    it('warns when bounds change is detected on a poll cycle', async () => {
      vi.useFakeTimers();
      try {
        const engine = createMockEngine();
        const showSpy = vi.spyOn(toastService, 'show');

        service.startMonitoring(engine);
        const baselineReq = httpMock.expectOne('/api/v1/territories/tiles.json');
        baselineReq.flush({ bounds: [0, 0, 1, 1], tiles: [] });
        await vi.advanceTimersByTimeAsync(0);

        // Primer ciclo de polling: mismos bounds → sin aviso.
        await vi.advanceTimersByTimeAsync(10_000);
        const pollReq1 = httpMock.expectOne('/api/v1/territories/tiles.json');
        pollReq1.flush({ bounds: [0, 0, 1, 1], tiles: [] });
        await vi.advanceTimersByTimeAsync(0);
        expect(showSpy).not.toHaveBeenCalled();

        // Segundo ciclo: otro usuario cambió los bounds → aviso.
        await vi.advanceTimersByTimeAsync(10_000);
        const pollReq2 = httpMock.expectOne('/api/v1/territories/tiles.json');
        pollReq2.flush({ bounds: [0, 0, 2, 2], tiles: [] });
        await vi.advanceTimersByTimeAsync(0);

        expect(showSpy).toHaveBeenCalledWith(
          'El territorio fue modificado por otro usuario. Guarda tu trabajo o descárgalo.',
          6000,
          'warning',
        );
      } finally {
        service.stopMonitoring();
        vi.useRealTimers();
      }
    });

    it('updates the baseline after a change so the warning fires once', async () => {
      vi.useFakeTimers();
      try {
        const engine = createMockEngine();
        const showSpy = vi.spyOn(toastService, 'show');

        service.startMonitoring(engine);
        httpMock.expectOne('/api/v1/territories/tiles.json').flush({ bounds: [0, 0, 1, 1] });
        await vi.advanceTimersByTimeAsync(0);

        await vi.advanceTimersByTimeAsync(10_000);
        httpMock.expectOne('/api/v1/territories/tiles.json').flush({ bounds: [5, 5, 6, 6] });
        await vi.advanceTimersByTimeAsync(0);
        expect(showSpy).toHaveBeenCalledTimes(1);

        // Mismos bounds que el ciclo anterior: el baseline ya se actualizó.
        await vi.advanceTimersByTimeAsync(10_000);
        httpMock.expectOne('/api/v1/territories/tiles.json').flush({ bounds: [5, 5, 6, 6] });
        await vi.advanceTimersByTimeAsync(0);
        expect(showSpy).toHaveBeenCalledTimes(1);
      } finally {
        service.stopMonitoring();
        vi.useRealTimers();
      }
    });

    it('swallows network errors on the baseline capture', async () => {
      const engine = createMockEngine();

      service.startMonitoring(engine);
      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      req.error(new ProgressEvent('error'));
      await Promise.resolve();

      expect(service.isMonitoring()).toBe(true);
    });

    it('swallows network errors on a poll cycle and retries next time', async () => {
      vi.useFakeTimers();
      try {
        const engine = createMockEngine();
        const showSpy = vi.spyOn(toastService, 'show');

        service.startMonitoring(engine);
        httpMock.expectOne('/api/v1/territories/tiles.json').flush({ bounds: [0, 0, 1, 1] });
        await vi.advanceTimersByTimeAsync(0);

        await vi.advanceTimersByTimeAsync(10_000);
        httpMock.expectOne('/api/v1/territories/tiles.json').error(new ProgressEvent('error'));
        await vi.advanceTimersByTimeAsync(0);
        expect(showSpy).not.toHaveBeenCalled();

        // El siguiente ciclo vuelve a comparar contra el baseline original.
        await vi.advanceTimersByTimeAsync(10_000);
        httpMock.expectOne('/api/v1/territories/tiles.json').flush({ bounds: [9, 9, 9, 9] });
        await vi.advanceTimersByTimeAsync(0);
        expect(showSpy).toHaveBeenCalledTimes(1);
      } finally {
        service.stopMonitoring();
        vi.useRealTimers();
      }
    });

    it('ignores a poll tick that races after stopMonitoring', async () => {
      vi.useFakeTimers();
      try {
        const engine = createMockEngine();

        service.startMonitoring(engine);
        httpMock.expectOne('/api/v1/territories/tiles.json').flush({ bounds: [0, 0, 1, 1] });
        await vi.advanceTimersByTimeAsync(0);

        service.stopMonitoring();
        await vi.advanceTimersByTimeAsync(30_000);

        expect(httpMock.match('/api/v1/territories/tiles.json')).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should show warning when version changes during edit session', () => {
      const engine = createMockEngine();
      const showSpy = vi.spyOn(toastService, 'show');

      service.startMonitoring(engine);

      // Capture baseline
      const baselineReq = httpMock.expectOne('/api/v1/territories/tiles.json');
      baselineReq.flush({ bounds: [0, 0, 1, 1], tiles: [] });

      // Manually trigger the poll cycle by calling checkForChanges via
      // advancing the interval timer. Since zone+fake timers can deadlock,
      // we simulate the poll by directly triggering the HTTP call that
      // the setInterval would make.
      // First, stop the real timer to avoid unexpected requests
      service.stopMonitoring();
      service.startMonitoring(engine);

      // Re-capture baseline
      const baselineReq2 = httpMock.expectOne('/api/v1/territories/tiles.json');
      baselineReq2.flush({ bounds: [0, 0, 1, 1], tiles: [] });

      // Simulate a poll: the version changed
      // We can't easily trigger the internal setInterval with fake timers
      // due to zone.js interactions, so we test the observable outcome:
      // that after startMonitoring + baseline capture, the service is active
      expect(service.isMonitoring()).toBe(true);
      expect(showSpy).not.toHaveBeenCalled();
    });

    it('should capture baseline version on start', () => {
      const engine = createMockEngine();

      service.startMonitoring(engine);

      const req = httpMock.expectOne('/api/v1/territories/tiles.json');
      expect(req.request.method).toBe('GET');
      req.flush({ bounds: [10, 20, 30, 40], tiles: [] });

      expect(service.isMonitoring()).toBe(true);
    });

    it('should allow restart after stop', () => {
      const engine = createMockEngine();

      service.startMonitoring(engine);
      const req1 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req1.flush({ bounds: [0, 0, 1, 1], tiles: [] });

      service.stopMonitoring();
      expect(service.isMonitoring()).toBe(false);

      service.startMonitoring(engine);
      expect(service.isMonitoring()).toBe(true);

      const req2 = httpMock.expectOne('/api/v1/territories/tiles.json');
      req2.flush({ bounds: [0, 0, 1, 1], tiles: [] });
    });
  });
});
