import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';

import {
  MapGpsFollowService,
  type GpsFollowMapEngine,
} from './map-gps-follow.service';
import { MapGpsOverlayService } from './map-gps-overlay.service';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { Toast } from '../../../core/services/toast';
import { LOCATION_DEFAULTS, TOAST_MESSAGES } from '../utils/map-constants';

type WatchCallback = (pos: GeolocationPosition) => void;
type ErrorCallback = (err: GeolocationPositionError) => void;

const geolocationMock = {
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
};

function positionAt(lat: number, lng: number, accuracy = 10): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  } as GeolocationPosition;
}

function errorOf(code: number): GeolocationPositionError {
  return { code, message: 'x', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
}

/** Engine mock exposing the four pause handlers registered via `on`. */
function createEngineMock(): {
  engine: GpsFollowMapEngine;
  handlers: Map<string, () => void>;
  easeTo: ReturnType<typeof vi.fn>;
} {
  const handlers = new Map<string, () => void>();
  const easeTo = vi.fn();
  const engine = {
    easeTo,
    on: vi.fn((event: string, handler: () => void) => {
      handlers.set(event, handler);
    }),
    off: vi.fn(),
  } as unknown as GpsFollowMapEngine;
  return { engine, handlers, easeTo };
}

describe('MapGpsFollowService', () => {
  let service: MapGpsFollowService;
  let overlay: {
    attach: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
    updatePosition: ReturnType<typeof vi.fn>;
    updateTrail: ReturnType<typeof vi.fn>;
    clearPosition: ReturnType<typeof vi.fn>;
    clearTrail: ReturnType<typeof vi.fn>;
  };
  let mapState: MapStateService;
  let watchCb: WatchCallback;
  let errorCb: ErrorCallback;
  let originalGeo: PropertyDescriptor | undefined;
  let originalSecure: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.clearAllMocks();

    originalGeo = Object.getOwnPropertyDescriptor(globalThis.navigator, 'geolocation');
    originalSecure = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: geolocationMock,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

    geolocationMock.watchPosition.mockImplementation((ok: WatchCallback, ko: ErrorCallback) => {
      watchCb = ok;
      errorCb = ko;
      return 42;
    });

    overlay = {
      attach: vi.fn(),
      detach: vi.fn(),
      updatePosition: vi.fn(),
      updateTrail: vi.fn(),
      clearPosition: vi.fn(),
      clearTrail: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: MapRenderingFacade, useValue: { getMap: () => ({}) } },
        { provide: MapGpsOverlayService, useValue: overlay },
      ],
    });
    const toast = TestBed.inject(Toast);
    vi.spyOn(toast, 'show').mockImplementation(() => undefined);
    service = TestBed.inject(MapGpsFollowService);
    mapState = TestBed.inject(MapStateService);
  });

  afterEach(() => {
    service.destroy();
    if (originalGeo) Object.defineProperty(globalThis.navigator, 'geolocation', originalGeo);
    else Object.defineProperty(globalThis.navigator, 'geolocation', { value: undefined, configurable: true });
    if (originalSecure) Object.defineProperty(window, 'isSecureContext', originalSecure);
  });

  // ── State machine ─────────────────────────────────────────────

  it('starts off and activates into a shared watch', () => {
    expect(service.state()).toBe('off');

    service.activate();

    expect(service.state()).toBe('active');
    expect(service.error()).toBeNull();
    expect(geolocationMock.watchPosition).toHaveBeenCalledTimes(1);
  });

  it('pauses on dragstart and resumes via recenter', () => {
    const { engine, handlers } = createEngineMock();
    service.attachEngine(engine);
    service.activate();

    handlers.get('dragstart')?.();
    expect(service.state()).toBe('paused');

    watchCb(positionAt(-33.4489, -70.6693));
    service.recenter();

    expect(service.state()).toBe('active');
  });

  it('recenter is a no-op unless the state is paused', () => {
    const { engine, easeTo } = createEngineMock();
    service.attachEngine(engine);

    service.recenter(); // off → no-op
    expect(service.state()).toBe('off');

    service.activate(); // active → no-op
    service.recenter();
    expect(service.state()).toBe('active');
    expect(easeTo).not.toHaveBeenCalled();
  });

  it('deactivate releases the watch, clears the marker and keeps the trail', () => {
    const { engine } = createEngineMock();
    service.attachEngine(engine);
    service.activate();
    watchCb(positionAt(-33.4489, -70.6693));
    expect(service.trail().length).toBe(1);

    service.deactivate();

    expect(service.state()).toBe('off');
    expect(geolocationMock.clearWatch).toHaveBeenCalledWith(42);
    expect(overlay.clearPosition).toHaveBeenCalled();
    expect(service.trail().length).toBe(1); // trail survives deactivation
  });

  it('does not activate while edit mode owns the camera (D4)', () => {
    mapState.modoMarcado.set('parcial');

    service.activate();

    expect(service.state()).toBe('off');
    expect(geolocationMock.watchPosition).not.toHaveBeenCalled();
  });

  it('auto-pauses on edit-mode entry and never auto-resumes (D4)', () => {
    service.activate();
    expect(service.state()).toBe('active');

    mapState.modoMarcado.set('parcial');
    TestBed.flushEffects();
    expect(service.state()).toBe('paused');

    mapState.modoMarcado.set('none');
    TestBed.flushEffects();
    expect(service.state()).toBe('paused'); // explicit action only
  });

  // ── Camera interaction ────────────────────────────────────────

  it('pauses on zoomstart, rotatestart and pitchstart', () => {
    const { engine, handlers } = createEngineMock();
    service.attachEngine(engine);

    for (const event of ['zoomstart', 'rotatestart', 'pitchstart'] as const) {
      service.activate();
      handlers.get(event)?.();
      expect(service.state()).toBe('paused');
      service.recenter();
    }
  });

  it('does not treat its own easeTo as user interaction (easing guard)', () => {
    const { engine, handlers, easeTo } = createEngineMock();
    // MapLibre fires camera `*start` events synchronously inside easeTo.
    easeTo.mockImplementation(() => handlers.get('zoomstart')?.());
    service.attachEngine(engine);
    service.activate();

    watchCb(positionAt(-33.4489, -70.6693)); // active → easeTo → synchronous zoomstart

    expect(easeTo).toHaveBeenCalledTimes(1);
    expect(service.state()).toBe('active');
  });

  it('a zoomstart outside an easeTo still pauses', () => {
    const { engine, handlers } = createEngineMock();
    service.attachEngine(engine);
    service.activate();

    handlers.get('zoomstart')?.();

    expect(service.state()).toBe('paused');
  });

  // ── Error handling ────────────────────────────────────────────

  it('surfaces the unsupported error and stays off when geolocation is unavailable', () => {
    Object.defineProperty(globalThis.navigator, 'geolocation', { value: undefined, configurable: true });

    service.activate();

    expect(service.state()).toBe('off');
    expect(service.error()).toBe('unsupported');
    expect(service.errorMessage()).toBe(TOAST_MESSAGES.locationUnsupported);
  });

  it('a permission-denied watch error stops follow mode, keeps the map usable and clears the marker', () => {
    const { engine } = createEngineMock();
    service.attachEngine(engine);
    service.activate();

    errorCb(errorOf(1));

    expect(service.state()).toBe('off');
    expect(service.error()).toBe('denied');
    expect(service.errorMessage()).toBe(TOAST_MESSAGES.locationDenied);
    expect(overlay.clearPosition).toHaveBeenCalledWith(engine);
  });

  it('normalizes position-unavailable and timeout to the unavailable message', () => {
    service.activate();
    errorCb(errorOf(2));
    expect(service.error()).toBe('unavailable');
    expect(service.errorMessage()).toBe(TOAST_MESSAGES.locationUnavailable);

    service.activate(); // retry re-acquires a fresh watch
    errorCb(errorOf(3));
    expect(service.error()).toBe('timeout');
    expect(service.errorMessage()).toBe(TOAST_MESSAGES.locationUnavailable);
  });

  it('ignores stream events after deactivation', () => {
    service.activate();
    service.deactivate();

    watchCb(positionAt(-33.4489, -70.6693));

    expect(service.state()).toBe('off');
    expect(service.trail()).toEqual([]);
  });

  // ── Trail hygiene ─────────────────────────────────────────────

  it('filters trail points closer than the minimum distance', () => {
    const { engine } = createEngineMock();
    service.attachEngine(engine);
    service.activate();

    watchCb(positionAt(0, 0));
    watchCb(positionAt(0, 0.00001)); // ~1 m away → filtered
    watchCb(positionAt(0, 0.0001)); // ~11 m away → recorded

    expect(service.trail().length).toBe(2);
    expect(overlay.updateTrail).toHaveBeenCalledTimes(2);
  });

  it('keeps recording the trail while paused but stops re-centering', () => {
    const { engine, handlers, easeTo } = createEngineMock();
    service.attachEngine(engine);
    service.activate();

    watchCb(positionAt(0, 0));
    expect(easeTo).toHaveBeenCalledTimes(1);

    handlers.get('dragstart')?.();
    expect(service.state()).toBe('paused');

    watchCb(positionAt(0, 0.0001)); // walking continues while paused

    expect(service.state()).toBe('paused');
    expect(service.trail().length).toBe(2);
    expect(easeTo).toHaveBeenCalledTimes(1); // no further camera lock
    expect(overlay.updatePosition).toHaveBeenCalledTimes(2); // marker still updates
  });

  it('caps the trail at 2000 points dropping the oldest', () => {
    service.activate();
    const total = LOCATION_DEFAULTS.trailMaxPoints + 5;

    for (let i = 0; i < total; i++) {
      watchCb(positionAt(0, i * 0.0001)); // ~11 m steps, all pass the 5 m filter
    }

    expect(service.trail().length).toBe(LOCATION_DEFAULTS.trailMaxPoints);
    // Oldest points were dropped: first kept point is the 6th emitted.
    expect(service.trail()[0]).toEqual([5 * 0.0001, 0]);
  });

  it('clearTrail empties the signal and the rendered source', () => {
    const { engine } = createEngineMock();
    service.attachEngine(engine);
    service.activate();
    watchCb(positionAt(0, 0));

    service.clearTrail();

    expect(service.trail()).toEqual([]);
    expect(service.hasTrail()).toBe(false);
    expect(overlay.clearTrail).toHaveBeenCalledWith(engine);
  });

  // ── Engine lifecycle ──────────────────────────────────────────

  it('attachEngine wires the overlay and the four pause handlers', () => {
    const { engine, handlers } = createEngineMock();

    service.attachEngine(engine);

    expect(overlay.attach).toHaveBeenCalledWith(engine);
    expect([...handlers.keys()].sort()).toEqual(['dragstart', 'pitchstart', 'rotatestart', 'zoomstart']);
  });

  it('destroy releases the watch, detaches handlers and resets all state (idempotent)', () => {
    const { engine, handlers } = createEngineMock();
    service.attachEngine(engine);
    service.activate();
    watchCb(positionAt(0, 0));

    service.destroy();

    expect(geolocationMock.clearWatch).toHaveBeenCalledWith(42);
    expect(engine.off).toHaveBeenCalledTimes(4);
    expect(overlay.detach).toHaveBeenCalledWith(engine);
    expect(handlers.size).toBe(4); // mock keeps entries; off is what matters
    expect(service.state()).toBe('off');
    expect(service.trail()).toEqual([]);
    expect(service.error()).toBeNull();

    expect(() => service.destroy()).not.toThrow(); // idempotent
  });

  it('position updates after destroy are ignored (watch already released)', () => {
    service.activate();
    service.destroy();

    // A late callback may still arrive before clearWatch takes effect.
    watchCb(positionAt(0, 0));

    expect(service.state()).toBe('off');
    expect(service.trail()).toEqual([]);
  });
});
