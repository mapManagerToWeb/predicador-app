import { Injectable } from '@angular/core';
import type { MapEngine, LayerSpecification } from './map-engine.interface';

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

/** Default opacity for territory fill (also the COMPLETED territory value). */
const DEFAULT_FILL_OPACITY = 0.6;

/** Fallback color when tile feature lacks a `color` property. */
const FALLBACK_COLOR = '#94a3b8';

/** Opacity for an INCOMPLETE territory (not fully marked) — Leaflet parity. */
const INCOMPLETE_FILL_OPACITY = 0.05;

/** Opacity for territories OUTSIDE the active selection (hidden) — Leaflet parity. */
const HIDDEN_FILL_OPACITY = 0;

/** Line width for territories OUTSIDE the active selection (hidden). */
const HIDDEN_LINE_WIDTH = 0;

/** Base line width for territory boundaries. */
const DEFAULT_LINE_WIDTH = 1;

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
 * - Data-driven `fill-color` from the tile `color` property (no feature-state
 *   highlight — amber was removed for Leaflet parity)
 * - Data-driven `fill-opacity` by completeness: COMPLETED territories render
 *   at 0.6, incomplete at 0.05 (Leaflet parity); with an active selection,
 *   non-selected territories are hidden (opacity 0, line 0)</p>
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
    this.tileUrl = newUrl;
    engine.setSourceUrl(TERRITORY_SOURCE_ID, newUrl);
  }

  /**
   * Base tile URL template without the `?v=` cache-busting parameter.
   *
   * <p>Used by {@link TileVersionService} to force a tile refresh after a
   * tile fetch error: MapLibre skips `setSourceUrl` when the URL string is
   * unchanged, so the recovery path strips any existing version and appends
   * a fresh cache-buster.</p>
   */
  getBaseTileUrl(): string {
    return this.tileUrl
      .replace(/([?&])v=[^&#]*(&|$)/, (_match, pre: string, post: string) => (post ? pre : ''))
      .replace(/[?&]$/, '');
  }

  /**
   * Update the fill-opacity for a specific territory's features.
   *
   * <p>Applies the same match expression to BOTH fill layers: the manzana
   * layer keys on `territorio`, the dissolved territorio layer keys on
   * `tid` (the MVT property names for the territory number).</p>
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
    engine.setPaintProperty(
      FILL_LAYER_ID,
      'fill-opacity',
      this.buildOpacityExpression('territorio', territoryId, opacity),
    );
    engine.setPaintProperty(
      FILL_DISSOLVED_LAYER_ID,
      'fill-opacity',
      this.buildOpacityExpression('tid', territoryId, opacity),
    );
  }

  /**
   * Apply the base completion-driven fill-opacity to BOTH fill layers:
   * territories in `completed` render at `DEFAULT_FILL_OPACITY` (0.6),
   * everything else at `INCOMPLETE_FILL_OPACITY` (0.05) — Leaflet parity.
   *
   * @param engine    The active MapEngine.
   * @param completed Territory numbers whose manzanas are ALL marked.
   */
  setCompletionOpacity(engine: MapEngine, completed: number[]): void {
    engine.setPaintProperty(
      FILL_LAYER_ID,
      'fill-opacity',
      this.completionOpacityExpression('territorio', completed),
    );
    engine.setPaintProperty(
      FILL_DISSOLVED_LAYER_ID,
      'fill-opacity',
      this.completionOpacityExpression('tid', completed),
    );
  }

  /**
   * Reset the fill-opacity to the base completion-driven expression on BOTH
   * fill layers and restore the base line width on both line layers.
   *
   * @param engine    The active MapEngine.
   * @param completed Territory numbers whose manzanas are ALL marked.
   */
  resetFillOpacity(engine: MapEngine, completed: number[] = []): void {
    this.setCompletionOpacity(engine, completed);
    engine.setPaintProperty(LINE_LAYER_ID, 'line-width', DEFAULT_LINE_WIDTH);
    engine.setPaintProperty(LINE_DISSOLVED_LAYER_ID, 'line-width', DEFAULT_LINE_WIDTH);
  }

  /**
   * Hide every territory that is NOT in the `selected` list (opacity 0 +
   * line width 0 — Leaflet {@code hiddenPolygon} parity) and render the
   * selected ones by completeness: completed → 0.6, incomplete → 0.05.
   * Applied to BOTH fill layers and BOTH line layers (manzana keys on
   * `territorio`, dissolved keys on `tid`).
   *
   * @param engine    The active MapEngine.
   * @param selected  The territory numbers to keep visible.
   * @param completed Territory numbers whose manzanas are ALL marked.
   */
  setSelectedTerritoriesOpacity(engine: MapEngine, selected: number[], completed: number[]): void {
    const fillExpression = (key: string) =>
      ['case', ['in', ['get', key], ['literal', selected]],
        this.completionOpacityExpression(key, completed),
        HIDDEN_FILL_OPACITY,
      ];
    const lineExpression = (key: string) =>
      ['case', ['in', ['get', key], ['literal', selected]], DEFAULT_LINE_WIDTH, HIDDEN_LINE_WIDTH];

    engine.setPaintProperty(FILL_LAYER_ID, 'fill-opacity', fillExpression('territorio'));
    engine.setPaintProperty(FILL_DISSOLVED_LAYER_ID, 'fill-opacity', fillExpression('tid'));
    engine.setPaintProperty(LINE_LAYER_ID, 'line-width', lineExpression('territorio'));
    engine.setPaintProperty(LINE_DISSOLVED_LAYER_ID, 'line-width', lineExpression('tid'));
  }

  /**
   * Remove all layers and source added by this service.
   */
  destroy(engine: MapEngine): void {
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
    const fillColor: unknown[] = ['coalesce', ['get', 'color'], FALLBACK_COLOR];

    // Manzana fill layer (z ≥ 12)
    const manzanaFillLayer: LayerSpecification = {
      id: FILL_LAYER_ID,
      type: 'fill',
      source: TERRITORY_SOURCE_ID,
      'source-layer': SOURCE_LAYER_MANZANA,
      paint: {
        'fill-color': fillColor,
        // Base completion expression — updated once marks restore.
        'fill-opacity': this.completionOpacityExpression('territorio', []),
        'fill-outline-color': fillColor,
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
        'line-width': DEFAULT_LINE_WIDTH,
        'line-color': fillColor,
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
        'fill-color': fillColor,
        'fill-opacity': this.completionOpacityExpression('tid', []),
        'fill-outline-color': fillColor,
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
        'line-width': DEFAULT_LINE_WIDTH,
        'line-color': fillColor,
      },
    };
    engine.addLayer(territorioLineLayer);
  }

  /**
   * Build the base completion-driven opacity expression: territories in the
   * `completed` literal list render at `DEFAULT_FILL_OPACITY` (0.6),
   * everyone else at `INCOMPLETE_FILL_OPACITY` (0.05) — Leaflet parity.
   */
  private completionOpacityExpression(key: string, completed: number[]): unknown[] {
    return [
      'case',
      ['in', ['get', key], ['literal', completed]],
      DEFAULT_FILL_OPACITY,
      INCOMPLETE_FILL_OPACITY,
    ];
  }

  /**
   * Build a MapLibre data-driven opacity expression that maps the
   * given property key (`territorio` for manzanas, `tid` for dissolved
   * territories) to the specified opacity and defaults to
   * `DEFAULT_FILL_OPACITY` for all other territories.
   */
  private buildOpacityExpression(
    key: string,
    territoryId: number,
    opacity: number,
  ): unknown[] {
    return [
      'match',
      ['get', key],
      territoryId,
      opacity,
      DEFAULT_FILL_OPACITY,
    ];
  }
}
