import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapLocationService, type LocationEvent } from './map-location.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { Toast } from '../../../core/services/toast';

const geolocationMock = {
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
};

type WatchCallback = (pos: GeolocationPosition) => void;
type ErrorCallback = (err: GeolocationPositionError) => void;

function positionAt(lat: number, lng: number, accuracy = 20): GeolocationPosition {
  return {
    coords: { latitude: lat, longitude: lng, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now(),
  } as GeolocationPosition;
}

function errorOf(code: number): GeolocationPositionError {
  return { code, message: 'x', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
}

describe('MapLocationService', () => {
  let service: MapLocationService;
  let toastShow: ReturnType<typeof vi.spyOn>;
  let watchCb: WatchCallback;
  let errorCb: ErrorCallback;

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(globalThis, 'navigator', {
      value: { ...globalThis.navigator, geolocation: geolocationMock },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

    geolocationMock.watchPosition.mockImplementation((ok: WatchCallback, ko: ErrorCallback) => {
      watchCb = ok;
      errorCb = ko;
      return 42;
    });

    TestBed.configureTestingModule({
      providers: [{ provide: MapRenderingFacade, useValue: { getMap: () => ({}) } }],
    });
    const toast = TestBed.inject(Toast);
    toastShow = vi.spyOn(toast, 'show').mockImplementation(() => {});
    service = TestBed.inject(MapLocationService);
  });

  afterEach(() => {
    service.destroy();
  });

  it('toggle starts watch and moves to locating', () => {
    service.toggle();
    expect(geolocationMock.watchPosition).toHaveBeenCalledTimes(1);
    expect(service.status()).toBe('locating');
  });

  it('ignores taps while locating', () => {
    service.toggle();
    service.toggle();
    service.toggle();
    expect(geolocationMock.watchPosition).toHaveBeenCalledTimes(1);
  });

  it('first fix moves to following', () => {
    service.toggle();
    watchCb(positionAt(-37.47, -73.35));

    expect(service.status()).toBe('following');
  });

  it('tap in following stops the watch and clears', () => {
    service.toggle();
    watchCb(positionAt(-37.47, -73.35));
    service.toggle();

    expect(geolocationMock.clearWatch).toHaveBeenCalledWith(42);
    expect(service.status()).toBe('idle');
  });

  it('permission denied shows toast and resets to idle', () => {
    service.toggle();
    errorCb(errorOf(1));

    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('Permiso'));
    expect(geolocationMock.clearWatch).toHaveBeenCalledWith(42);
    expect(service.status()).toBe('idle');
  });

  it('timeout shows availability toast', () => {
    service.toggle();
    errorCb(errorOf(3));
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('No se pudo'));
  });

  it('position unavailable shows availability toast', () => {
    service.toggle();
    errorCb(errorOf(2));
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('No se pudo'));
  });

  it('no geolocation API warns and does not call the browser', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...globalThis.navigator, geolocation: undefined },
      configurable: true,
      writable: true,
    });
    service.toggle();
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('no permite'));
    expect(geolocationMock.watchPosition).not.toHaveBeenCalled();
  });

  it('low accuracy warns once', () => {
    service.toggle();
    watchCb(positionAt(-37.47, -73.35, 500));
    watchCb(positionAt(-37.48, -73.36, 500));
    expect(toastShow).toHaveBeenCalledTimes(1);
  });

  it('destroy stops the watch even while locating', () => {
    service.toggle();
    service.destroy();
    expect(geolocationMock.clearWatch).toHaveBeenCalledWith(42);
    expect(service.status()).toBe('idle');
  });

  // --- Ref-counted shared watch (task 5.1) ---

  it('no consumer holds a watch until start is called', () => {
    expect(service.watching()).toBe(false);
    expect(geolocationMock.watchPosition).not.toHaveBeenCalled();
    expect(service.status()).toBe('idle');
  });

  it('start returns a token and opens a single shared watch for two consumers', () => {
    const a = service.start();
    const b = service.start();

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
    expect(geolocationMock.watchPosition).toHaveBeenCalledTimes(1);
    expect(service.status()).toBe('locating');
    expect(service.watching()).toBe(true);
  });

  it('releasing one consumer keeps the shared watch alive', () => {
    const a = service.start()!;
    const b = service.start()!;

    service.stop(a);

    expect(geolocationMock.clearWatch).not.toHaveBeenCalled();
    expect(service.status()).toBe('locating');

    service.stop(b);

    expect(geolocationMock.clearWatch).toHaveBeenCalledWith(42);
    expect(service.status()).toBe('idle');
    expect(service.watching()).toBe(false);
  });

  it('stale or unknown consumer tokens are a no-op', () => {
    const a = service.start()!;

    service.stop({});
    service.stop(a);
    service.stop(a); // double release of the same token

    expect(geolocationMock.clearWatch).toHaveBeenCalledTimes(1);
    expect(service.status()).toBe('idle');
  });

  it('stopAll also releases the toggle-button token so a later toggle starts a fresh watch', () => {
    service.toggle();
    expect(geolocationMock.watchPosition).toHaveBeenCalledTimes(1);

    service.stopAll();
    expect(geolocationMock.clearWatch).toHaveBeenCalledWith(42);
    expect(service.status()).toBe('idle');

    service.toggle();
    expect(geolocationMock.watchPosition).toHaveBeenCalledTimes(2);
  });

  it('denied error tears down every consumer exactly once', () => {
    service.start();
    service.start();

    errorCb(errorOf(1));

    expect(geolocationMock.clearWatch).toHaveBeenCalledTimes(1);
    expect(service.status()).toBe('idle');
    expect(service.watching()).toBe(false);
  });

  it('late position after the last release is ignored', () => {
    const token = service.start()!;
    service.stop(token); // last release closes the watch

    watchCb(positionAt(-37.47, -73.35)); // late fix already in flight

    expect(service.status()).toBe('idle');
    expect(service.lat()).toBeNull();
  });

  // --- Position/error stream (task 5.1) ---

  it('events$ emits normalized position events to consumers', () => {
    const events: LocationEvent[] = [];
    const sub = service.events$.subscribe((e) => events.push(e));

    service.start();
    watchCb(positionAt(-37.47, -73.35, 15));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'position',
      lat: -37.47,
      lng: -73.35,
      accuracy: 15,
    });

    sub.unsubscribe();
  });

  it('events$ normalizes geolocation error codes to the spec vocabulary', () => {
    const events: LocationEvent[] = [];
    const sub = service.events$.subscribe((e) => events.push(e));

    service.start();
    errorCb(errorOf(3));
    service.start(); // watch was torn down by the first error: re-acquire
    errorCb(errorOf(2));

    expect(events).toEqual([
      { kind: 'error', code: 'timeout' },
      { kind: 'error', code: 'unavailable' },
    ]);

    sub.unsubscribe();
  });

  it('events$ emits denied on permission failure after tearing the watch down', () => {
    const events: LocationEvent[] = [];
    const sub = service.events$.subscribe((e) => events.push(e));

    service.start();
    errorCb(errorOf(1));

    expect(events).toEqual([{ kind: 'error', code: 'denied' }]);

    sub.unsubscribe();
  });

  it('start returns null and warns when geolocation is unavailable', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...globalThis.navigator, geolocation: undefined },
      configurable: true,
      writable: true,
    });

    expect(service.start()).toBeNull();
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('no permite'));
    expect(geolocationMock.watchPosition).not.toHaveBeenCalled();
  });
});
