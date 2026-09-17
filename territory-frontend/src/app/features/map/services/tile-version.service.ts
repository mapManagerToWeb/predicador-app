import { Injectable, inject, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { MapEngine } from './map-engine.interface';
import { MapVectorTileService } from './map-vector-tile.service';

/** TileJSON 3.0 response shape (subset we care about). */
interface TileJsonResponse {
  tilejson: string;
  bounds: number[];
  tiles: string[];
}

/** Default polling interval for data version checks (ms). */
const POLL_INTERVAL_MS = 30_000;

/** Default endpoint for the TileJSON metadata. */
const DEFAULT_TILE_JSON_URL = '/api/v1/territories/tiles.json';

/**
 * Detects data version changes by polling the TileJSON endpoint and
 * refreshing the vector tile source URL when new data is available.
 *
 * <p>Polling is driven by two mechanisms:
 * <ul>
 *   <li>A 30-second interval timer.</li>
 *   <li>The {@linkcode visibilitychange} event — more efficient than
 *       polling when the tab is hidden.</li>
 * </ul>
 *
 * <p>Version detection uses the `bounds` array from the TileJSON response
 * as a proxy for data_version (bounds change when territories are
 * added/removed). A cache-busting `?v=` parameter is appended to the
 * tile URL template so the browser re-fetches affected tiles.</p>
 */
@Injectable({ providedIn: 'root' })
export class TileVersionService {
  private readonly http = inject(HttpClient);
  private readonly ngZone = inject(NgZone);
  private readonly vectorTile = inject(MapVectorTileService);

  private tileJsonUrl = DEFAULT_TILE_JSON_URL;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private previousBoundsHash: string | null = null;
  private engine: MapEngine | null = null;

  /** Start polling for tile version changes. */
  startPolling(engine: MapEngine, tileJsonUrl?: string): void {
    if (this.pollTimer !== null) return; // already running
    this.engine = engine;
    if (tileJsonUrl) this.tileJsonUrl = tileJsonUrl;

    // Initial fetch (outside Angular zone to avoid unnecessary change detection)
    void this.checkVersion();

    // Set up interval polling (run outside zone for perf)
    this.ngZone.runOutsideAngular(() => {
      this.pollTimer = setInterval(() => {
        void this.checkVersion();
      }, POLL_INTERVAL_MS);

      // Also listen for visibility changes — when the tab becomes visible
      // again, check immediately for fresher data.
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    });
  }

  /** Stop polling and clean up resources. */
  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.engine = null;
    this.previousBoundsHash = null;
  }

  /** Whether polling is currently active. */
  isPolling(): boolean {
    return this.pollTimer !== null;
  }

  // ─── Private helpers ────────────────────────────────────────────

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      void this.checkVersion();
    }
  };

  private async checkVersion(): Promise<void> {
    if (!this.engine) return;

    try {
      const tileJson = await firstValueFrom(
        this.http.get<TileJsonResponse>(this.tileJsonUrl),
      );

      const boundsHash = this.hashBounds(tileJson.bounds);

      if (this.previousBoundsHash !== null && boundsHash !== this.previousBoundsHash) {
        // Data changed — update tile URL with cache-busting version param.
        const newUrl = this.buildVersionedTileUrl(tileJson.tiles[0]);
        this.vectorTile.updateTileUrl(this.engine, newUrl);
      }

      this.previousBoundsHash = boundsHash;
    } catch (err: unknown) {
      // 404 or network error — warn and retry on next cycle.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[TileVersionService] TileJSON fetch failed, will retry: ${message}`);
    }
  }

  /**
   * Hash the bounds array into a stable string for change detection.
   * Uses JSON.stringify — bounds is always a 4-element number array.
   */
  private hashBounds(bounds: number[]): string {
    return JSON.stringify(bounds);
  }

  /**
   * Append a cache-busting `?v=` parameter to the tile URL template.
   * Uses `Date.now()` so each version bump produces a unique URL.
   */
  private buildVersionedTileUrl(tileUrl: string): string {
    const version = Date.now();
    const separator = tileUrl.includes('?') ? '&' : '?';
    return `${tileUrl}${separator}v=${version}`;
  }
}
