import { Injectable, signal } from '@angular/core';
import * as L from 'leaflet';
import { MAP_DEFAULTS } from '../utils/map-constants';

/**
 * Manages the lifecycle of the Leaflet L.Map instance.
 *
 * <p>Single responsibility: create, expose, and destroy the map.
 * No styles, territory logic, or UI interaction.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapEngineService {
  private map = signal<L.Map | null>(null);

  getMap(): L.Map | null {
    return this.map();
  }

  initializeMap(mapElement: HTMLElement): void {
    const map = L.map(mapElement, {
      preferCanvas: true,
      zoomControl: false,
    }).setView(MAP_DEFAULTS.initialView, MAP_DEFAULTS.initialZoom);

    this.map.set(map);
  }

  destroy(): void {
    this.map()?.remove();
    this.map.set(null);
  }
}
