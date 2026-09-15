import { Injectable, signal } from '@angular/core';
import { Map, Canvas } from 'leaflet';
import { MAP_DEFAULTS } from '../utils/map-constants';

/**
 * Manages the lifecycle of the Leaflet Map instance.
 *
 * <p>Single responsibility: create, expose, and destroy the map.
 * No styles, territory logic, or UI interaction.</p>
 *
 * <p>Uses the standard Leaflet 1.9 Canvas renderer: during a pan drag the
 * canvas container is moved with a GPU transform and paths are repainted
 * only on `moveend` — no per-frame redraw.</p>
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
      this.territoryRenderer = new Canvas({ padding: 0.1 });
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
