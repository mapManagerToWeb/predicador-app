import { Injectable, inject } from '@angular/core';
import type { MapEngine, LayerSpecification } from './map-engine.interface';
import { MapStateService } from './map-state.service';
import { TileVersionService } from './tile-version.service';

/** Unique source ID for the GeoJSON edit overlay. */
const EDIT_SOURCE_ID = 'edit-overlay';

/** Layer IDs for the edit overlay fill and line layers. */
const EDIT_FILL_LAYER_ID = 'edit-overlay-fill';
const EDIT_LINE_LAYER_ID = 'edit-overlay-line';

/** Semi-transparent fill color for the edit overlay. */
const EDIT_FILL_COLOR = '#3b82f6';

/** Stroke color for the edit overlay. */
const EDIT_LINE_COLOR = '#1d4ed8';

/** Unique source ID for the partial-draw preview polygon. */
const PARTIAL_SOURCE_ID = 'partial-preview';

/** Layer IDs for the partial-draw preview fill and line layers. */
const PARTIAL_FILL_LAYER_ID = 'partial-preview-fill';
const PARTIAL_LINE_LAYER_ID = 'partial-preview-line';

// Leaflet parity: STYLE_DEFAULTS.partialPolygon
//   { weight: 4, fillOpacity: 0.75, dashArray: '8, 8' }
/** Line width of the partial preview (Leaflet `weight: 4`). */
const PARTIAL_LINE_WIDTH = 4;

/** Fill opacity of the partial preview (Leaflet `fillOpacity: 0.75`). */
const PARTIAL_FILL_OPACITY = 0.75;

/**
 * MapLibre scales `line-dasharray` by the line width, so Leaflet's
 * `'8, 8'` pixels at weight 4 is `[2, 2]` here (2 × 4px = 8px).
 */
const PARTIAL_DASH_ARRAY: [number, number] = [2, 2];

