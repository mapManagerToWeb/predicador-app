import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapSelectedManzanaOverlayService } from './map-selected-manzana-overlay.service';
import type { MapEngine } from './map-engine.interface';
import type * as GeoJSON from 'geojson';

function createMockMapLibreEngine(): MapEngine {
  const sources = new Map<string, Record<string, unknown>>();
  const layers = new Map<string, unknown>();
  return {
    init: vi.fn(),
    addSource: vi.fn(),
    addGeoJsonSource: vi.fn((id: string, data: unknown) => {
      sources.set(id, { type: 'geojson', data });
    }),
    updateGeoJsonSourceData: vi.fn((id: string, data: unknown) => {
      if (sources.has(id)) sources.set(id, { type: 'geojson', data });
    }),
    project: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    removeSource: vi.fn((id: string) => {
      sources.delete(id);
    }),
    addLayer: vi.fn((layer: { id: string }) => {
      layers.set(layer.id, layer);
    }),
    removeLayer: vi.fn((id: string) => {
      layers.delete(id);
    }),
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

const MANZANA: GeoJSON.Feature = {
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  },
  properties: {},
};

describe('MapSelectedManzanaOverlayService', () => {
  let service: MapSelectedManzanaOverlayService;
  let mockEngine: ReturnType<typeof createMockMapLibreEngine>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MapSelectedManzanaOverlayService] });
    service = TestBed.inject(MapSelectedManzanaOverlayService);
    mockEngine = createMockMapLibreEngine();
  });

  it('starts uninitialized', () => {
    expect(service.isInitialized()).toBe(false);
  });

  it('creates the source plus fill and line layers', () => {
    service.initOverlay(mockEngine);

    expect(service.isInitialized()).toBe(true);
    expect(mockEngine.addGeoJsonSource).toHaveBeenCalledWith('selected-manzana', {
      type: 'FeatureCollection',
      features: [],
    });
    expect(mockEngine.addLayer).toHaveBeenCalledTimes(2);
  });

  it('paints the Leaflet selectedManzana style (#facc15, fill 0.15, 4px)', () => {
    service.initOverlay(mockEngine);

    expect(mockEngine.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'selected-manzana-fill',
        source: 'selected-manzana',
        type: 'fill',
        paint: { 'fill-color': '#facc15', 'fill-opacity': 0.15 },
      }),
    );
    expect(mockEngine.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'selected-manzana-line',
        source: 'selected-manzana',
        type: 'line',
        paint: { 'line-color': '#facc15', 'line-width': 4 },
      }),
    );
  });

  it('is idempotent on re-initialization', () => {
    service.initOverlay(mockEngine);
    mockEngine.addLayer.mockClear();

    service.initOverlay(mockEngine);

    expect(mockEngine.addLayer).not.toHaveBeenCalled();
  });

  it('pushes the highlighted feature into the source', () => {
    service.initOverlay(mockEngine);

    service.setSelected(mockEngine, MANZANA);

    expect(mockEngine.updateGeoJsonSourceData).toHaveBeenCalledWith('selected-manzana', {
      type: 'FeatureCollection',
      features: [MANZANA],
    });
  });

  it('clears the highlight when handed null', () => {
    service.initOverlay(mockEngine);

    service.setSelected(mockEngine, null);

    expect(mockEngine.updateGeoJsonSourceData).toHaveBeenCalledWith('selected-manzana', {
      type: 'FeatureCollection',
      features: [],
    });
  });

  it('ignores setSelected before initialization', () => {
    service.setSelected(mockEngine, MANZANA);

    expect(mockEngine.updateGeoJsonSourceData).not.toHaveBeenCalled();
  });

  it('removes layers and source on destroy', () => {
    service.initOverlay(mockEngine);

    service.destroy(mockEngine);

    expect(mockEngine.removeLayer).toHaveBeenCalledWith('selected-manzana-fill');
    expect(mockEngine.removeLayer).toHaveBeenCalledWith('selected-manzana-line');
    expect(mockEngine.removeSource).toHaveBeenCalledWith('selected-manzana');
    expect(service.isInitialized()).toBe(false);
  });
});
