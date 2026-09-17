import { Injectable } from '@angular/core';
import type { MapEngine, LayerSpecification } from './map-engine.interface';

/** Source layer name for the manzana features in the MVT tiles. */
const SOURCE_LAYER_MANZANA = 'manzana';

/** Source ID — must match the vector tile source added by MapVectorTileService. */
const TERRITORY_SOURCE_ID = 'territories';

/** Unique ID for the label symbol layer. */
const LABEL_LAYER_ID = 'territory-labels';

/**
 * Manages the territory label layer for MapLibre GL JS.
 *
 * <p>Renders the `nombre` property of manzana features as a symbol
 * layer with collision-aware text placement. Labels are only visible
 * at zoom ≥ 14 to avoid clutter at lower zoom levels.</p>
 *
 * <p>This service operates exclusively through the {@link MapEngine}
 * abstraction — it never imports maplibre-gl directly. It is only active
 * when the active engine is MapLibre (not Leaflet).</p>
 */
@Injectable({ providedIn: 'root' })
export class MapLabelLayerService {
  private initialized = false;

  /**
   * Initialize the label symbol layer.
   *
   * <p>Must be called once after the MapLibre engine and vector tile
   * source are ready. Subsequent calls are no-ops (idempotent).</p>
   *
   * @param engine  The active MapEngine (must be MapLibre, not Leaflet).
   */
  initLabels(engine: MapEngine): void {
    if (this.initialized) return;

    const labelLayer: LayerSpecification = {
      id: LABEL_LAYER_ID,
      type: 'symbol',
      source: TERRITORY_SOURCE_ID,
      'source-layer': SOURCE_LAYER_MANZANA,
      minzoom: 14,
      layout: {
        'text-field': ['get', 'nombre'],
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
   * Remove the label layer from the map.
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
    this.initialized = false;
  }

  /** Whether the label layer has been initialized. */
  isInitialized(): boolean {
    return this.initialized;
  }
}
