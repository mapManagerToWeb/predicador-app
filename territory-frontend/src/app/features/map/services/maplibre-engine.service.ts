import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type {
  Map as MapLibreMap,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  LngLatBoundsLike,
  FitBoundsOptions,
  LngLat,
  MapGeoJSONFeature,
} from 'maplibre-gl';
import type * as GeoJSON from 'geojson';
import type {
  MapEngine,
  MapEngineOptions,
  LayerSpecification,
} from './map-engine.interface';
import { MAP_DEFAULTS } from '../utils/map-constants';

/**
 * MapLibre GL JS v6 implementation of the {@link MapEngine} abstraction.
 *
 * <p>MapLibre v6 is ESM-only and accesses `window`/`document`, so every
 * browser API call is guarded with the platform check and the map is
 * created inside `afterNextRender` by the caller.</p>
 *
 * <p>Can be instantiated via Angular DI (root-provided) or directly via the
 * engine factory — the `platformId` is resolved accordingly.</p>
 */
@Injectable({ providedIn: 'root' })
export class MaplibreEngineService implements MapEngine {
  /**
   * MapLibre v6 runs vector-tile parsing in a dedicated worker module
   * (`maplibre-gl-worker.mjs`) that imports its sibling `maplibre-gl-shared.mjs`
   * by relative path. The files are vendored into `public/maplibre/` (see
   * the README there): the dev server serves `public/` at the root and the
   * production builder copies it into the browser output, so both files always
   * land next to each other. Without setWorkerUrl() the worker silently never
   * loads and vector tile sources stay empty.
   */
  private static readonly WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

  private readonly platformId: object;
  private map: MapLibreMap | null = null;

  /** In-flight capture, shared with concurrent callers (re-entrancy guard). */
  private capturing: Promise<string | null> | null = null;

  private maplibregl: typeof import('maplibre-gl') | null = null;

  constructor() {
    // When used via DI, inject() works. When instantiated directly from the
    // factory, we fall back to a plain object check.
    try {
      this.platformId = inject(PLATFORM_ID, { optional: true }) ?? {};
    } catch {
      this.platformId = {};
    }
  }

  /**
   * Dynamically import maplibre-gl (browser-only).
   */
  private async loadMaplibre(): Promise<typeof import('maplibre-gl')> {
    if (!this.maplibregl) {
      this.maplibregl = await import('maplibre-gl');
      if (typeof this.maplibregl.setWorkerUrl === 'function') {
        this.maplibregl.setWorkerUrl(MaplibreEngineService.WORKER_URL);
      }
    }
    return this.maplibregl;
  }

