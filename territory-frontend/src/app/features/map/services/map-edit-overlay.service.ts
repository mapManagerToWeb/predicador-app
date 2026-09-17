import { Injectable, inject } from '@angular/core';
import type { MapEngine, LayerSpecification } from './map-engine.interface';
import { MapEngineService } from './map-engine.service';
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
  private readonly engine = inject(MapEngineService);
  private readonly state = inject(MapStateService);
  private readonly tileVersion = inject(TileVersionService);

  private overlayActive = false;

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
    if (this.isLeafletEngine(engine)) return;

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
    if (this.isLeafletEngine(engine)) return;

    this.setSourceData(engine, geoJson);
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
    if (!this.overlayActive) return;
    if (this.isLeafletEngine(engine)) return;

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

  /** Whether the engine is the Leaflet engine (not MapLibre). */
  private isLeafletEngine(engine: MapEngine): boolean {
    return engine instanceof MapEngineService;
  }

  private addSource(engine: MapEngine, geoJson: GeoJSON.FeatureCollection): void {
    engine.addGeoJsonSource(EDIT_SOURCE_ID, geoJson);
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
        'line-color': EDIT_LINE_COLOR,
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
