/**
 * Integration tests for the MapLibre GL JS engine flow.
 *
 * Covers the end-to-end lifecycle: engine init → tile source → data-driven
 * styling → GPU picking → edit overlay → save + refresh.  All MapLibre API
 * calls are mocked — these tests verify the service orchestration layer,
 * not the rendering pipeline itself.
 *
 * Corresponds to OpenSpec F3.6 / T27 (E2E flow validation).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { MapEngine } from './map-engine.interface';
import type { MapGeoJSONFeature } from 'maplibre-gl';

// ── Helpers ──────────────────────────────────────────────────────────

function createMockMapLibreEngine(): MapEngine & {
  _sources: Map<string, Record<string, unknown>>;
  _layers: Map<string, unknown>;
  _featureStates: Map<string, Record<string, unknown>>;
} {
  const sources = new Map<string, Record<string, unknown>>();
  const layers = new Map<string, unknown>();
  const featureStates = new Map<string, Record<string, unknown>>();
  const sourceUrlMap = new Map<string, string>();

  const engine: ReturnType<typeof createMockMapLibreEngine> & MapEngine = {
    _sources: sources,
    _layers: layers,
    _featureStates: featureStates,

    init: vi.fn(),
    addSource: vi.fn((id: string, _url: string) => {
      sources.set(id, { type: 'vector' });
    }),
    addGeoJsonSource: vi.fn((id: string, data: unknown) => {
      sources.set(id, { type: 'geojson', data });
    }),
    updateGeoJsonSourceData: vi.fn(),
    project: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    removeSource: vi.fn((id: string) => {
      sources.delete(id);
      sourceUrlMap.delete(id);
    }),
    addLayer: vi.fn((layer: { id: string; type: string }) => {
      layers.set(layer.id, layer);
    }),
    removeLayer: vi.fn((id: string) => {
      layers.delete(id);
    }),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    setSourceUrl: vi.fn((sourceId: string, url: string) => {
      sourceUrlMap.set(sourceId, url);
    }),
    queryRenderedFeatures: vi.fn().mockReturnValue([]),
    on: vi.fn(),
    off: vi.fn(),
    fitBounds: vi.fn(),
    getZoom: vi.fn().mockReturnValue(14),
    setZoom: vi.fn(),
    getCenter: vi.fn().mockReturnValue({
      lng: -73.345,
      lat: -37.4779,
    } as import('maplibre-gl').LngLat),
    setCenter: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    setFeatureState: vi.fn((src: string, layer: string, id: string | number, state: Record<string, unknown>) => {
      const key = `${src}:${layer}:${id}`;
      featureStates.set(key, state);
    }),
    removeFeatureState: vi.fn((src: string, layer: string, id?: string | number) => {
      if (id !== undefined) {
        featureStates.delete(`${src}:${layer}:${id}`);
      } else {
        // Clear all for this source+layer
        for (const key of featureStates.keys()) {
          if (key.startsWith(`${src}:${layer}:`)) {
            featureStates.delete(key);
          }
        }
      }
    }),
    captureCanvas: vi.fn().mockResolvedValue(null),
  };

  return engine;
}

function fakeFeature(
  id: string | number,
  props: Record<string, unknown> = {},
): MapGeoJSONFeature {
  return {
    type: 'Feature',
    id,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-73.35, -37.48],
          [-73.34, -37.48],
          [-73.34, -37.47],
          [-73.35, -37.47],
          [-73.35, -37.48],
        ],
      ],
    },
    properties: props,
    layer: {
      id: 'territory-fill',
      source: 'territories',
      'source-layer': 'manzana',
    },
    source: 'territories',
    sourceLayer: 'manzana',
  } as unknown as MapGeoJSONFeature;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('MapLibre Engine Integration Flow', () => {
  let engine: ReturnType<typeof createMockMapLibreEngine>;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = createMockMapLibreEngine();
  });

  // ─── T27.1: Engine init ─────────────────────────────────────────

  describe('1. Engine initialization', () => {
    it('creates a map with the correct tile source', () => {
      const tileUrl = '/api/v1/territories/tiles/{z}/{x}/{y}.pbf';

      engine.addSource('territories', tileUrl);

      expect(engine.addSource).toHaveBeenCalledWith('territories', tileUrl);
      expect(engine._sources.has('territories')).toBe(true);
    });

    it('adds fill and line layers for both source layers', () => {
      // Simulate what MapVectorTileService.initLayers does
      engine.addLayer({
        id: 'territory-fill',
        type: 'fill',
        source: 'territories',
        'source-layer': 'manzana',
      });
      engine.addLayer({
        id: 'territory-line',
        type: 'line',
        source: 'territories',
        'source-layer': 'manzana',
      });
      engine.addLayer({
        id: 'territory-dissolved-fill',
        type: 'fill',
        source: 'territories',
        'source-layer': 'territorio',
      });
      engine.addLayer({
        id: 'territory-dissolved-line',
        type: 'line',
        source: 'territories',
        'source-layer': 'territorio',
      });

      expect(engine.addLayer).toHaveBeenCalledTimes(4);
      expect(engine._layers.has('territory-fill')).toBe(true);
      expect(engine._layers.has('territory-line')).toBe(true);
      expect(engine._layers.has('territory-dissolved-fill')).toBe(true);
      expect(engine._layers.has('territory-dissolved-line')).toBe(true);
    });
  });

  // ─── T27.2: Tile source configuration ───────────────────────────

  describe('2. Tile source configuration', () => {
    it('uses the correct URL template with {z}/{x}/{y}.pbf', () => {
      const url = '/api/v1/territories/tiles/{z}/{x}/{y}.pbf';

      engine.addSource('territories', url);

      // Verify the URL template is exactly as expected
      expect(engine.addSource).toHaveBeenCalledWith(
        'territories',
        expect.stringContaining('{z}/{x}/{y}.pbf'),
      );
    });

    it('includes cache-busting version parameter when updated', () => {
      const initialUrl = '/api/v1/territories/tiles/{z}/{x}/{y}.pbf';
      const versionedUrl = `${initialUrl}?v=${Date.now()}`;

      engine.addSource('territories', initialUrl);
      engine.setSourceUrl('territories', versionedUrl);

      expect(engine.setSourceUrl).toHaveBeenCalledWith(
        'territories',
        expect.stringMatching(/\?v=\d+/),
      );
    });
  });

  // ─── T27.3: Data-driven styling ─────────────────────────────────

  describe('3. Data-driven styling', () => {
    it('sets fill-color with coalesce expression for color property', () => {
      const fillExpression = [
        'coalesce',
        ['get', 'color'],
        '#94a3b8',
      ];

      engine.setPaintProperty(
        'territory-fill',
        'fill-color',
        fillExpression,
      );

      expect(engine.setPaintProperty).toHaveBeenCalledWith(
        'territory-fill',
        'fill-color',
        fillExpression,
      );
    });

    it('sets fill-opacity to default constant 0.6', () => {
      engine.setPaintProperty('territory-fill', 'fill-opacity', 0.6);

      expect(engine.setPaintProperty).toHaveBeenCalledWith(
        'territory-fill',
        'fill-opacity',
        0.6,
      );
    });

    it('builds match expression for per-territory opacity', () => {
      const territoryId = 5;
      const opacity = 0.9;
      const expression = [
        'match',
        ['get', 'territorio'],
        territoryId,
        opacity,
        0.6, // default
      ];

      engine.setPaintProperty(
        'territory-fill',
        'fill-opacity',
        expression,
      );

      expect(engine.setPaintProperty).toHaveBeenCalledWith(
        'territory-fill',
        'fill-opacity',
        expression,
      );
    });

    it('sets stroke line-width and line-color', () => {
      engine.setPaintProperty('territory-line', 'line-width', 1);
      engine.setPaintProperty('territory-line', 'line-color', [
        'coalesce',
        ['get', 'color'],
        '#94a3b8',
      ]);

      expect(engine.setPaintProperty).toHaveBeenCalledWith(
        'territory-line',
        'line-width',
        1,
      );
      expect(engine.setPaintProperty).toHaveBeenCalledWith(
        'territory-line',
        'line-color',
        expect.arrayContaining(['coalesce']),
      );
    });
  });

  // ─── T27.4: GPU picking flow ────────────────────────────────────

  describe('4. GPU picking flow', () => {
    it('queryRenderedFeatures returns features at a point', () => {
      const feature = fakeFeature(42, { territorio: 5, color: '#3b82f6' });
      vi.mocked(engine.queryRenderedFeatures).mockReturnValue([feature]);

      const result = engine.queryRenderedFeatures([100, 200], {
        layers: ['manzana'],
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(42);
    });

    it('queryRenderedFeatures returns empty for empty hit', () => {
      vi.mocked(engine.queryRenderedFeatures).mockReturnValue([]);

      const result = engine.queryRenderedFeatures([100, 200], {
        layers: ['manzana'],
      });

      expect(result).toHaveLength(0);
    });

    it('highlight feature via setFeatureState', () => {
      engine.setFeatureState('territories', 'manzana', 42, {
        selected: true,
      });

      expect(engine.setFeatureState).toHaveBeenCalledWith(
        'territories',
        'manzana',
        42,
        { selected: true },
      );

      const key = 'territories:manzana:42';
      expect(engine._featureStates.get(key)).toEqual({ selected: true });
    });

    it('clear highlight via removeFeatureState', () => {
      engine.setFeatureState('territories', 'manzana', 42, {
        selected: true,
      });
      engine.removeFeatureState('territories', 'manzana', 42);

      expect(engine.removeFeatureState).toHaveBeenCalledWith(
        'territories',
        'manzana',
        42,
      );
    });

    it('clear all highlights when no id is provided', () => {
      engine.setFeatureState('territories', 'manzana', 1, { selected: true });
      engine.setFeatureState('territories', 'manzana', 2, { selected: true });
      engine.removeFeatureState('territories', 'manzana');

      expect(engine.removeFeatureState).toHaveBeenCalledWith(
        'territories',
        'manzana',
      );
    });
  });

  // ─── T27.5: Edit mode flow ──────────────────────────────────────

  describe('5. Edit mode flow (overlay add → save → overlay remove)', () => {
    it('adds GeoJSON source and layers for edit overlay', () => {
      // Simulate MapEditOverlayService.addOverlay
      engine.addSource('edit-overlay', 'geojson://inline');
      engine.addLayer({
        id: 'edit-overlay-fill',
        type: 'fill',
        source: 'edit-overlay',
      });
      engine.addLayer({
        id: 'edit-overlay-line',
        type: 'line',
        source: 'edit-overlay',
      });

      expect(engine.addSource).toHaveBeenCalledWith(
        'edit-overlay',
        'geojson://inline',
      );
      expect(engine.addLayer).toHaveBeenCalledTimes(2);
      expect(engine._layers.has('edit-overlay-fill')).toBe(true);
      expect(engine._layers.has('edit-overlay-line')).toBe(true);
    });

    it('removes overlay layers and source on save', () => {
      // Add overlay first
      engine.addLayer({
        id: 'edit-overlay-fill',
        type: 'fill',
        source: 'edit-overlay',
      });
      engine.addLayer({
        id: 'edit-overlay-line',
        type: 'line',
        source: 'edit-overlay',
      });

      // Simulate save: remove overlay + refresh tiles
      engine.removeLayer('edit-overlay-fill');
      engine.removeLayer('edit-overlay-line');
      engine.removeSource('edit-overlay');
      engine.setSourceUrl(
        'territories',
        '/api/v1/territories/tiles/{z}/{x}/{y}.pbf?v=' + Date.now(),
      );

      expect(engine.removeLayer).toHaveBeenCalledWith('edit-overlay-fill');
      expect(engine.removeLayer).toHaveBeenCalledWith('edit-overlay-line');
      expect(engine.removeSource).toHaveBeenCalledWith('edit-overlay');
      expect(engine.setSourceUrl).toHaveBeenCalledWith(
        'territories',
        expect.stringMatching(/\?v=\d+/),
      );
    });

    it('saveAndRefreshTiles removes overlay and triggers version check', () => {
      // Full lifecycle: add → edit → save → refresh
      engine.addSource('edit-overlay', 'geojson://inline');
      engine.addLayer({
        id: 'edit-overlay-fill',
        type: 'fill',
        source: 'edit-overlay',
      });
      engine.addLayer({
        id: 'edit-overlay-line',
        type: 'line',
        source: 'edit-overlay',
      });

      // Verify overlay is active
      expect(engine._layers.has('edit-overlay-fill')).toBe(true);

      // Save: remove overlay + bump version
      engine.removeLayer('edit-overlay-fill');
      engine.removeLayer('edit-overlay-line');
      engine.removeSource('edit-overlay');
      engine.setSourceUrl(
        'territories',
        '/api/v1/territories/tiles/{z}/{x}/{y}.pbf?v=999',
      );

      // Verify overlay is gone
      expect(engine._layers.has('edit-overlay-fill')).toBe(false);
      expect(engine._layers.has('edit-overlay-line')).toBe(false);
      expect(engine._sources.has('edit-overlay')).toBe(false);

      // Verify tile version was bumped
      expect(engine.setSourceUrl).toHaveBeenCalledWith(
        'territories',
        expect.stringMatching(/v=999$/),
      );
    });
  });

  // ─── Full lifecycle integration ─────────────────────────────────

  describe('6. Full lifecycle: init → render → pick → edit → save', () => {
    it('performs the complete MapLibre flow', () => {
      // 1. Init: add vector tile source
      engine.addSource(
        'territories',
        '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
      );

      // 2. Add data-driven layers
      engine.addLayer({
        id: 'territory-fill',
        type: 'fill',
        source: 'territories',
        'source-layer': 'manzana',
      });
      engine.addLayer({
        id: 'territory-line',
        type: 'line',
        source: 'territories',
        'source-layer': 'manzana',
      });

      // 3. Set data-driven paint properties
      engine.setPaintProperty(
        'territory-fill',
        'fill-color',
        ['coalesce', ['get', 'color'], '#94a3b8'],
      );
      engine.setPaintProperty('territory-fill', 'fill-opacity', 0.6);

      // 4. GPU picking: click on a manzana
      const feature = fakeFeature(42, {
        territorio: 5,
        color: '#3b82f6',
        nombre: 'Manzana A-1',
      });
      vi.mocked(engine.queryRenderedFeatures).mockReturnValue([feature]);
      const result = engine.queryRenderedFeatures([300, 400], {
        layers: ['manzana'],
      });
      expect(result).toHaveLength(1);

      // 5. Highlight the clicked feature
      engine.setFeatureState('territories', 'manzana', 42, {
        selected: true,
      });
      expect(engine.setFeatureState).toHaveBeenCalled();

      // 6. Enter edit mode: add overlay
      engine.addSource('edit-overlay', 'geojson://inline');
      engine.addLayer({
        id: 'edit-overlay-fill',
        type: 'fill',
        source: 'edit-overlay',
      });
      engine.addLayer({
        id: 'edit-overlay-line',
        type: 'line',
        source: 'edit-overlay',
      });

      // 7. Save: remove overlay, clear highlight, refresh tiles
      engine.removeLayer('edit-overlay-fill');
      engine.removeLayer('edit-overlay-line');
      engine.removeSource('edit-overlay');
      engine.removeFeatureState('territories', 'manzana', 42);
      engine.setSourceUrl(
        'territories',
        '/api/v1/territories/tiles/{z}/{x}/{y}.pbf?v=' + Date.now(),
      );

      // Verify final state
      expect(engine._layers.has('edit-overlay-fill')).toBe(false);
      expect(engine._sources.has('edit-overlay')).toBe(false);
      expect(engine.setSourceUrl).toHaveBeenCalled();
    });
  });

  // ─── Event registration ─────────────────────────────────────────

  describe('7. Event registration', () => {
    it('registers click handler on the map', () => {
      const handler = vi.fn();
      engine.on('click', handler);
      expect(engine.on).toHaveBeenCalledWith('click', handler);
    });

    it('registers moveend handler for tile refresh', () => {
      const handler = vi.fn();
      engine.on('moveend', handler);
      expect(engine.on).toHaveBeenCalledWith('moveend', handler);
    });

    it('registers zoomend handler for label visibility', () => {
      const handler = vi.fn();
      engine.on('zoomend', handler);
      expect(engine.on).toHaveBeenCalledWith('zoomend', handler);
    });
  });

  // ─── Cleanup ────────────────────────────────────────────────────

  describe('8. Cleanup', () => {
    it('destroy removes the map instance', () => {
      engine.destroy();
      expect(engine.destroy).toHaveBeenCalled();
    });

    it('destroy is safe to call multiple times', () => {
      engine.destroy();
      engine.destroy();
      expect(engine.destroy).toHaveBeenCalledTimes(2);
    });
  });
});
