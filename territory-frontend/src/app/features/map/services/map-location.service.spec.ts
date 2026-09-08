import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as L from 'leaflet';
import { MapLocationService } from './map-location.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { Toast } from '../../../core/services/toast';

const { fakeMap } = vi.hoisted(() => {
  const southWest = { lat: -37.5, lng: -73.4 };
  const northEast = { lat: -37.4, lng: -73.3 };
  const m = {
    setView: vi.fn(),
    getZoom: vi.fn(() => 15),
    getBounds: vi.fn(() => ({ pad: () => ({ contains: () => true }) })),
    getPane: vi.fn(() => undefined),
    createPane: vi.fn(() => ({ style: {} })),
    options: {},
    _southWest: southWest,
    _northEast: northEast,
  };
  m.setView.mockReturnValue(m);
  return { fakeMap: m };
});

vi.mock('leaflet', async importOriginal => {
  const actual = await importOriginal<typeof import('leaflet')>();
  return {
    ...actual,
    circleMarker: vi.fn(() => ({ setLatLng: vi.fn() })),
    circle: vi.fn(() => ({
      setLatLng: vi.fn(),
      setRadius: vi.fn(),
    })),
    layerGroup: vi.fn(() => {
      const group = { addTo: vi.fn(), remove: vi.fn() };
      (group.addTo as ReturnType<typeof vi.fn>).mockReturnValue(group);
      return group;
    }),
  };
});

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
    // jsdom no define isSecureContext como true por defecto en todos los entornos.
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

    geolocationMock.watchPosition.mockImplementation((ok: WatchCallback, ko: ErrorCallback) => {
      watchCb = ok;
      errorCb = ko;
      return 42;
    });

    TestBed.configureTestingModule({
      providers: [{ provide: MapRenderingFacade, useValue: { getMap: () => fakeMap } }],
    });
    const toast = TestBed.inject(Toast);
    toastShow = vi.spyOn(toast, 'show').mockImplementation(() => {});
    service = TestBed.inject(MapLocationService);
  });

  afterEach(() => {
    service.destroy();
  });

  it('toggle inicia watch y pasa a locating', () => {
    service.toggle();
    expect(geolocationMock.watchPosition).toHaveBeenCalledTimes(1);
    expect(service.status()).toBe('locating');
  });

  it('ignora taps mientras localiza el primer fix', () => {
    service.toggle();
    service.toggle();
    service.toggle();
    expect(geolocationMock.watchPosition).toHaveBeenCalledTimes(1);
  });

  it('el primer fix centra la vista y pasa a following con capas creadas', () => {
    service.toggle();
    watchCb(positionAt(-37.47, -73.35));

    expect(fakeMap.setView).toHaveBeenCalled();
    expect(L.layerGroup).toHaveBeenCalled();
    expect(service.status()).toBe('following');
  });

  it('un tap en following detiene el watch y limpia capas', () => {
    service.toggle();
    watchCb(positionAt(-37.47, -73.35));
    service.toggle();

    expect(geolocationMock.clearWatch).toHaveBeenCalledWith(42);
    expect(service.status()).toBe('idle');
  });

  it('fix dentro del viewport no recentra la vista', () => {
    service.toggle();
    watchCb(positionAt(-37.47, -73.35)); // primer fix: centra
    fakeMap.setView.mockClear();
    watchCb(positionAt(-37.471, -73.351)); // sigue dentro

    expect(fakeMap.setView).not.toHaveBeenCalled();
  });

  it('actualiza marcador y círculo con cada fix', () => {
    service.toggle();
    watchCb(positionAt(-37.47, -73.35));

    const marker = (L.circleMarker as ReturnType<typeof vi.fn>).mock.results[0].value;
    const accuracyCircle = (L.circle as ReturnType<typeof vi.fn>).mock.results[0].value;
    watchCb(positionAt(-37.48, -73.36, 120));

    expect(marker.setLatLng).toHaveBeenCalledTimes(2);
    expect(accuracyCircle.setLatLng).toHaveBeenCalledTimes(2);
    expect(accuracyCircle.setRadius).toHaveBeenCalledWith(120);
  });

  it('permiso denegado muestra toast, resetea a idle y limpia el watch', () => {
    service.toggle();
    errorCb(errorOf(1));

    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('Permiso'));
    expect(geolocationMock.clearWatch).toHaveBeenCalledWith(42);
    expect(service.status()).toBe('idle');
  });

  it('timeout y posición no disponible muestran toast de indisponibilidad', () => {
    service.toggle();
    errorCb(errorOf(3));
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('No se pudo'));

    service.toggle();
    errorCb(errorOf(2));
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('No se pudo'));
  });

  it('sin geolocation API o contexto inseguro avisa y no llama al navegador', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...globalThis.navigator, geolocation: undefined },
      configurable: true,
      writable: true,
    });
    service.toggle();
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('no permite'));
    expect(geolocationMock.watchPosition).not.toHaveBeenCalled();

    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...globalThis.navigator, geolocation: geolocationMock },
      configurable: true,
      writable: true,
    });
    service.toggle();
    expect(geolocationMock.watchPosition).not.toHaveBeenCalled();
  });

  it('precisión baja avisa una sola vez', () => {
    service.toggle();
    watchCb(positionAt(-37.47, -73.35, 500));
    watchCb(positionAt(-37.48, -73.36, 500));
    expect(toastShow).toHaveBeenCalledTimes(1);
  });

  it('destroy detiene el watch aunque siga localizando', () => {
    service.toggle();
    service.destroy();
    expect(geolocationMock.clearWatch).toHaveBeenCalledWith(42);
    expect(service.status()).toBe('idle');
  });
});
