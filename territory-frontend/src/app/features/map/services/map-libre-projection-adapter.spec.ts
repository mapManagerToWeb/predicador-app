import { describe, it, expect, vi } from 'vitest';
import { createMapLibreProjectionAdapter } from './map-libre-projection-adapter';
import type { MapEngine } from './map-engine.interface';

function createMockEngineWithProject(
  projectFn: (lngLat: [number, number]) => { x: number; y: number },
): MapEngine {
  return {
    init: vi.fn(),
    addSource: vi.fn(),
    addGeoJsonSource: vi.fn(),
    updateGeoJsonSourceData: vi.fn(),
    project: projectFn,
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

function createMockEngineWithoutProject(): MapEngine {
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

describe('MapLibreProjectionAdapter', () => {
  it('should project lat/lng to pixel coordinates using MapLibre project', () => {
    const projectFn = vi.fn().mockReturnValue({ x: 100, y: 200 });
    const engine = createMockEngineWithProject(projectFn);

    const adapter = createMapLibreProjectionAdapter(engine);
    const point = adapter.latLngToContainerPoint({ lat: -33.8688, lng: 151.2093 });

    expect(projectFn).toHaveBeenCalledWith([151.2093, -33.8688]);
    expect(point.x).toBe(100);
    expect(point.y).toBe(200);
  });

  it('should use approximate projection when map.project is not available', () => {
    const engine = createMockEngineWithoutProject();

    const adapter = createMapLibreProjectionAdapter(engine);
    const point = adapter.latLngToContainerPoint({ lat: 0, lng: 0 });

    expect(point).toHaveProperty('x');
    expect(point).toHaveProperty('y');
    expect(typeof point.x).toBe('number');
    expect(typeof point.y).toBe('number');
  });

  it('should produce consistent results for the same input', () => {
    const projectFn = vi.fn().mockReturnValue({ x: 100, y: 200 });
    const engine = createMockEngineWithProject(projectFn);

    const adapter = createMapLibreProjectionAdapter(engine);
    const p1 = adapter.latLngToContainerPoint({ lat: -33.8688, lng: 151.2093 });
    const p2 = adapter.latLngToContainerPoint({ lat: -33.8688, lng: 151.2093 });

    expect(p1.x).toBe(p2.x);
    expect(p1.y).toBe(p2.y);
  });

  it('should return different points for different coordinates', () => {
    const projectFn = vi.fn()
      .mockReturnValueOnce({ x: 100, y: 200 })
      .mockReturnValueOnce({ x: 300, y: 400 });
    const engine = createMockEngineWithProject(projectFn);

    const adapter = createMapLibreProjectionAdapter(engine);
    const p1 = adapter.latLngToContainerPoint({ lat: -33.8688, lng: 151.2093 });
    const p2 = adapter.latLngToContainerPoint({ lat: -33.8689, lng: 151.2094 });

    expect(p1.x).not.toBe(p2.x);
    expect(p1.y).not.toBe(p2.y);
  });
});
