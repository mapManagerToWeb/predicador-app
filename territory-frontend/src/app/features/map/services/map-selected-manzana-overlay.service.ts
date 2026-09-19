import { Injectable } from '@angular/core';
import type { MapEngine, LayerSpecification } from './map-engine.interface';
import type * as GeoJSON from 'geojson';

/** Unique source ID for the selected-manzana highlight overlay. */
const SELECTED_SOURCE_ID = 'selected-manzana';

/** Layer IDs for the highlight fill and line layers. */
const SELECTED_FILL_LAYER_ID = 'selected-manzana-fill';
const SELECTED_LINE_LAYER_ID = 'selected-manzana-line';

// Leaflet parity: STYLE_DEFAULTS.selectedManzana
//   { weight: 4, color: '#facc15', fillColor: '#facc15', fillOpacity: 0.15 }
const SELECTED_COLOR = '#facc15';
const SELECTED_FILL_OPACITY = 0.15;
const SELECTED_LINE_WIDTH = 4;

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * Renders the tapped manzana as a yellow highlight ([Leaflet parity]
 * `STYLE_DEFAULTS.selectedManzana`: `#facc15`, fill 0.15, 4px stroke).
 *
 * <p>Selecting a territory hides every other territory (`hiddenPolygon`
 * parity), so without this highlight the map would read as uniformly grey —
 * the tapped manzana is what tells the user which one they hit. It is the
 * MapLibre equivalent of Leaflet's `seleccionarManzana`, which applied
 * {@link SELECTED_FILL_OPACITY} styling to the clicked polygon.</p>
 *
 * <p>The overlay is created once together with the other GeoJSON overlays and
 * only its data is swapped afterwards. It operates exclusively through the
 * {@link MapEngine} abstraction — it never imports maplibre-gl directly.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapSelectedManzanaOverlayService {
  private initialized = false;

  /**
   * Initialize the highlight source and its fill/line layers. Idempotent:
   * safe to call on every (re)initialization of the map.
   */
  initOverlay(engine: MapEngine): void {
    if (this.initialized) return;

    engine.addGeoJsonSource(SELECTED_SOURCE_ID, EMPTY_COLLECTION);

    const fillLayer: LayerSpecification = {
      id: SELECTED_FILL_LAYER_ID,
      type: 'fill',
      source: SELECTED_SOURCE_ID,
      paint: {
        'fill-color': SELECTED_COLOR,
        'fill-opacity': SELECTED_FILL_OPACITY,
      },
    };

    const lineLayer: LayerSpecification = {
      id: SELECTED_LINE_LAYER_ID,
      type: 'line',
      source: SELECTED_SOURCE_ID,
      paint: {
        'line-color': SELECTED_COLOR,
        'line-width': SELECTED_LINE_WIDTH,
      },
    };

    engine.addLayer(fillLayer);
    engine.addLayer(lineLayer);
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /** Highlight a manzana geometry, or clear the highlight with `null`. */
  setSelected(engine: MapEngine, feature: GeoJSON.Feature | null): void {
    if (!this.initialized) return;

    engine.updateGeoJsonSourceData(SELECTED_SOURCE_ID, {
      type: 'FeatureCollection',
      features: feature ? [feature] : [],
    });
  }

  /** Remove the highlight source and layers from the map. */
  destroy(engine: MapEngine): void {
    if (!this.initialized) return;

    for (const id of [SELECTED_FILL_LAYER_ID, SELECTED_LINE_LAYER_ID]) {
      try {
        engine.removeLayer(id);
      } catch {
        // Layer may not exist — ignore.
      }
    }
    try {
      engine.removeSource(SELECTED_SOURCE_ID);
    } catch {
      // Source may not exist — ignore.
    }
    this.initialized = false;
  }
}
