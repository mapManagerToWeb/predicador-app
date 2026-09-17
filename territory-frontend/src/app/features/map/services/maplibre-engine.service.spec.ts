import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@angular/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/common')>();
  return {
    ...actual,
    isPlatformBrowser: () => true,
  };
});

const fakeMapInstance = {
  addSource: vi.fn(),
  removeSource: vi.fn(),
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
  setPaintProperty: vi.fn(),
  setLayoutProperty: vi.fn(),
  queryRenderedFeatures: vi.fn().mockReturnValue([]),
  on: vi.fn(),
  off: vi.fn(),
  fitBounds: vi.fn(),
  getZoom: vi.fn().mockReturnValue(14),
  setZoom: vi.fn(),
  getCenter: vi.fn().mockReturnValue({ lng: -73.345, lat: -37.4779 }),
  setCenter: vi.fn(),
  resize: vi.fn(),
  remove: vi.fn(),
  setFeatureState: vi.fn(),
  removeFeatureState: vi.fn(),
};

vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn().mockImplementation(function () {
      return fakeMapInstance;
    }),
  },
  Map: vi.fn().mockImplementation(function () {
    return fakeMapInstance;
  }),
}));

// Must import AFTER mocks are set up
const { MaplibreEngineService } = await import('./maplibre-engine.service');

describe('MaplibreEngineService', () => {
  let service: MaplibreEngineService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MaplibreEngineService();
  });

  it('starts without a map', () => {
    expect(service.getZoom()).toBe(0);
    expect(service.getCenter()).toEqual({ lng: 0, lat: 0 });
  });

  it('creates a MapLibre map on init', async () => {
    const container = document.createElement('div');

    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    expect(fakeMapInstance.addSource).toHaveBeenCalled();
    expect(fakeMapInstance.addLayer).toHaveBeenCalled();
  });

  it('delegates addSource to the underlying map', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    service.addSource('test-source', '/tiles/{z}/{x}/{y}.pbf');

    expect(fakeMapInstance.addSource).toHaveBeenCalledWith('test-source', {
      type: 'vector',
      tiles: ['/tiles/{z}/{x}/{y}.pbf'],
      minzoom: 0,
      maxzoom: 19,
      scheme: 'xyz',
    });
  });

  it('delegates removeSource to the underlying map', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    service.removeSource('test-source');

    expect(fakeMapInstance.removeSource).toHaveBeenCalledWith('test-source');
  });

  it('delegates addLayer to the underlying map', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    service.addLayer({
      id: 'test-layer',
      type: 'fill',
      source: 'test-source',
      'source-layer': 'manzana',
    });

    expect(fakeMapInstance.addLayer).toHaveBeenCalled();
  });

  it('delegates removeLayer to the underlying map', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    service.removeLayer('test-layer');

    expect(fakeMapInstance.removeLayer).toHaveBeenCalledWith('test-layer');
  });

  it('delegates setPaintProperty to the underlying map', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    service.setPaintProperty('layer', 'fill-opacity', 0.5);

    expect(fakeMapInstance.setPaintProperty).toHaveBeenCalledWith(
      'layer',
      'fill-opacity',
      0.5,
    );
  });

  it('delegates queryRenderedFeatures to the underlying map', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    fakeMapInstance.queryRenderedFeatures.mockReturnValue([{ id: 1 }]);

    const result = service.queryRenderedFeatures([100, 200], {
      layers: ['manzana'],
    });

    expect(fakeMapInstance.queryRenderedFeatures).toHaveBeenCalledWith(
      [100, 200],
      { layers: ['manzana'] },
    );
    expect(result).toEqual([{ id: 1 }]);
  });

  it('returns empty array from queryRenderedFeatures when map is null', () => {
    const result = service.queryRenderedFeatures([100, 200]);
    expect(result).toEqual([]);
  });

  it('delegates on/off to the underlying map', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    const handler = vi.fn();
    service.on('click', handler);
    expect(fakeMapInstance.on).toHaveBeenCalled();

    service.off('click', handler);
    expect(fakeMapInstance.off).toHaveBeenCalled();
  });

  it('delegates getZoom to the underlying map', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    expect(service.getZoom()).toBe(14);
  });

  it('delegates setCenter to the underlying map', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    service.setCenter([-73.0, -37.0]);

    expect(fakeMapInstance.setCenter).toHaveBeenCalledWith([-73.0, -37.0]);
  });

  it('delegates setFeatureState to the underlying map', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    service.setFeatureState('src', 'layer', 42, { active: true });

    expect(fakeMapInstance.setFeatureState).toHaveBeenCalledWith(
      { source: 'src', sourceLayer: 'layer', id: 42 },
      { active: true },
    );
  });

  it('delegates removeFeatureState to the underlying map', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    service.removeFeatureState('src', 'layer', 42);

    expect(fakeMapInstance.removeFeatureState).toHaveBeenCalledWith({
      source: 'src',
      sourceLayer: 'layer',
      id: 42,
    });
  });

  it('destroy calls map.remove()', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    service.destroy();

    expect(fakeMapInstance.remove).toHaveBeenCalled();
  });

  it('destroy is safe when no map exists', () => {
    expect(() => service.destroy()).not.toThrow();
  });
});
