import { Injectable } from '@angular/core';
import type { MapEngine, LayerSpecification } from './map-engine.interface';
import { MapEngineService } from './map-engine.service';

/**
 * Source layer name for the manzana features in the MVT tiles.
 * Confirmed from `TileService.LAYER_MANZANA` in the backend.
 */
const SOURCE_LAYER_MANZANA = 'manzana';

/**
 * Source layer name for the dissolved territorio features in the MVT tiles.
 * Confirmed from `TileService.LAYER_TERRITORIO` in the backend.
 */
const SOURCE_LAYER_TERRITORIO = 'territorio';

/** Unique ID for the vector tile source added to the MapLibre map. */
const TERRITORY_SOURCE_ID = 'territories';

/** Unique IDs for the fill and line layers. */
const FILL_LAYER_ID = 'territory-fill';
const LINE_LAYER_ID = 'territory-line';
const FILL_DISSOLVED_LAYER_ID = 'territory-dissolved-fill';
const LINE_DISSOLVED_LAYER_ID = 'territory-dissolved-line';

/** Default tile URL template — the backend serves MVT at this path. */
const DEFAULT_TILE_URL = '/api/v1/territories/tiles/{z}/{x}/{y}.pbf';

/** Default opacity for territory fill. */
const DEFAULT_FILL_OPACITY = 0.6;

/** Fallback color when tile feature lacks a `color` property. */
const FALLBACK_COLOR = '#94a3b8';

/**
 * Manages the MapLibre vector tile source and data-driven fill/line layers
 * for territory rendering.
 *
 * <p>This service operates exclusively through the {@link MapEngine}
 * abstraction — it never imports maplibre-gl directly. It is only active
 * when the active engine is MapLibre (not Leaflet).</p>
 *
 * <p>Layer configuration follows the backend MVT schema:
 * - Source: `territories` (vector tiles at `/tiles/{z}/{x}/{y}.pbf`)
 * - Source layers: `manzana` (z ≥ 12) and `territorio` (z < 12)
 * - Data-driven `fill-color` from tile `color` property
 * - Constant `fill-opacity` 0.6 (overridden per-territory when selected)</p>
 */
@Injectable({ providedIn: 'root' })
export class MapVectorTileService {
  /** The source ID used for the vector tile source. */
  static readonly SOURCE_ID = TERRITORY_SOURCE_ID;

  /** Source layer name for manzana features. */
  static readonly SOURCE_LAYER_MANZANA = SOURCE_LAYER_MANZANA;

  /** Source layer name for dissolved territorio features. */
  static readonly SOURCE_LAYER_TERRITORIO = SOURCE_LAYER_TERRITORIO;

  private tileUrl = DEFAULT_TILE_URL;
  private initialized = false;

  /**
   * Initialize the vector tile source and all data-driven layers.
   *
   * <p>Must be called once after the MapLibre engine is ready. Subsequent
   * calls are no-ops (idempotent).</p>
   *
   * @param engine   The active MapEngine (must be MapLibre, not Leaflet).
   * @param tileUrl  Optional override for the tile URL template.
   */
  initLayers(engine: MapEngine, tileUrl?: string): void {
    if (this.initialized) return;
    if (this.isLeafletEngine(engine)) return;

    if (tileUrl) this.tileUrl = tileUrl;

    this.addSource(engine);
    this.addLayers(engine);
    this.initialized = true;
  }

  /**
   * Update the tile source URL (e.g. after a `data_version` bump).
   *
   * <p>MapLibre re-fetches affected tiles automatically when the URL
   * changes — no source recreation needed.</p>
   *
   * @param engine  The active MapEngine.
   * @param newUrl  The new tile URL template (with updated `?v=` parameter).
   */
  updateTileUrl(engine: MapEngine, newUrl: string): void {
    if (this.isLeafletEngine(engine)) return;
    this.tileUrl = newUrl;
    engine.setSourceUrl(TERRITORY_SOURCE_ID, newUrl);
  }

  /**
   * Update the fill-opacity for a specific territory's manzana features.
   *
   * <p>Uses MapLibre data-driven styling: the opacity expression is
   * rebuilt as a match expression mapping `territorio` → opacity.</p>
   *
   * @param engine         The active MapEngine.
   * @param territoryId    The territory number.
   * @param opacity        The new opacity value (0–1).
   */
  setTerritoryFillOpacity(
    engine: MapEngine,
    territoryId: number,
    opacity: number,
  ): void {
    if (this.isLeafletEngine(engine)) return;
    engine.setPaintProperty(
      FILL_LAYER_ID,
      'fill-opacity',
      this.buildOpacityExpression(territoryId, opacity),
    );
  }

