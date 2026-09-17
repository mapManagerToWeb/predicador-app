import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapLocationService } from './map-location.service';
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
});
