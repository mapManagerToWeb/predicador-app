import { Injectable } from '@angular/core';
import type { MapEngine } from './map-engine.interface';
import type { MapGeoJSONFeature, LngLatBoundsLike } from 'maplibre-gl';

/**
 * GPU-accelerated picking service for MapLibre vector tiles.
 *
 * <p>Replaces the CPU-based `ManzanaSpatialIndex` grid with MapLibre's
 * built-in `queryRenderedFeatures` (GPU-accelerated hit testing on the
 * currently rendered tile features).</p>
 *
 * <p>Source/layer names match the tile configuration in
 * {@link MapVectorTileService}: source = `'territories'`,
 * source-layer = `'manzana'` / `'territorio'`.
 * The `layers` filter uses **layer IDs** (not source-layer names).</p>
 */
@Injectable({ providedIn: 'root' })
export class MapPickingService {
  /** Vector tile source id — must match the name used in MapVectorTileService. */
  static readonly SOURCE_ID = 'territories';
  /** Vector tile source-layer — must match the PBX layer name from the backend. */
  static readonly SOURCE_LAYER_MANZANA = 'manzana';

  /**
   * Layer IDs used for `queryRenderedFeatures` `layers` filter.
   * These match the `id` properties passed to `addLayer` in
   * {@link MapVectorTileService}.
   */
  static readonly PICKABLE_LAYER_IDS = [
    'territory-fill',
    'territory-dissolved-fill',
  ];

  /**
   * Query the first rendered feature at the given pixel coordinate.
   *
   * @param point - `[x, y]` pixel position on the map container.
   * @param engine - The active MapEngine (must be a MapLibre instance).
   * @returns The first matching feature, or `null` if nothing was hit.
   */
  queryAt(point: [number, number], engine: MapEngine): MapGeoJSONFeature | null {
    const features = engine.queryRenderedFeatures(point, {
      layers: MapPickingService.PICKABLE_LAYER_IDS,
    });
    return features.length > 0 ? features[0] : null;
  }

  /**
   * Query all rendered features within a bounding box.
   *
   * @param bounds - A `LngLatBoundsLike` defining the query area.
   * @param engine - The active MapEngine.
   * @returns Array of matching features (may be empty).
   */
  queryNear(bounds: LngLatBoundsLike, engine: MapEngine): MapGeoJSONFeature[] {
    return engine.queryRenderedFeatures(bounds, {
      layers: MapPickingService.PICKABLE_LAYER_IDS,
    });
  }

  /**
   * Highlight a feature via GPU feature-state.
   *
   * <p>MapLibre applies the state update directly on the GPU-painted
   * features without any DOM manipulation.</p>
   *
   * @param engine - The active MapEngine.
   * @param id - Feature id (from the `id` property of a MapGeoJSONFeature).
   */
  highlightFeature(engine: MapEngine, id: string | number): void {
    engine.setFeatureState(
      MapPickingService.SOURCE_ID,
      MapPickingService.SOURCE_LAYER_MANZANA,
      id,
      { selected: true },
    );
  }

  /**
   * Remove the highlight (feature-state) from a feature.
   *
   * @param engine - The active MapEngine.
   * @param id - Feature id. If omitted, removes state from ALL features in the layer.
   */
  clearHighlight(engine: MapEngine, id?: string | number): void {
    engine.removeFeatureState(
      MapPickingService.SOURCE_ID,
      MapPickingService.SOURCE_LAYER_MANZANA,
      id,
    );
  }
}
