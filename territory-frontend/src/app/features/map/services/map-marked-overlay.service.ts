import { Injectable } from '@angular/core';
import type { MapEngine, LayerSpecification } from './map-engine.interface';
import type { ManzanaMarcada } from '../types/map.types';
import type * as GeoJSON from 'geojson';

/** Unique ID for the marked GeoJSON source (marked manzana overlay). */
const MARKED_SOURCE_ID = 'marked';

/** Unique IDs for the marked overlay fill and line layers. */
const MARKED_FILL_LAYER_ID = 'marked-fill';
const MARKED_LINE_LAYER_ID = 'marked-line';

/** Fill opacity for a marked manzana whose territory is COMPLETE. */
const MARKED_FILL_OPACITY_COMPLETE = 0.95;

/** Fill opacity for a marked manzana whose territory is incomplete. */
const MARKED_FILL_OPACITY_PARTIAL = 0.85;

/** Stroke width of marked manzanas (Leaflet parity: weight 4 → 3px line). */
const MARKED_LINE_WIDTH = 3;

/** Fallback color if a marked feature lacks a color property. */
const MARKED_FALLBACK_COLOR = '#22c55e';

/**
 * Matches a {@link ManzanaMarcada} against the manzana features of its
 * territory (from the `/all/geojson` snapshot). Marks carry one of three
 * ID shapes and we must accept all of them:
 *
 * - numeric MVT fid ("554")           → matches the `fid` property;
 * - legacy composite "{t}-{b}" ("56-56.b") → matches the `id` property;
 * - bloque name ("56.b")              → matches `nombre_bloque`
 *   (and the mark's own `nombreBloque` when the mark id is a fid).
 *
 * Returns the matched feature or null.
 */
export function matchMarkedFeature(
  mark: ManzanaMarcada,
  features: GeoJSON.Feature[],
): GeoJSON.Feature | null {
  return (
    features.find(f => {
      const props = (f.properties ?? {}) as Record<string, unknown>;
      return (
        mark.id === stringify(props['fid']) ||
        mark.id === stringify(f.id) ||
        mark.id === stringify(props['id']) ||
        mark.id === stringify(props['nombre_bloque']) ||
        (mark.nombreBloque !== '' && mark.nombreBloque === stringify(props['nombre_bloque']))
      );
    }) ?? null
  );
}

function stringify(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Renders the MARKED manzanas as a dedicated GeoJSON overlay above the
 * vector tiles (Leaflet parity: marked manzanas get fill 0.95/0.85 and a
 * 3px stroke — the tile fills alone cannot express per-mark styling).
 *
 * <p>Features are matched from the `/all/geojson` snapshot via
 * {@link matchMarkedFeature} and carry two extra properties:
 * `color` (the mark color) and `completo` (whether the territory finished),
 * which drive the data-driven paints.</p>
 *
 * <p>This service operates exclusively through the {@link MapEngine}
 * abstraction — it never imports maplibre-gl directly.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapMarkedOverlayService {
  private initialized = false;

  /**
   * Initialize the marked GeoJSON source and its fill/line layers.
   *
   * <p>Must be called once after the MapLibre engine is ready AND the
   * GeoJSON metadata is loaded (the overlay is populated from it).
   * Subsequent calls are no-ops (idempotent).</p>
   *
   * @param engine  The active MapEngine.
   */
  initOverlay(engine: MapEngine): void {
    if (this.initialized) return;

    engine.addGeoJsonSource(MARKED_SOURCE_ID, { type: 'FeatureCollection', features: [] });

    const paint = {
      'fill-color': ['coalesce', ['get', 'color'], MARKED_FALLBACK_COLOR],
      'fill-opacity': [
        'case',
        ['get', 'completo'],
        MARKED_FILL_OPACITY_COMPLETE,
        MARKED_FILL_OPACITY_PARTIAL,
      ],
      'fill-outline-color': ['coalesce', ['get', 'color'], MARKED_FALLBACK_COLOR],
    };

    const markedFillLayer: LayerSpecification = {
      id: MARKED_FILL_LAYER_ID,
      type: 'fill',
      source: MARKED_SOURCE_ID,
      paint,
    };

    const markedLineLayer: LayerSpecification = {
      id: MARKED_LINE_LAYER_ID,
      type: 'line',
      source: MARKED_SOURCE_ID,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], MARKED_FALLBACK_COLOR],
        'line-width': MARKED_LINE_WIDTH,
      },
    };

    engine.addLayer(markedFillLayer);
    engine.addLayer(markedLineLayer);
    this.initialized = true;
  }

  /**
   * Replace the overlay data with the given marked features.
   *
   * @param engine    The active MapEngine.
   * @param features  The matched manzana features (with `color`/`completo`).
   */
  updateOverlay(engine: MapEngine, features: GeoJSON.Feature[]): void {
    if (!this.initialized) return;
    engine.updateGeoJsonSourceData(MARKED_SOURCE_ID, {
      type: 'FeatureCollection',
      features,
    });
  }

  /**
   * Remove the marked overlay layers and source from the map.
   *
   * @param engine  The active MapEngine.
   */
  destroy(engine: MapEngine): void {
    if (!this.initialized) return;
    for (const id of [MARKED_FILL_LAYER_ID, MARKED_LINE_LAYER_ID]) {
      try {
        engine.removeLayer(id);
      } catch {
        // Layer may not exist — ignore.
      }
    }
    try {
      engine.removeSource(MARKED_SOURCE_ID);
    } catch {
      // Source may not exist — ignore.
    }
    this.initialized = false;
  }

  /** Whether the overlay has been initialized. */
  isInitialized(): boolean {
    return this.initialized;
  }
}