  /**
   * Reset the fill-opacity to the default constant value.
   */
  resetFillOpacity(engine: MapEngine): void {
    if (this.isLeafletEngine(engine)) return;
    engine.setPaintProperty(FILL_LAYER_ID, 'fill-opacity', DEFAULT_FILL_OPACITY);
  }

  /**
   * Remove all layers and source added by this service.
   */
  destroy(engine: MapEngine): void {
    if (this.isLeafletEngine(engine)) return;
    if (!this.initialized) return;

    // Remove layers first (order doesn't matter for removal).
    for (const id of [
      FILL_LAYER_ID,
      LINE_LAYER_ID,
      FILL_DISSOLVED_LAYER_ID,
      LINE_DISSOLVED_LAYER_ID,
    ]) {
      try {
        engine.removeLayer(id);
      } catch {
        // Layer may not exist — ignore.
      }
    }

    try {
      engine.removeSource(TERRITORY_SOURCE_ID);
    } catch {
      // Source may not exist — ignore.
    }

    this.initialized = false;
  }

  /** Whether the source and layers have been initialized. */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ─── Private helpers ────────────────────────────────────────────

  private addSource(engine: MapEngine): void {
    engine.addSource(TERRITORY_SOURCE_ID, this.tileUrl);
  }

  private addLayers(engine: MapEngine): void {
    // Manzana fill layer (z ≥ 12)
    const manzanaFillLayer: LayerSpecification = {
      id: FILL_LAYER_ID,
      type: 'fill',
      source: TERRITORY_SOURCE_ID,
      'source-layer': SOURCE_LAYER_MANZANA,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], FALLBACK_COLOR],
        'fill-opacity': DEFAULT_FILL_OPACITY,
        'fill-outline-color': ['coalesce', ['get', 'color'], FALLBACK_COLOR],
      },
    };
    engine.addLayer(manzanaFillLayer);

    // Manzana line layer (z ≥ 12) — territory boundaries
    const manzanaLineLayer: LayerSpecification = {
      id: LINE_LAYER_ID,
      type: 'line',
      source: TERRITORY_SOURCE_ID,
      'source-layer': SOURCE_LAYER_MANZANA,
      paint: {
        'line-width': 1,
        'line-color': ['coalesce', ['get', 'color'], FALLBACK_COLOR],
      },
    };
    engine.addLayer(manzanaLineLayer);

    // Dissolved territorio fill layer (z < 12)
    const territorioFillLayer: LayerSpecification = {
      id: FILL_DISSOLVED_LAYER_ID,
      type: 'fill',
      source: TERRITORY_SOURCE_ID,
      'source-layer': SOURCE_LAYER_TERRITORIO,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], FALLBACK_COLOR],
        'fill-opacity': DEFAULT_FILL_OPACITY,
        'fill-outline-color': ['coalesce', ['get', 'color'], FALLBACK_COLOR],
      },
    };
    engine.addLayer(territorioFillLayer);

    // Dissolved territorio line layer (z < 12) — territory boundaries
    const territorioLineLayer: LayerSpecification = {
      id: LINE_DISSOLVED_LAYER_ID,
      type: 'line',
      source: TERRITORY_SOURCE_ID,
      'source-layer': SOURCE_LAYER_TERRITORIO,
      paint: {
        'line-width': 1,
        'line-color': ['coalesce', ['get', 'color'], FALLBACK_COLOR],
      },
    };
    engine.addLayer(territorioLineLayer);
  }

  /**
   * Build a MapLibre data-driven opacity expression that maps the
   * given territory to the specified opacity and defaults to
   * `DEFAULT_FILL_OPACITY` for all other territories.
   */
  private buildOpacityExpression(
    territoryId: number,
    opacity: number,
  ): unknown[] {
    return [
      'match',
      ['get', 'territorio'],
      territoryId,
      opacity,
      DEFAULT_FILL_OPACITY,
    ];
  }

  /**
   * Type guard: returns true if the engine is the Leaflet engine
   * (MapEngineService), not the MapLibre engine.
   */
  private isLeafletEngine(engine: MapEngine): boolean {
    return engine instanceof MapEngineService;
  }
}
