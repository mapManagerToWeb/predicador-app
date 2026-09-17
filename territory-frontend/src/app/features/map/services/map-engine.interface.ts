import type {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  LngLatBoundsLike,
  FitBoundsOptions,
  LngLat,
  MapGeoJSONFeature,
} from 'maplibre-gl';

/**
 * Engine-agnostic map abstraction.
 *
 * <p>Both the existing Leaflet engine and the new MapLibre engine implement
 * this interface so that MapPage and downstream services remain decoupled
 * from any concrete map library.</p>
 */
export interface MapEngine {
  init(container: HTMLElement, options: MapEngineOptions): void;
  addSource(id: string, url: string): void;
  removeSource(id: string): void;
  addLayer(layer: LayerSpecification): void;
  removeLayer(id: string): void;
  setPaintProperty(layer: string, property: string, value: unknown): void;
  setLayoutProperty(layer: string, property: string, value: unknown): void;
  queryRenderedFeatures(
    point: [number, number],
    options?: { layers?: string[] },
  ): MapGeoJSONFeature[];
  queryRenderedFeatures(
    bounds: LngLatBoundsLike,
    options?: { layers?: string[] },
  ): MapGeoJSONFeature[];
  on(
    event: string,
    handler: (e: MapLayerMouseEvent | MapLayerTouchEvent) => void,
  ): void;
  off(
    event: string,
    handler: (e: MapLayerMouseEvent | MapLayerTouchEvent) => void,
  ): void;
  fitBounds(bounds: LngLatBoundsLike, options?: FitBoundsOptions): void;
  getZoom(): number;
  setZoom(zoom: number): void;
  getCenter(): LngLat;
  setCenter(center: [number, number]): void;
  resize(): void;
  destroy(): void;

  // Source management for version-aware refresh
  setSourceUrl(sourceId: string, url: string): void;

  // Feature state for GPU highlighting
  setFeatureState(
    source: string,
    sourceLayer: string,
    id: string | number,
    state: Record<string, unknown>,
  ): void;
  removeFeatureState(
    source: string,
    sourceLayer: string,
    id?: string | number,
  ): void;
}

export interface MapEngineOptions {
  center: [number, number]; // [lng, lat]
  zoom: number;
  maxZoom?: number;
  minZoom?: number;
  tileUrl: string; // e.g. '/api/v1/territories/tiles/{z}/{x}/{y}.pbf'
  attribution?: string;
}

export type LayerSpecification = {
  id: string;
  type: 'fill' | 'line' | 'symbol' | 'circle' | 'raster';
  source: string;
  'source-layer'?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  filter?: unknown[];
  minzoom?: number;
  maxzoom?: number;
};