/** Fallback color when the preview feature carries no territory color. */
const PARTIAL_FALLBACK_COLOR = '#22c55e';

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * Manages the GeoJSON overlay layer on the MapLibre map for hybrid edit mode.
 *
 * <p>When the user enters edit mode (partial draw, snap, polygon clip), a
 * full-precision GeoJSON is fetched for the selected territory and rendered
 * as an overlay on top of the vector tile layer. This overlay provides:</p>
 * <ul>
 *   <li>Exact geometry boundaries for snap targets</li>
 *   <li>Visual preview of partial draw operations</li>
 *   <li>Handles for edit point manipulation</li>
 * </ul>
 *
 * <p>The overlay is removed when the user exits edit mode or after a
 * successful save (which bumps the tile version and refreshes tiles).</p>
 *
 * <p>This service is only active in MapLibre mode — in Leaflet mode,
 * the existing Leaflet-based partial draw layers serve this purpose.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapEditOverlayService {
  private readonly state = inject(MapStateService);
  private readonly tileVersion = inject(TileVersionService);

  private overlayActive = false;

  /** Whether the partial-draw preview source/layers are currently on the map. */
  private partialPreviewActive = false;

  /** Whether the edit overlay is currently rendered on the map. */
  isOverlayActive(): boolean {
    return this.overlayActive;
  }

  /**
   * Add the GeoJSON edit overlay to the MapLibre map.
   *
   * <p>If the overlay is already active, this is a no-op. If the active
   * engine is Leaflet, this is also a no-op (Leaflet uses its own layer
   * management for partial draw).</p>
   *
   * @param geoJson - A GeoJSON FeatureCollection with the territory geometry.
   * @param engine  - The active MapEngine (must be MapLibre for overlay).
   */
  addOverlay(geoJson: GeoJSON.FeatureCollection, engine: MapEngine): void {
    if (this.overlayActive) return;

    this.addSource(engine, geoJson);
    this.addLayers(engine);
    this.overlayActive = true;
  }

  /**
   * Update the overlay source data with new GeoJSON.
   *
   * <p>Called when partial draw operations modify the geometry being edited.
   * Uses `setData` on the GeoJSON source for efficient in-place update
   * without source recreation.</p>
   *
   * @param geoJson - Updated GeoJSON FeatureCollection.
   * @param engine  - The active MapEngine.
   */
  updateOverlay(geoJson: GeoJSON.FeatureCollection, engine: MapEngine): void {
    if (!this.overlayActive) return;

    this.setSourceData(engine, geoJson);
  }

  /**
   * Render (or refresh) the partial-draw preview as a filled, dashed polygon
   * — Leaflet parity with `STYLE_DEFAULTS.partialPolygon`
   * (`weight: 4`, `fillOpacity: 0.75`, `dashArray: '8, 8'`).
   *
   * <p>The preview used to be pushed as a bare `LineString` through
   * {@link updateOverlay}, which rendered as an almost invisible stroke on the
   * tile background. It now lives in its own source with the Leaflet paint, so
   * the area being drawn is visible while it is being drawn.</p>
   *
   * <p>Creates the source/layers on first use; callers may therefore push
   * updates without tracking initialization.</p>
   */
  updatePartialPreview(geoJson: GeoJSON.FeatureCollection, engine: MapEngine): void {
    if (!this.partialPreviewActive) {
      this.addPartialPreview(engine);
    }
    engine.updateGeoJsonSourceData(PARTIAL_SOURCE_ID, geoJson);
  }

  /** Remove the partial-draw preview source and layers. */
  removePartialPreview(engine: MapEngine): void {
    if (!this.partialPreviewActive) return;

    for (const id of [PARTIAL_FILL_LAYER_ID, PARTIAL_LINE_LAYER_ID]) {
      try {
        engine.removeLayer(id);
      } catch {
        // Layer may not exist — ignore.
      }
    }
    try {
      engine.removeSource(PARTIAL_SOURCE_ID);
    } catch {
      // Source may not exist — ignore.
    }
    this.partialPreviewActive = false;
  }

  /**
   * Remove the edit overlay from the map and clear the edit GeoJSON state.
   *
   * <p>Called after save or when exiting edit mode. Safe to call even
   * if the overlay is not active (no-op in that case).</p>
   *
   * @param engine - The active MapEngine.
   */
  removeOverlay(engine: MapEngine): void {
    this.removePartialPreview(engine);

    if (!this.overlayActive) return;

    this.removeLayers(engine);
    this.removeSource(engine);
    this.overlayActive = false;
    this.state.editGeoJson.set(null);
  }

  /**
   * Persist the current edit, bump the tile version, and remove the overlay.
   *
   * <p>This is the post-save cleanup: after the backend confirms the save,
   * tiles will auto-refresh with the new data via TileVersionService polling.</p>
   *
   * @param engine - The active MapEngine.
   */
  saveAndRefreshTiles(engine: MapEngine): void {
    this.removeOverlay(engine);
    // Trigger an immediate version check so tiles refresh without waiting
    // for the next poll cycle.
    this.tileVersion.checkVersionNow(engine);
  }

  private addSource(engine: MapEngine, geoJson: GeoJSON.FeatureCollection): void {
    engine.addGeoJsonSource(EDIT_SOURCE_ID, geoJson);
  }

  private addPartialPreview(engine: MapEngine): void {
    engine.addGeoJsonSource(PARTIAL_SOURCE_ID, EMPTY_COLLECTION);

    const fillLayer: LayerSpecification = {
      id: PARTIAL_FILL_LAYER_ID,
      type: 'fill',
      source: PARTIAL_SOURCE_ID,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], PARTIAL_FALLBACK_COLOR],
        'fill-opacity': PARTIAL_FILL_OPACITY,
      },
    };

    const lineLayer: LayerSpecification = {
      id: PARTIAL_LINE_LAYER_ID,
      type: 'line',
      source: PARTIAL_SOURCE_ID,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], PARTIAL_FALLBACK_COLOR],
        'line-width': PARTIAL_LINE_WIDTH,
        'line-dasharray': PARTIAL_DASH_ARRAY,
      },
    };

    engine.addLayer(fillLayer);
    engine.addLayer(lineLayer);
    this.partialPreviewActive = true;
  }

  private addLayers(engine: MapEngine): void {
    const fillLayer: LayerSpecification = {
      id: EDIT_FILL_LAYER_ID,
      type: 'fill',
      source: EDIT_SOURCE_ID,
      paint: {
        'fill-color': EDIT_FILL_COLOR,
        'fill-opacity': 0.3,
      },
    };

    const lineLayer: LayerSpecification = {
      id: EDIT_LINE_LAYER_ID,
      type: 'line',
      source: EDIT_SOURCE_ID,
      paint: {
        // Data-driven color so the partial-draw preview renders in the
        // active territory color (Leaflet parity) when features carry one.
        'line-color': ['coalesce', ['get', 'color'], EDIT_LINE_COLOR],
        'line-width': 2,
      },
    };

    // Add layers after the last tile layer (fill → line z-order)
    engine.addLayer(fillLayer);
    engine.addLayer(lineLayer);
  }

  private setSourceData(engine: MapEngine, geoJson: GeoJSON.FeatureCollection): void {
    engine.updateGeoJsonSourceData(EDIT_SOURCE_ID, geoJson);
  }

  private removeLayers(engine: MapEngine): void {
    try {
      engine.removeLayer(EDIT_FILL_LAYER_ID);
    } catch {
      // Layer may not exist — ignore.
    }
    try {
      engine.removeLayer(EDIT_LINE_LAYER_ID);
    } catch {
      // Layer may not exist — ignore.
    }
  }

  private removeSource(engine: MapEngine): void {
    try {
      engine.removeSource(EDIT_SOURCE_ID);
    } catch {
      // Source may not exist — ignore.
    }
  }
}