  async init(container: HTMLElement, options: MapEngineOptions): Promise<void> {
    // When instantiated via `new` (not DI), platformId is {} and
    // isPlatformBrowser({}) returns false. Fall back to window check.
    if (!isPlatformBrowser(this.platformId) && typeof window === 'undefined') return;

    const maplibregl = await this.loadMaplibre();

    this.map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {},
        layers: [],
      },
      center: options.center,
      zoom: options.zoom,
      maxZoom: options.maxZoom ?? MAP_DEFAULTS.maxZoom,
      minZoom: options.minZoom ?? 0,
      fadeDuration: 0,
      // Keep the WebGL drawing buffer across frames so getCanvas().toDataURL()
      // returns the rendered map (without this the buffer is cleared after
      // each composited frame and the screenshot comes out blank/black).
      // MapLibre v6 has no runtime toggle — this flag must be set at Map
      // construction; the cost is a retained backbuffer, which is negligible
      // for the map's single canvas (bug fix "screenshot WhatsApp").
      canvasContextAttributes: {
        preserveDrawingBuffer: true,
        contextType: 'webgl2',
      },
    });

    // Wait for the style to finish loading before adding sources/layers.
    // MapLibre v6 throws "Style is not done loading" if addSource is
    // called before the style is ready.
    await new Promise<void>(resolve => {
      if (this.map!.isStyleLoaded()) {
        resolve();
      } else {
        this.map!.on('load', () => resolve());
      }
    });

    // Add a lightweight raster basemap below the vector territory layers
    this.map.addSource('basemap', {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: options.attribution ?? '© OpenStreetMap contributors',
    });

    this.map.addLayer({
      id: 'basemap-layer',
      type: 'raster',
      source: 'basemap',
    });
  }

  addGeoJsonSource(id: string, data: GeoJSON.GeoJSON): void {
    this.map?.addSource(id, { type: 'geojson', data });
  }

  updateGeoJsonSourceData(id: string, data: GeoJSON.GeoJSON): void {
    // MapLibre's GeoJSONSource has setData but it's not in the union type directly
    const source = this.map?.getSource(id);
    if (source && 'setData' in source && typeof source.setData === 'function') {
      source.setData(data);
    }
  }

  project(lngLat: [number, number]): { x: number; y: number } {
    if (!this.map) return { x: 0, y: 0 };
    const point = this.map.project(lngLat);
    return { x: point.x, y: point.y };
  }

  addSource(id: string, urlOrTiles: string | string[], attribution?: string): void {
    if (Array.isArray(urlOrTiles)) {
      this.map?.addSource(id, {
        type: 'raster',
        tiles: urlOrTiles,
        tileSize: 256,
        attribution,
      });
    } else {
      this.map?.addSource(id, {
        type: 'vector',
        tiles: [urlOrTiles],
        minzoom: 0,
        maxzoom: 19,
        scheme: 'xyz',
      });
    }
  }

  removeSource(id: string): void {
    this.map?.removeSource(id);
  }

  setSourceUrl(sourceId: string, url: string): void {
    const source = this.map?.getSource(sourceId);
    if (!source) return;
    // `url` is a tile URL template (e.g. `/tiles/{z}/{x}/{y}.pbf?v=1`), not a
    // TileJSON endpoint. VectorTileSource.setTiles/GeoJSONSource.setUrl accept
    // the template directly; MapLibre v6 has no Map.setSourceProperty.
    if ('setTiles' in source && typeof source.setTiles === 'function') {
      source.setTiles([url]);
    } else if ('setUrl' in source && typeof source.setUrl === 'function') {
      source.setUrl(url);
    }
  }

  addLayer(layer: LayerSpecification, beforeId?: string): void {
    this.map?.addLayer(
      layer as Parameters<MapLibreMap['addLayer']>[0],
      beforeId,
    );
  }

  removeLayer(id: string): void {
    this.map?.removeLayer(id);
  }

  setPaintProperty(layer: string, property: string, value: unknown): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.map?.setPaintProperty(layer, property as any, value);
  }

  setLayoutProperty(layer: string, property: string, value: unknown): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.map?.setLayoutProperty(layer, property as any, value);
  }

  queryRenderedFeatures(
    pointOrBounds: [number, number] | LngLatBoundsLike,
    options?: { layers?: string[] },
  ): MapGeoJSONFeature[] {
    if (!this.map) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.map as any).queryRenderedFeatures(pointOrBounds, options);
  }

  on(
    event: string,
    handler: (e: MapLayerMouseEvent | MapLayerTouchEvent) => void,
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.map?.on(event as any, handler as any);
  }

  off(
    event: string,
    handler: (e: MapLayerMouseEvent | MapLayerTouchEvent) => void,
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.map?.off(event as any, handler as any);
  }

  fitBounds(bounds: LngLatBoundsLike, options?: FitBoundsOptions): void {
    this.map?.fitBounds(bounds, options);
  }

  getZoom(): number {
    return this.map?.getZoom() ?? 0;
  }

  setZoom(zoom: number): void {
    this.map?.setZoom(zoom);
  }

  getCenter(): LngLat {
    return this.map?.getCenter() ?? ({ lng: 0, lat: 0 } as LngLat);
  }

  setCenter(center: [number, number]): void {
    this.map?.setCenter(center);
  }

  /**
   * Animated camera move to `center`.
   *
   * <p>MapLibre fires the `*start` camera events synchronously inside this
   * call (`_prepareEase`), so callers may guard re-entrant pause handlers with
   * a flag toggled around the call. No `essential` option is passed: when the
   * user prefers reduced motion MapLibre collapses the duration to 0
   * (instant jump), which is the accessible behavior.</p>
   */
  easeTo(center: [number, number], options?: { duration?: number }): void {
    this.map?.easeTo({ center, ...options });
  }

  resize(): void {
    this.map?.resize();
  }

  destroy(): void {
    this.map?.remove();
    this.map = null;
  }

  setFeatureState(
    source: string,
    sourceLayer: string,
    id: string | number,
    state: Record<string, unknown>,
  ): void {
    this.map?.setFeatureState({ source, sourceLayer, id }, state);
  }

  removeFeatureState(
    source: string,
    sourceLayer: string,
    id?: string | number,
  ): void {
    this.map?.removeFeatureState({ source, sourceLayer, id });
  }

  /**
   * Renders the current visible map state to a JPEG base64 string (without
   * the `data:` prefix), or null when capture fails.
   *
   * <p>Basemap tile providers are third-party and may not send CORS headers,
   * which would taint the WebGL canvas and make `toDataURL` throw a
   * SecurityError. Today the shipped OSM basemap serves
   * `Access-Control-Allow-Origin: *` and MapLibre v6 loads it via fetch, so
   * the direct path does not taint — the fallback exists defensively for any
   * basemap provider lacking CORS headers: it hides the basemap for the
   * captured frame, repaints over a plain white background, and restores it
   * afterwards (bug fix "screenshot WhatsApp").</p>
   */
  captureCanvas(): Promise<string | null> {
    if (!this.map) return Promise.resolve(null);
    // Re-entrancy guard: a concurrent capture shares the in-flight promise
    // instead of interleaving remove/add layer mutations on the map.
    if (this.capturing) return this.capturing;
    const capture = this.performCapture();
    // Clear the guard from a reaction one level BELOW the promise callers
    // await: the clear then always runs before the next sequential call can
    // resume (Zone.js-patched microtasks in the test environment do not
    // preserve registration order of reactions on the same promise).
    const shared = capture.then(
      result => {
        this.capturing = null;
        return result;
      },
      error => {
        this.capturing = null;
        throw error;
      },
    );
    this.capturing = shared;
    return shared;
  }

  /** Direct `toDataURL` capture; falls back to hiding the basemap on taint. */
  private async performCapture(): Promise<string | null> {
    try {
      const payload = extractJpegBase64(
        this.map!.getCanvas().toDataURL('image/jpeg', 0.85),
      );
      if (payload === null) {
        console.warn('[map] captura: el canvas devolvió un payload JPEG vacío');
      }
      return payload;
    } catch {
      // Canvas tainted (or toDataURL failed) → capture without the basemap.
      return this.captureSinBasemap();
    }
  }

  /**
   * Captures the map without the raster basemap: the basemap layer is swapped
   * for a plain white background (our MVT tiles are same-origin, so the
   * canvas stays untainted), the map repaints, and the basemap is restored
   * afterwards. Defensive fallback when the direct capture fails — not a
   * statement about the shipped OSM tiles' CORS behavior.
   */
  private async captureSinBasemap(): Promise<string | null> {
    const map = this.map;
    if (!map) return null;
    console.warn(
      '[map] captura: toDataURL falló (canvas posiblemente teñido por tiles ' +
        'cross-origin sin CORS); capturando sin basemap',
    );

    const hadBasemap = map.getLayer('basemap-layer') !== undefined;

    try {
      if (hadBasemap) {
        map.removeLayer('basemap-layer');
        const backgroundLayer = {
          id: 'capture-background',
          type: 'background' as const,
          paint: { 'background-color': '#ffffff' },
        };
        // Place the white background at the BOTTOM of the style so every vector
        // layer (territory fills, marks, labels) stays visible above it.
        // addLayer(layer, beforeId) inserts before `beforeId`, so passing the
        // current first layer id puts the background under everything; without
        // a beforeId the background would land ON TOP and the captured JPEG
        // would come out all-white (empirically verified on MapLibre 6.10.0).
        const firstLayerId = map.getStyle()?.layers?.[0]?.id;
        if (firstLayerId) {
          map.addLayer(backgroundLayer, firstLayerId);
        } else {
          map.addLayer(backgroundLayer);
        }
      }

      // One settled frame so the canvas reflects the layer swap. Prefer the
      // map's own `idle` event (fires once the post-repaint frame is done);
      // a rAF + timeout race covers the hidden-tab case where rAF is
      // throttled and `idle` never fires, so a deferred rAF cannot read the
      // pre-swap buffer and hang the capture.
      const idle = new Promise<void>(resolve =>
        map.once('idle', () => resolve()),
      );
      map.triggerRepaint();
      await Promise.race([idle, nextAnimationFrameWithTimeout()]);
      const payload = extractJpegBase64(
        map.getCanvas().toDataURL('image/jpeg', 0.85),
      );
      if (payload === null) {
        console.warn('[map] captura: el canvas devolvió un payload JPEG vacío');
      }
      return payload;
    } catch (error) {
      console.warn('[map] captura: falló la captura sin basemap', error);
      return null;
    } finally {
      if (hadBasemap) {
        try {
          map.removeLayer('capture-background');
          // Restore the basemap below the territory fills when they exist
          // (the idempotent beforeId path was used by toggleSatellite).
          const territoryFill = map.getLayer('territory-fill');
          const basemapLayer = {
            id: 'basemap-layer',
            type: 'raster' as const,
            source: 'basemap',
          };
          if (territoryFill) {
            map.addLayer(basemapLayer, 'territory-fill');
          } else {
            map.addLayer(basemapLayer);
          }
          map.triggerRepaint();
        } catch (restoreError) {
          // A restore failure must not reject the capture promise (null-on-
          // failure contract) nor leave the map silently broken.
          console.warn(
            '[map] captura: error restaurando el basemap',
            restoreError,
          );
        }
      }
    }
  }
}

/**
 * Splits the `data:image/jpeg;base64,...` prefix from a canvas data URL,
 * returning the bare base64 payload (the shape the WhatsApp API expects), or
 * null when there is no comma separator or the payload is empty/blank.
 */
function extractJpegBase64(dataUrl: string): string | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const payload = dataUrl.slice(comma + 1);
  return payload.trim().length === 0 ? null : payload;
}

/** Resolves after the next browser animation frame (render flush helper). */
function nextAnimationFrame(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * Waits for the next animation frame, or after a bounded delay when rAF is
 * throttled (hidden tab). Keeps the capture deterministic instead of letting
 * a deferred rAF read the pre-swap canvas buffer.
 */
function nextAnimationFrameWithTimeout(timeoutMs = 100): Promise<void> {
  return Promise.race([
    nextAnimationFrame(),
    new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
  ]);
}
