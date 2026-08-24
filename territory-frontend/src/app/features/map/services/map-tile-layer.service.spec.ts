import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapTileLayerService } from './map-tile-layer.service';
import { MapEngineService } from './map-engine.service';
import { TILE_LAYERS, ATTRIBUTIONS } from '../utils/map-constants';

const { tileLayerMock, controlZoomMock } = vi.hoisted(() => {
  const makeTile = () => {
    const t = { addTo: vi.fn(), setUrl: vi.fn() };
    t.addTo.mockReturnValue(t);
    return t;
  };
  const tileLayerMock = vi.fn(makeTile);
  const controlZoomMock = { zoom: vi.fn(() => ({ addTo: vi.fn() })) };
  return { tileLayerMock, controlZoomMock };
});

vi.mock('leaflet', () => ({
  tileLayer: (url: string, options: object) => tileLayerMock(url, options),
  control: controlZoomMock,
}));

describe('MapTileLayerService', () => {
  let service: MapTileLayerService;
  let engine: { getMap: ReturnType<typeof vi.fn> };
  let fakeMap: { removeLayer: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    fakeMap = { removeLayer: vi.fn() };
    engine = { getMap: vi.fn().mockReturnValue(fakeMap) };
    TestBed.configureTestingModule({
      providers: [MapTileLayerService, { provide: MapEngineService, useValue: engine }],
    });
    service = TestBed.inject(MapTileLayerService);
    vi.clearAllMocks();
    document.documentElement.dataset['theme'] = 'light';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    service.destroy();
  });

  it('does nothing when there is no map', () => {
    engine.getMap.mockReturnValue(null);

    service.initLayers();

    expect(tileLayerMock).not.toHaveBeenCalled();
  });

  it('creates base and satellite tile layers and adds the zoom control', () => {
    service.initLayers();

    expect(tileLayerMock).toHaveBeenCalledWith(TILE_LAYERS.light, {
      maxZoom: 18,
      attribution: ATTRIBUTIONS.light,
      crossOrigin: true,
    });
    expect(tileLayerMock).toHaveBeenCalledWith(TILE_LAYERS.satellite, {
      maxZoom: 18,
      attribution: ATTRIBUTIONS.satellite,
      crossOrigin: true,
    });
    expect(controlZoomMock.zoom).toHaveBeenCalledWith({ position: 'bottomright' });
    expect(service.isSatellite()).toBe(false);
  });

  it('uses the dark tile provider when the theme is dark', () => {
    document.documentElement.dataset['theme'] = 'dark';

    service.initLayers();

    expect(tileLayerMock).toHaveBeenCalledWith(TILE_LAYERS.dark, {
      maxZoom: 18,
      attribution: ATTRIBUTIONS.dark,
      crossOrigin: true,
    });
  });

  it('toggleSatellite swaps the visible layer and back', () => {
    service.initLayers();
    const baseTile = tileLayerMock.mock.results[0].value;
    const satTile = tileLayerMock.mock.results[1].value;

    service.toggleSatellite();
    expect(fakeMap.removeLayer).toHaveBeenCalledWith(baseTile);
    expect(satTile.addTo).toHaveBeenCalledWith(fakeMap);
    expect(service.isSatellite()).toBe(true);

    service.toggleSatellite();
    expect(fakeMap.removeLayer).toHaveBeenCalledWith(satTile);
    expect(baseTile.addTo).toHaveBeenCalledWith(fakeMap);
    expect(service.isSatellite()).toBe(false);
  });

  it('toggleSatellite does nothing without a map', () => {
    engine.getMap.mockReturnValue(null);
    service.toggleSatellite();

    expect(service.isSatellite()).toBe(false);
  });

  it('swaps tile urls when the theme attribute changes', () => {
    service.initLayers();
    const baseTile = tileLayerMock.mock.results[0].value;
    let observerCallback: () => void = () => undefined;
    class FakeObserver {
      constructor(cb: () => void) {
        observerCallback = cb;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('MutationObserver', FakeObserver);

    service.observeThemeChanges();
    document.documentElement.dataset['theme'] = 'dark';
    observerCallback();

    expect(baseTile.setUrl).toHaveBeenCalledWith(TILE_LAYERS.dark);
  });

  it('does not swap urls while satellite view is active', () => {
    service.initLayers();
    const baseTile = tileLayerMock.mock.results[0].value;
    let observerCallback: () => void = () => undefined;
    class FakeObserver {
      constructor(cb: () => void) {
        observerCallback = cb;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('MutationObserver', FakeObserver);
    service.observeThemeChanges();
    service.toggleSatellite();

    observerCallback();

    expect(baseTile.setUrl).not.toHaveBeenCalled();
  });

  it('destroy clears the state and disconnects the observer', () => {
    service.initLayers();
    const disconnect = vi.fn();
    class FakeObserver {
      observe = vi.fn();
      disconnect = disconnect;
    }
    vi.stubGlobal('MutationObserver', FakeObserver);
    service.observeThemeChanges();
    service.toggleSatellite();

    service.destroy();

    expect(disconnect).toHaveBeenCalled();
    expect(service.isSatellite()).toBe(false);
  });
});
