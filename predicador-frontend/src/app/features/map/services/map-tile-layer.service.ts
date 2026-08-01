import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import * as L from 'leaflet';
import { MAP_DEFAULTS, TILE_LAYERS, ATTRIBUTIONS } from '../utils/map-constants';
import { MapEngineService } from './map-engine.service';

/**
 * Manages tile layers (base, satellite) and theme switching.
 *
 * <p>Observes data-theme attribute changes via MutationObserver and swaps
 * tile URLs accordingly. Releases the observer on destroy.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapTileLayerService implements OnDestroy {
  private tileLayer = signal<L.TileLayer | null>(null);
  private satelliteLayer = signal<L.TileLayer | null>(null);
  private themeObserver: MutationObserver | null = null;
  private isSatelliteView = false;

  private readonly engine = inject(MapEngineService);

  initLayers(): void {
    const map = this.engine.getMap();
    if (!map) return;

    const theme = this.getCurrentTheme();
    const tileLayer = L.tileLayer(this.getTileLayerUrl(theme), {
      maxZoom: MAP_DEFAULTS.maxZoom,
      attribution: this.getMapAttribution(theme),
    }).addTo(map);

    const satelliteLayer = L.tileLayer(TILE_LAYERS.satellite, {
      maxZoom: MAP_DEFAULTS.maxZoom,
      attribution: ATTRIBUTIONS.satellite,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    this.tileLayer.set(tileLayer);
    this.satelliteLayer.set(satelliteLayer);
  }

  isSatellite(): boolean {
    return this.isSatelliteView;
  }

  toggleSatellite(): void {
    const map = this.engine.getMap();
    if (!map) return;

    this.isSatelliteView = !this.isSatelliteView;

    if (this.isSatelliteView) {
      map.removeLayer(this.tileLayer()!);
      this.satelliteLayer()!.addTo(map);
    } else {
      map.removeLayer(this.satelliteLayer()!);
      this.tileLayer()!.addTo(map);
    }
  }

  observeThemeChanges(): void {
    if (typeof MutationObserver === 'undefined') return;

    this.themeObserver = new MutationObserver(() => {
      if (!this.tileLayer() || this.isSatelliteView) return;
      this.tileLayer()!.setUrl(this.getTileLayerUrl(this.getCurrentTheme()));
    });

    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  ngOnDestroy(): void {
    this.themeObserver?.disconnect();
    this.themeObserver = null;
  }

  destroy(): void {
    this.ngOnDestroy();
    this.tileLayer.set(null);
    this.satelliteLayer.set(null);
    this.isSatelliteView = false;
  }

  private getCurrentTheme(): 'light' | 'dark' {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  private getTileLayerUrl(theme: 'light' | 'dark'): string {
    return theme === 'dark' ? TILE_LAYERS.dark : TILE_LAYERS.light;
  }

  private getMapAttribution(theme: 'light' | 'dark'): string {
    return theme === 'dark' ? ATTRIBUTIONS.dark : ATTRIBUTIONS.light;
  }
}
