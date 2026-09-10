import { Injectable, signal } from '@angular/core';
import { Map, Canvas } from 'leaflet';
import { MAP_DEFAULTS } from '../utils/map-constants';

/**
 * Canvas renderer that redraws polygons DURING pan (on every `move` event),
 * not just after it ends (`moveend`). Fixes the Leaflet 2.0 drift bug where
 * the Renderer base class forces `continuous: false`, causing polygons to
 * lag behind tiles while the user drags.
 *
 * Why a subclass: Leaflet 2.0 Renderer.initialize() overrides continuous to
 * false unconditionally. We re-attach the `move` listener after init so
 * _onMoveEnd runs on every frame during drag.
 */
class ContinuousCanvas extends Canvas {
  override onAdd(map: Map): this {
    super.onAdd(map);
    // Re-bind `move` → _onMoveEnd so bounds update during drag, not just at end.
    // _onMoveEnd is inherited from BlanketOverlay and is idempotent (recomputes
    // bounds + transform on every call), so calling it per-frame is safe.
    // Cast needed: _onMoveEnd is underscore-prefixed (private by convention in TS
    // types) but public in the Leaflet JS runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onMoveEnd = (this as any)._onMoveEnd.bind(this);
    map.on('move', onMoveEnd);
    return this;
  }

  override onRemove(map: Map): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onMoveEnd = (this as any)._onMoveEnd.bind(this);
    map.off('move', onMoveEnd);
    super.onRemove(map);
    return this;
  }
}

/**
 * Manages the lifecycle of the Leaflet Map instance.
 *
 * <p>Single responsibility: create, expose, and destroy the map.
 * No styles, territory logic, or UI interaction.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapEngineService {
  private map = signal<Map | null>(null);
  private territoryRenderer: Canvas | null = null;

  getMap(): Map | null {
    return this.map();
  }

  getTerritoryRenderer(): Canvas {
    if (!this.territoryRenderer) {
      this.territoryRenderer = new ContinuousCanvas({ padding: 0.3 });
    }
    return this.territoryRenderer;
  }

  initializeMap(mapElement: HTMLElement): void {
    const map = new Map(mapElement, {
      zoomControl: false,
      markerZoomAnimation: false,
      inertia: false,
      fadeAnimation: true,
      renderer: this.getTerritoryRenderer(),
    }).setView(MAP_DEFAULTS.initialView, MAP_DEFAULTS.initialZoom);

    this.map.set(map);
  }

  destroy(): void {
    this.map()?.remove();
    this.map.set(null);
  }
}
