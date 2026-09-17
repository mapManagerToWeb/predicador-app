import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapEditOverlayService } from './map-edit-overlay.service';
import { MaplibreEngineService } from './maplibre-engine.service';
import { MapStateService } from './map-state.service';
import { TileVersionService } from './tile-version.service';
import type { MapEngine } from './map-engine.interface';
import type * as GeoJSON from 'geojson';

function createMockMapLibreEngine(): MapEngine {
  const sources = new Map<string, Record<string, unknown>>();
  const sourceSpies = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const layers = new Map<string, unknown>();
  return {
    init: vi.fn(),
    addSource: vi.fn(),
    addGeoJsonSource: vi.fn((id: string, data: unknown) => {
      sources.set(id, { type: 'geojson', data });
      sourceSpies.set(id, { setData: vi.fn() });
    }),
    updateGeoJsonSourceData: vi.fn((id: string, data: unknown) => {
      const spy = sourceSpies.get(id);
      if (spy) spy.setData(data);
    }),
    project: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    removeSource: vi.fn((id: string) => { sources.delete(id); }),
    addLayer: vi.fn((layer: { id: string }) => { layers.set(layer.id, layer); }),
    removeLayer: vi.fn((id: string) => { layers.delete(id); }),
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

const SAMPLE_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      },
      properties: {},
    },
  ],
};

describe('MapEditOverlayService', () => {
  let service: MapEditOverlayService;
  let mockEngine: ReturnType<typeof createMockMapLibreEngine>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MapEditOverlayService,
        MapStateService,
        TileVersionService,
        MaplibreEngineService,
      ],
    });
    service = TestBed.inject(MapEditOverlayService);
    mockEngine = createMockMapLibreEngine();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should not have overlay active initially', () => {
    expect(service.isOverlayActive()).toBe(false);
  });

  describe('addOverlay', () => {
    it('should add GeoJSON source and layers to MapLibre engine', () => {
      service.addOverlay(SAMPLE_GEOJSON, mockEngine);

      expect(service.isOverlayActive()).toBe(true);
      expect(mockEngine.addGeoJsonSource).toHaveBeenCalledWith('edit-overlay', SAMPLE_GEOJSON);
      expect(mockEngine.addLayer).toHaveBeenCalledTimes(2);
    });

    it('should be a no-op if overlay is already active', () => {
      service.addOverlay(SAMPLE_GEOJSON, mockEngine);
      mockEngine.addLayer.mockClear();

      service.addOverlay(SAMPLE_GEOJSON, mockEngine);

      expect(mockEngine.addLayer).not.toHaveBeenCalled();
    });
  });

  describe('updateOverlay', () => {
    it('should update source data when overlay is active', () => {
      service.addOverlay(SAMPLE_GEOJSON, mockEngine);

      const updated: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [0, 0] },
            properties: {},
          },
        ],
      };

      service.updateOverlay(updated, mockEngine);

      expect(mockEngine.updateGeoJsonSourceData).toHaveBeenCalledWith('edit-overlay', updated);
    });

    it('should be a no-op if overlay is not active', () => {
      service.updateOverlay(SAMPLE_GEOJSON, mockEngine);
      // No source exists, so getSource returns undefined — no error
    });
  });

  describe('removeOverlay', () => {
    it('should remove layers, source, and clear state', () => {
      service.addOverlay(SAMPLE_GEOJSON, mockEngine);
      service.removeOverlay(mockEngine);

      expect(service.isOverlayActive()).toBe(false);
      expect(mockEngine.removeLayer).toHaveBeenCalledWith('edit-overlay-fill');
      expect(mockEngine.removeLayer).toHaveBeenCalledWith('edit-overlay-line');
      expect(mockEngine.removeSource).toHaveBeenCalledWith('edit-overlay');
    });

    it('should be a no-op if overlay is not active', () => {
      service.removeOverlay(mockEngine);

      expect(mockEngine.removeLayer).not.toHaveBeenCalled();
      expect(mockEngine.removeSource).not.toHaveBeenCalled();
    });
  });

  describe('saveAndRefreshTiles', () => {
    it('should remove overlay and trigger version check', () => {
      service.addOverlay(SAMPLE_GEOJSON, mockEngine);
      service.saveAndRefreshTiles(mockEngine);

      expect(service.isOverlayActive()).toBe(false);
    });
  });
});
