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
}
