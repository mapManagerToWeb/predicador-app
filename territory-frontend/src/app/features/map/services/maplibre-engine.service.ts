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
    }
    return this.maplibregl;
  }

  async init(container: HTMLElement, options: MapEngineOptions): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const maplibregl = await this.loadMaplibre();

    const tileUrl = options.tileUrl;

    this.map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          territories: {
            type: 'vector',
            tiles: [tileUrl],
            minzoom: 0,
            maxzoom: 19,
            scheme: 'xyz',
          },
        },
        layers: [],
      },
      center: options.center,
      zoom: options.zoom,
      maxZoom: options.maxZoom ?? MAP_DEFAULTS.maxZoom,
      minZoom: options.minZoom ?? 0,
      fadeDuration: 0,
    });

    // Add a lightweight raster basemap below the vector territory layers
    this.map.addSource('basemap', {
      type: 'raster',
      tiles: ['https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: options.attribution ?? '© OpenStreetMap contributors',
    });

    this.map.addLayer({
      id: 'basemap-layer',
      type: 'raster',
      source: 'basemap',
    });
  }

  addSource(id: string, url: string): void {
    this.map?.addSource(id, {
      type: 'vector',
      tiles: [url],
      minzoom: 0,
      maxzoom: 19,
      scheme: 'xyz',
    });
  }

  removeSource(id: string): void {
    this.map?.removeSource(id);
  }

  setSourceUrl(sourceId: string, url: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const source = (this.map as any)?.getSource?.(sourceId);
    if (source && typeof source.setUrl === 'function') {
      source.setUrl(url);
    }
  }

  addLayer(layer: LayerSpecification): void {
    this.map?.addLayer(layer as Parameters<MapLibreMap['addLayer']>[0]);
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
