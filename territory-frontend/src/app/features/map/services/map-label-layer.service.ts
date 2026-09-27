import { Injectable, inject } from '@angular/core';
import { MapRenderingFacade } from './map-rendering.facade';
import type { MapEngine, LayerSpecification } from './map-engine.interface';
import { getColorForTerritorio } from '../../../core/models/territory-colors';
import type * as GeoJSON from 'geojson';

/** Unique ID for the GeoJSON label centroids source. */
const LABEL_SOURCE_ID = 'territory-label-centroids';

/** Unique ID for the label symbol layer. */
const LABEL_LAYER_ID = 'territory-labels';

/** Unique ID for the circular badge behind each territory number. */
const BADGE_LAYER_ID = 'territory-label-badge';

/** Labels become visible from this zoom (Leaflet parity: minzoom 14). */
const LABEL_MIN_ZOOM = 14;

/**
 * Manages the territory label layer for MapLibre GL JS.
 *
 * <p>Renders the TERRITORY NUMBER at the territory centroid (the `center`
 * field of the `/territories/metadata` DTOs — ST_PointOnSurface, the same
 * source the deployed Leaflet app used for labels) as a territory-colored
 * number inside a white circular badge. The dissolved
 * tile layer only exists at z &lt; 12 and the manzana layer only at
 * z ≥ 12, so a GeoJSON centroid source is the parity-exact path.</p>
 *
 * <p>Labels are filtered to the active selection: when territories are
 * selected only their numbers show; with no selection all numbers show.
 * Labels are only visible at zoom ≥ 14 to avoid clutter.</p>
 *
 * <p>This service operates exclusively through the {@link MapEngine}
 * abstraction — it never imports maplibre-gl directly.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapLabelLayerService {
  private readonly rendering = inject(MapRenderingFacade);
  private initialized = false;

  /**
   * Initialize the label centroid source and symbol layer.
   *
   * <p>Must be called once after the MapLibre engine is ready AND the
   * GeoJSON metadata has been loaded (the facade derives centroids from
   * it). Subsequent calls are no-ops (idempotent).</p>
   *
   * @param engine  The active MapEngine.
   */
  initLabels(engine: MapEngine): void {
    if (this.initialized) return;

    engine.addGeoJsonSource(LABEL_SOURCE_ID, this.buildCentroidCollection([]));

    // Territory color shared by the badge ring and the number text.
    // `color` is always written per feature in buildCentroidCollection;
    // the coalesce branch only guards a hypothetical missing property.
    const territoryColor = ['coalesce', ['get', 'color'], '#475569'];

    // Circular badge behind the number: white disc with a thin
    // territory-colored ring, added BEFORE the symbol layer so the number
    // paints on top. White background keeps the numbers legible over light
    // territory fills; ring + text keep the territory color identity.
    const badgeLayer: LayerSpecification = {
      id: BADGE_LAYER_ID,
      type: 'circle',
      source: LABEL_SOURCE_ID,
      minzoom: LABEL_MIN_ZOOM,
      paint: {
        'circle-color': '#ffffff',
        'circle-radius': 12,
        'circle-stroke-color': territoryColor,
        'circle-stroke-width': 1.5,
      },
    };

    const labelLayer: LayerSpecification = {
      id: LABEL_LAYER_ID,
      type: 'symbol',
      source: LABEL_SOURCE_ID,
      minzoom: LABEL_MIN_ZOOM,
      layout: {
        'text-field': ['to-string', ['get', 'territorio']],
        'text-size': 12,
        'text-anchor': 'center',
        'symbol-avoid-edges': true,
      },
      paint: {
        // Territory-colored number on the white badge; the dark halo keeps
        // light palette colors (yellow, spring green) legible on white.
        'text-color': territoryColor,
        'text-halo-color': 'rgba(0,0,0,0.45)',
        'text-halo-width': 1,
      },
    };

    engine.addLayer(badgeLayer);
    engine.addLayer(labelLayer);
    this.initialized = true;
  }

  /**
   * Sync the visible labels with the current selection: only the selected
   * territories' numbers are rendered; an empty selection shows all
   * territory numbers.
   *
   * @param engine    The active MapEngine.
   * @param selected  Currently selected territory numbers.
   */
  updateLabels(engine: MapEngine, selected: number[]): void {
    if (!this.initialized) return;
    const numeros = selected.length > 0 ? selected : this.rendering.getTerritoriosConMetadata();
    engine.updateGeoJsonSourceData(LABEL_SOURCE_ID, this.buildCentroidCollection(numeros));
  }

  private buildCentroidCollection(numeros: number[]): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    for (const num of numeros) {
      const centroid = this.rendering.getCentroidByTerritorio(num);
      if (!centroid) continue;
      // Backend territory color (same source as marks/selection), falling
      // back to the TERRITORY_COLORS cycle when colors aren't loaded yet.
      const backendColor =
        this.rendering.getFeatureLayerByTerritorio(num)?.color ?? null;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [centroid[0], centroid[1]] },
        properties: {
          territorio: num,
          color: getColorForTerritorio(num, backendColor),
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }

  /**
   * Remove the label layer and source from the map.
   *
   * @param engine  The active MapEngine.
   */
  destroy(engine: MapEngine): void {
    if (!this.initialized) return;
    for (const id of [LABEL_LAYER_ID, BADGE_LAYER_ID]) {
      try {
        engine.removeLayer(id);
      } catch {
        // Layer may not exist — ignore.
      }
    }
    try {
      engine.removeSource(LABEL_SOURCE_ID);
    } catch {
      // Source may not exist — ignore.
    }
    this.initialized = false;
  }

  /** Whether the label layer has been initialized. */
  isInitialized(): boolean {
    return this.initialized;
  }
}