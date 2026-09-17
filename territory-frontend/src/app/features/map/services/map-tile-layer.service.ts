import { Injectable } from '@angular/core';

/**
 * Manages tile layers (base, satellite) and theme switching.
 *
 * <p>In MapLibre-only mode, tile management is handled by
 * MapVectorTileService. This service is retained as a no-op for
 * facade compatibility.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapTileLayerService {
  initLayers(): void {
    // No-op: MapLibre manages tiles via vector tile source
  }

  isSatellite(): boolean {
    return false;
  }

  toggleSatellite(): void {
    // No-op
  }

  observeThemeChanges(): void {
    // No-op
  }

  destroy(): void {
    // No-op
  }
}
