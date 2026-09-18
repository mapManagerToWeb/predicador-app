import { Injectable, inject } from '@angular/core';
import { MapRenderingFacade } from './map-rendering.facade';
import type { MapEngine, LayerSpecification } from './map-engine.interface';
import type * as GeoJSON from 'geojson';

/** Unique ID for the GeoJSON label centroids source. */
const LABEL_SOURCE_ID = 'territory-label-centroids';

/** Unique ID for the label symbol layer. */
const LABEL_LAYER_ID = 'territory-labels';

/** Labels become visible from this zoom (Leaflet parity: minzoom 14). */
const LABEL_MIN_ZOOM = 14;

/**
 * Manages the territory label layer for MapLibre GL JS.
 *
 * <p>Renders the TERRITORY NUMBER at the territory centroid (bounds
 * center of its manzanas, taken from the `/all/geojson` snapshot — the
 * same source the deployed Leaflet app used for labels). The dissolved
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
        'text-color': '#1e293b',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1,
      },
    };

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
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [centroid[0], centroid[1]] },
        properties: { territorio: num },
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
    try {
      engine.removeLayer(LABEL_LAYER_ID);
    } catch {
      // Layer may not exist — ignore.
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