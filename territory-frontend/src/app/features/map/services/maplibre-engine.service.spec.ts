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
  getSource: vi.fn().mockReturnValue(undefined),
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
  easeTo: vi.fn(),
  resize: vi.fn(),
  remove: vi.fn(),
  setFeatureState: vi.fn(),
  removeFeatureState: vi.fn(),
  project: vi.fn().mockReturnValue({ x: 100, y: 200 }),
  isStyleLoaded: vi.fn().mockReturnValue(true),
  getCanvas: vi.fn(),
  getLayer: vi.fn().mockReturnValue(undefined),
  getStyle: vi.fn().mockReturnValue({
    version: 8,
    sources: {},
    layers: [{ id: 'territory-fill' }],
  }),
  once: vi.fn(),
  triggerRepaint: vi.fn(),
};

vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn().mockImplementation(function () {
      return fakeMapInstance;
    }),
    setWorkerUrl: vi.fn(),
  },
  Map: vi.fn().mockImplementation(function () {
    return fakeMapInstance;
  }),
  setWorkerUrl: vi.fn(),
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

  it('registers the vendor worker URL when maplibre-gl loads', async () => {
    const container = document.createElement('div');

    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    // MapLibre v6 worker never loads without setWorkerUrl(); it must point at
    // the vendored worker (`public/maplibre/`), which is served at `/maplibre/`.
    const setWorkerUrl = (await import('maplibre-gl')).setWorkerUrl as ReturnType<
      typeof vi.fn
    >;
    expect(setWorkerUrl).toHaveBeenCalledTimes(1);
    expect(setWorkerUrl).toHaveBeenCalledWith('/maplibre/maplibre-gl-worker.mjs');
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

  it('delegates addGeoJsonSource to the underlying map', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    const geoJson = { type: 'Point' as const, coordinates: [0, 0] };
    service.addGeoJsonSource('my-geojson', geoJson);

    expect(fakeMapInstance.addSource).toHaveBeenCalledWith('my-geojson', {
      type: 'geojson',
      data: geoJson,
    });
  });

  it('updateGeoJsonSourceData calls setData on the source', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    const setDataSpy = vi.fn();
    fakeMapInstance.getSource.mockReturnValue({ setData: setDataSpy });

    const geoJson = { type: 'Point' as const, coordinates: [0, 0] };
    service.updateGeoJsonSourceData('my-geojson', geoJson);

    expect(fakeMapInstance.getSource).toHaveBeenCalledWith('my-geojson');
    expect(setDataSpy).toHaveBeenCalledWith(geoJson);
  });

  it('updateGeoJsonSourceData is a no-op when source does not exist', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    fakeMapInstance.getSource.mockReturnValue(undefined);

    const geoJson = { type: 'Point' as const, coordinates: [0, 0] };
    expect(() => service.updateGeoJsonSourceData('nonexistent', geoJson)).not.toThrow();
  });

  it('setSourceUrl sets the vector tiles template via setTiles', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    const setTilesSpy = vi.fn();
    fakeMapInstance.getSource.mockReturnValue({ setTiles: setTilesSpy });

    service.setSourceUrl('territories', '/api/v1/territories/tiles/{z}/{x}/{y}.pbf?v=7');

    expect(fakeMapInstance.getSource).toHaveBeenCalledWith('territories');
    expect(setTilesSpy).toHaveBeenCalledWith([
      '/api/v1/territories/tiles/{z}/{x}/{y}.pbf?v=7',
    ]);
  });

  it('setSourceUrl does not fall back to setUrl when setTiles is available', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    const setTilesSpy = vi.fn();
    const setUrlSpy = vi.fn();
    fakeMapInstance.getSource.mockReturnValue({ setTiles: setTilesSpy, setUrl: setUrlSpy });

    service.setSourceUrl('territories', '/api/v1/territories/tiles/{z}/{x}/{y}.pbf?v=7');

    expect(setTilesSpy).toHaveBeenCalled();
    expect(setUrlSpy).not.toHaveBeenCalled();
  });

  it('setSourceUrl is a no-op when the source does not exist', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    fakeMapInstance.getSource.mockReturnValue(undefined);

    expect(() =>
      service.setSourceUrl('nonexistent', '/tiles/{z}/{x}/{y}.pbf'),
    ).not.toThrow();
  });

  it('project delegates to map.project and returns pixel coordinates', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    fakeMapInstance.project.mockReturnValue({ x: 250, y: 350 });

    const result = service.project([-73.345, -37.4779]);

    expect(fakeMapInstance.project).toHaveBeenCalledWith([-73.345, -37.4779]);
    expect(result).toEqual({ x: 250, y: 350 });
  });

  it('project returns zero when map is not initialized', () => {
    const result = service.project([-73.345, -37.4779]);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('creates the map with preserveDrawingBuffer so toDataURL returns the rendered frame', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    // MapLibre v6 has no runtime toggle for the drawing buffer — the flag
    // must be set at Map construction or the WhatsApp screenshot comes out
    // blank (bug fix "screenshot WhatsApp").
    const MapCtor = (await import('maplibre-gl')).Map as ReturnType<typeof vi.fn>;
    const options = MapCtor.mock.calls[0][0] as Record<string, unknown>;
    expect(options['canvasContextAttributes']).toEqual({
      preserveDrawingBuffer: true,
      contextType: 'webgl2',
    });
  });

  it('captureCanvas returns JPEG base64 without the data: prefix', async () => {
    const container = document.createElement('div');
    await service.init(container, {
      center: [-73.345, -37.4779],
      zoom: 15,
      tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
    });

    const toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,QUJD');
    fakeMapInstance.getCanvas.mockReturnValue({ toDataURL });

    const result = await service.captureCanvas();

    expect(result).toBe('QUJD');
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
  });

  it('falls back to hiding the basemap, adding the white background at the BOTTOM', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    try {
      const container = document.createElement('div');
      await service.init(container, {
        center: [-73.345, -37.4779],
        zoom: 15,
        tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
      });

      // First toDataURL throws SecurityError (tainted canvas); the fallback
      // hides the basemap, repaints and captures again.
      const toDataURL = vi.fn();
      toDataURL.mockImplementationOnce(() => {
        throw new DOMException('tainted canvas', 'SecurityError');
      });
      toDataURL.mockReturnValue('data:image/jpeg;base64,TEFDRQ==');
      fakeMapInstance.getCanvas.mockReturnValue({ toDataURL });
      fakeMapInstance.getLayer.mockImplementation((id: string) =>
        id === 'basemap-layer' || id === 'territory-fill' ? {} : undefined,
      );
      // Style state mirrors the real app after init: the first layer is the
      // vector territory fill, which must stay VISIBLE above the background.
      fakeMapInstance.getStyle.mockReturnValue({
        version: 8,
        sources: {},
        layers: [{ id: 'territory-fill' }],
      });

      const result = await service.captureCanvas();

      expect(result).toBe('TEFDRQ==');
      expect(fakeMapInstance.removeLayer).toHaveBeenCalledWith('basemap-layer');
      expect(fakeMapInstance.removeLayer).toHaveBeenCalledWith('capture-background');
      // calls[0] is the init-time basemap; calls[1] is the capture swap.
      // REGRESSION ASSERTION: the white background must be inserted BEFORE the
      // first style layer (bottom placement) — without beforeId it lands ON
      // TOP of the vector layers and the JPEG comes out all-white.
      expect(fakeMapInstance.addLayer.mock.calls[1]).toEqual([
        {
          id: 'capture-background',
          type: 'background',
          paint: { 'background-color': '#ffffff' },
        },
        'territory-fill',
      ]);
      // Basemap restored below the territory fills, exactly where it was.
      expect(fakeMapInstance.addLayer.mock.calls[2]).toEqual([
        { id: 'basemap-layer', type: 'raster', source: 'basemap' },
        'territory-fill',
      ]);
      // Waits for the map's `idle` event before reading the canvas, with a
      // rAF + timeout fallback (deterministic frame wait).
      expect(fakeMapInstance.once).toHaveBeenCalledWith(
        'idle',
        expect.any(Function),
      );
      // One repaint for the background swap, one for the restore.
      expect(fakeMapInstance.triggerRepaint).toHaveBeenCalledTimes(2);
      expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('captureCanvas returns null when no map exists', async () => {
    expect(await service.captureCanvas()).toBeNull();
  });

  it('fallback keeps the payload when there is no basemap to hide', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    try {
      const container = document.createElement('div');
      await service.init(container, {
        center: [-73.345, -37.4779],
        zoom: 15,
        tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
      });

      // Canvas is tainted once, then the retry succeeds; there is no
      // basemap layer to swap, so the payload must survive untouched
      // (a prior `return` inside `finally` discarded it).
      const toDataURL = vi.fn();
      toDataURL.mockImplementationOnce(() => {
        throw new DOMException('tainted canvas', 'SecurityError');
      });
      toDataURL.mockReturnValue('data:image/jpeg;base64,TEFDRQ==');
      fakeMapInstance.getCanvas.mockReturnValue({ toDataURL });
      fakeMapInstance.getLayer.mockReturnValue(undefined);

      const result = await service.captureCanvas();

      expect(result).toBe('TEFDRQ==');
      expect(fakeMapInstance.removeLayer).not.toHaveBeenCalled();
      // Only the init-time basemap: the fallback must not swap layers
      // when there is no basemap to hide.
      expect(fakeMapInstance.addLayer).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('re-entrancy: a second concurrent capture reuses the in-flight one (no double layer swap)', async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    try {
      const container = document.createElement('div');
      await service.init(container, {
        center: [-73.345, -37.4779],
        zoom: 15,
        tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
      });

      const toDataURL = vi.fn();
      toDataURL.mockImplementationOnce(() => {
        throw new DOMException('tainted canvas', 'SecurityError');
      });
      toDataURL.mockReturnValue('data:image/jpeg;base64,TEFDRQ==');
      fakeMapInstance.getCanvas.mockReturnValue({ toDataURL });
      fakeMapInstance.getLayer.mockImplementation((id: string) =>
        id === 'basemap-layer' ? {} : undefined,
      );

      const first = service.captureCanvas();
      const second = service.captureCanvas();

      // Same in-flight promise — no interleaved layer mutations.
      expect(second).toBe(first);
      // Only ONE swap happened despite two rapid calls: basemap removed, and
      // the white background added once (still pending on the frame wait).
      expect(fakeMapInstance.removeLayer).toHaveBeenCalledTimes(1);
      expect(fakeMapInstance.removeLayer).toHaveBeenCalledWith('basemap-layer');
      const backgroundAdds = fakeMapInstance.addLayer.mock.calls.filter(
        (call: [{ id?: string }, unknown?]) => call[0]?.id === 'capture-background',
      );
      expect(backgroundAdds).toHaveLength(1);

      // Let the frame wait settle, then both callers get the same payload.
      rafCallbacks.splice(0).forEach(cb => cb(0));
      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult).toBe('TEFDRQ==');
      expect(secondResult).toBe('TEFDRQ==');
      // Restore still happened exactly once for the shared capture.
      expect(fakeMapInstance.removeLayer).toHaveBeenCalledWith('capture-background');
      expect(backgroundAdds).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns null when the JPEG payload is empty or blank after the data: prefix', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const container = document.createElement('div');
      await service.init(container, {
        center: [-73.345, -37.4779],
        zoom: 15,
        tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
      });

      const toDataURL = vi.fn()
        .mockReturnValueOnce('data:image/jpeg;base64,')
        .mockReturnValueOnce('data:image/jpeg;base64,   ')
        .mockReturnValue('data:image/jpeg;base64,QUJD');
      fakeMapInstance.getCanvas.mockReturnValue({ toDataURL });

      expect(await service.captureCanvas()).toBeNull();
      expect(await service.captureCanvas()).toBeNull();
      expect(await service.captureCanvas()).toBe('QUJD');
      // Observability: the empty payload surfaced as a warning, not silence.
      expect(
        warn.mock.calls.some(call =>
          String(call[0]).includes('[map] captura'),
        ),
      ).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('warns when the capture falls back to hiding the basemap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    try {
      const container = document.createElement('div');
      await service.init(container, {
        center: [-73.345, -37.4779],
        zoom: 15,
        tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
      });

      const toDataURL = vi.fn();
      toDataURL.mockImplementationOnce(() => {
        throw new DOMException('tainted canvas', 'SecurityError');
      });
      toDataURL.mockReturnValue('data:image/jpeg;base64,TEFDRQ==');
      fakeMapInstance.getCanvas.mockReturnValue({ toDataURL });
      fakeMapInstance.getLayer.mockImplementation((id: string) =>
        id === 'basemap-layer' ? {} : undefined,
      );

      const result = await service.captureCanvas();

      expect(result).toBe('TEFDRQ==');
      expect(
        warn.mock.calls.some(call =>
          String(call[0]).includes('[map] captura'),
        ),
      ).toBe(true);
    } finally {
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('resolves null (never rejects) when the basemap restore throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    try {
      const container = document.createElement('div');
      await service.init(container, {
        center: [-73.345, -37.4779],
        zoom: 15,
        tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
      });

      // Capture itself fails (every toDataURL attempt throws)…
      const toDataURL = vi.fn(() => {
        throw new DOMException('tainted canvas', 'SecurityError');
      });
      fakeMapInstance.getCanvas.mockReturnValue({ toDataURL });
      fakeMapInstance.getLayer.mockImplementation((id: string) =>
        id === 'basemap-layer' ? {} : undefined,
      );
      // …and the restore re-add throws on top of that.
      fakeMapInstance.addLayer.mockImplementation(
        (layer: { id?: string; type?: string }) => {
          if (layer?.id === 'basemap-layer') {
            throw new Error('restore re-add failed');
          }
        },
      );

      // The promise must RESOLVE null — a throw during restore must not
      // reject it and overturn the null-on-failure contract.
      const result = await service.captureCanvas();
      expect(result).toBeNull();
      expect(
        warn.mock.calls.some(call =>
          String(call[0]).includes('error restaurando el basemap'),
        ),
      ).toBe(true);
    } finally {
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('resolves null and restores the basemap in finally when the swap itself throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    try {
      // Drop the `addLayer` implementation leaked by the previous
      // restore-throws test (vi.clearAllMocks does not remove
      // mockImplementation) so `init` can re-add the basemap layer.
      fakeMapInstance.addLayer.mockReset();
      const container = document.createElement('div');
      await service.init(container, {
        center: [-73.345, -37.4779],
        zoom: 15,
        tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
      });

      // Tainted canvas triggers the basemap-hiding fallback…
      const toDataURL = vi.fn(() => {
        throw new DOMException('tainted canvas', 'SecurityError');
      });
      fakeMapInstance.getCanvas.mockReturnValue({ toDataURL });
      fakeMapInstance.getLayer.mockImplementation((id: string) =>
        id === 'basemap-layer' || id === 'territory-fill' ? {} : undefined,
      );
      // …and the swap itself throws once (the basemap is never removed in
      // this run, but the failure must not reject the capture promise).
      fakeMapInstance.removeLayer.mockImplementationOnce(() => {
        throw new Error('swap failed');
      });

      // The promise must RESOLVE null — a throw during the swap must not
      // reject it and overturn the null-on-failure contract.
      const result = await service.captureCanvas();
      expect(result).toBeNull();

      // The finally restore must still run: the basemap layer is re-added
      // below the territory fills even though the swap never completed.
      // (calls[0] is the init-time basemap without a beforeId; the restore
      // is the call that carries the 'territory-fill' beforeId.)
      expect(fakeMapInstance.addLayer).toHaveBeenCalledWith(
        { id: 'basemap-layer', type: 'raster', source: 'basemap' },
        'territory-fill',
      );
    } finally {
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  describe('delegaciones de cámara y layout', () => {
    async function boot(): Promise<void> {
      await service.init(document.createElement('div'), {
        center: [-73.345, -37.4779],
        zoom: 15,
        tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
      });
    }

    it('delegates setLayoutProperty to the underlying map', async () => {
      await boot();

      service.setLayoutProperty('labels', 'visibility', 'none');

      expect(fakeMapInstance.setLayoutProperty).toHaveBeenCalledWith(
        'labels',
        'visibility',
        'none',
      );
    });

    it('delegates fitBounds with options', async () => {
      await boot();

      const bounds: [number, number, number, number] = [-73.5, -37.6, -73.2, -37.4];
      service.fitBounds(bounds, { padding: 40, duration: 0 });

      expect(fakeMapInstance.fitBounds).toHaveBeenCalledWith(bounds, {
        padding: 40,
        duration: 0,
      });
    });

    it('delegates setZoom to the underlying map', async () => {
      await boot();

      service.setZoom(16);

      expect(fakeMapInstance.setZoom).toHaveBeenCalledWith(16);
    });

    it('delegates easeTo with center and options', async () => {
      await boot();

      service.easeTo([-73.0, -37.0], { duration: 250 });

      expect(fakeMapInstance.easeTo).toHaveBeenCalledWith({
        center: [-73.0, -37.0],
        duration: 250,
      });
    });

    it('delegates resize to the underlying map', async () => {
      await boot();

      service.resize();

      expect(fakeMapInstance.resize).toHaveBeenCalledTimes(1);
    });

    it('camera delegations are safe no-ops without a map', () => {
      expect(() => {
        service.setLayoutProperty('l', 'visibility', 'visible');
        service.fitBounds([0, 0, 1, 1]);
        service.setZoom(10);
        service.easeTo([0, 0]);
        service.resize();
      }).not.toThrow();
    });
  });

  describe('init — defaults y espera de estilo', () => {
    it('falls back to default maxZoom/minZoom/attribution when omitted', async () => {
      const container = document.createElement('div');
      await service.init(container, {
        center: [-73.345, -37.4779],
        zoom: 15,
        tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
      });

      const MapCtor = (await import('maplibre-gl')).Map as ReturnType<typeof vi.fn>;
      const options = MapCtor.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(options['maxZoom']).toBe(18); // MAP_DEFAULTS.maxZoom
      expect(options['minZoom']).toBe(0);

      // attribution omitted -> default OSM attribution on the basemap source.
      expect(fakeMapInstance.addSource).toHaveBeenCalledWith(
        'basemap',
        expect.objectContaining({
          attribution: '© OpenStreetMap contributors',
        }),
      );
    });

    it('uses the provided attribution and zoom bounds', async () => {
      const container = document.createElement('div');
      await service.init(container, {
        center: [-73.345, -37.4779],
        zoom: 15,
        maxZoom: 14,
        minZoom: 3,
        attribution: 'Mi atribución',
        tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
      });

      const MapCtor = (await import('maplibre-gl')).Map as ReturnType<typeof vi.fn>;
      const options = MapCtor.mock.calls.at(-1)![0] as Record<string, unknown>;
      expect(options['maxZoom']).toBe(14);
      expect(options['minZoom']).toBe(3);
      expect(fakeMapInstance.addSource).toHaveBeenCalledWith(
        'basemap',
        expect.objectContaining({ attribution: 'Mi atribución' }),
      );
    });

    it('waits for the load event when the style is not ready yet', async () => {
      // Style not loaded on construction -> init must register the `load`
      // handler instead of resolving immediately (MapLibre v6 throws
      // "Style is not done loading" if sources are added too early).
      fakeMapInstance.isStyleLoaded.mockReturnValueOnce(false);
      let loadHandler: (() => void) | undefined;
      fakeMapInstance.on.mockImplementation((event: string, handler: () => void) => {
        if (event === 'load') loadHandler = handler;
      });

      const container = document.createElement('div');
      const initPromise = service.init(container, {
        center: [-73.345, -37.4779],
        zoom: 15,
        tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
      });

      // init awaits loadMaplibre() before touching the map — wait for the
      // load handler registration instead of asserting synchronously.
      await vi.waitFor(() => expect(loadHandler).toBeTypeOf('function'));
      // Adding sources before the style loads would throw — not yet.
      expect(fakeMapInstance.addSource).not.toHaveBeenCalled();

      loadHandler!();
      await initPromise;

      expect(fakeMapInstance.addSource).toHaveBeenCalledWith(
        'basemap',
        expect.anything(),
      );
      fakeMapInstance.on.mockReset();
      fakeMapInstance.isStyleLoaded.mockReturnValue(true);
    });
  });

  describe('addSource / setSourceUrl — ramas restantes', () => {
    async function boot(): Promise<void> {
      await service.init(document.createElement('div'), {
        center: [-73.345, -37.4779],
        zoom: 15,
        tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
      });
    }

    it('addSource with a tile array registers a raster source', async () => {
      await boot();

      service.addSource('satellite', ['https://a/{z}/{x}/{y}.jpg'], 'Esri');

      expect(fakeMapInstance.addSource).toHaveBeenCalledWith('satellite', {
        type: 'raster',
        tiles: ['https://a/{z}/{x}/{y}.jpg'],
        tileSize: 256,
        attribution: 'Esri',
      });
    });

    it('setSourceUrl falls back to setUrl when setTiles is absent', async () => {
      await boot();

      const setUrlSpy = vi.fn();
      fakeMapInstance.getSource.mockReturnValue({ setUrl: setUrlSpy });

      service.setSourceUrl('imagery', 'https://a/{z}/{x}/{y}.jpg');

      expect(setUrlSpy).toHaveBeenCalledWith('https://a/{z}/{x}/{y}.jpg');
    });

    it('setSourceUrl ignores a source with neither setTiles nor setUrl', async () => {
      await boot();

      fakeMapInstance.getSource.mockReturnValue({});

      expect(() => service.setSourceUrl('other', '/tiles/{z}/{x}/{y}.pbf')).not.toThrow();
    });
  });

  describe('captureCanvas — guarda de re-entrada y vacíos', () => {
    beforeEach(() => {
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    async function boot(): Promise<void> {
      await service.init(document.createElement('div'), {
        center: [-73.345, -37.4779],
        zoom: 15,
        tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
      });
    }

    it('clears the in-flight guard when the capture rejects, so a later capture can run', async () => {
      await boot();

      // Tainted canvas forces the fallback; the fallback's basemap probe
      // (`getLayer` before its try) throws -> the capture promise rejects.
      const toDataURL = vi.fn(() => {
        throw new DOMException('tainted canvas', 'SecurityError');
      });
      fakeMapInstance.getCanvas.mockReturnValue({ toDataURL });
      fakeMapInstance.getLayer.mockImplementationOnce(() => {
        throw new Error('style exploded');
      });

      await expect(service.captureCanvas()).rejects.toThrow('style exploded');

      // Guard cleared by the rejection handler: the next capture starts fresh.
      fakeMapInstance.getLayer.mockImplementation(() => undefined);
      fakeMapInstance.getLayer.mockReset();
      toDataURL.mockReturnValue('data:image/jpeg;base64,QUJD');
      expect(await service.captureCanvas()).toBe('QUJD');
    });

    it('warns and returns null when the fallback capture also yields a blank payload', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await boot();

        // First attempt tainted; fallback returns a blank payload -> the
        // inner empty-payload warning fires and the capture resolves null.
        const toDataURL = vi.fn()
          .mockImplementationOnce(() => {
            throw new DOMException('tainted canvas', 'SecurityError');
          })
          .mockReturnValue('data:image/jpeg;base64,   ');
        fakeMapInstance.getCanvas.mockReturnValue({ toDataURL });
        fakeMapInstance.getLayer.mockReturnValue(undefined);

        expect(await service.captureCanvas()).toBeNull();
        expect(
          warn.mock.calls.filter(call =>
            String(call[0]).includes('payload JPEG vacío')
          ),
        ).toHaveLength(1);
      } finally {
        warn.mockRestore();
      }
    });

    it('adds the white background without a beforeId when the style has no layers', async () => {
      await boot();

      const toDataURL = vi.fn()
        .mockImplementationOnce(() => {
          throw new DOMException('tainted canvas', 'SecurityError');
        })
        .mockReturnValue('data:image/jpeg;base64,TEFDRQ==');
      fakeMapInstance.getCanvas.mockReturnValue({ toDataURL });
      fakeMapInstance.getLayer.mockImplementation((id: string) =>
        id === 'basemap-layer' ? {} : undefined,
      );
      // Empty style: no first layer to insert before -> plain addLayer call.
      fakeMapInstance.getStyle.mockReturnValue({ version: 8, sources: {}, layers: [] });

      const result = await service.captureCanvas();

      expect(result).toBe('TEFDRQ==');
      const backgroundAdds = fakeMapInstance.addLayer.mock.calls.filter(
        (call: [{ id?: string }]) => call[0]?.id === 'capture-background',
      );
      expect(backgroundAdds).toHaveLength(1);
      expect(backgroundAdds[0]).toHaveLength(1); // sin beforeId
      // Restore also runs without a beforeId (no territory-fill either).
      const basemapRestores = fakeMapInstance.addLayer.mock.calls.filter(
        (call: [{ id?: string }]) => call[0]?.id === 'basemap-layer',
      );
      expect(basemapRestores.at(-1)).toHaveLength(1);
    });
  });
});
