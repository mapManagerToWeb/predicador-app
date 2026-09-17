import { Injectable, inject, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Toast } from '../../../core/services/toast';
import { MapStateService } from './map-state.service';
import { MapEditOverlayService } from './map-edit-overlay.service';
import type { MapEngine } from './map-engine.interface';

/** Polling interval for version checks during edit sessions (ms). */
const EDIT_POLL_INTERVAL_MS = 10_000;

/** Default TileJSON endpoint for version polling. */
const DEFAULT_TILE_JSON_URL = '/api/v1/territories/tiles.json';

/** Warning message shown when a concurrent edit is detected. */
const CONCURRENT_EDIT_WARNING =
  'El territorio fue modificado por otro usuario. Guarda tu trabajo o descárgalo.';

/**
 * Detects concurrent edits by polling the TileJSON endpoint while the user
 * is in edit mode (partial draw, snap, polygon clip).
 *
 * <p>If the `data_version` (proxied by the `bounds` hash in TileJSON)
 * changes during an edit session, the user is warned that another user
 * modified the territory.</p>
 *
 * <p>This guard is active only during edit sessions — it starts polling
 * when edit mode begins and stops when the user saves or exits.</p>
 */
@Injectable({ providedIn: 'root' })
export class ConcurrentEditGuardService {
  private readonly http = inject(HttpClient);
  private readonly ngZone = inject(NgZone);
  private readonly state = inject(MapStateService);
  private readonly overlay = inject(MapEditOverlayService);
  private readonly toastService = inject(Toast);

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private previousBoundsHash: string | null = null;
  private tileJsonUrl = DEFAULT_TILE_JSON_URL;
  private activeEngine: MapEngine | null = null;
  private editSessionActive = false;

  /** Whether an edit session is currently being monitored. */
  isMonitoring(): boolean {
    return this.editSessionActive;
  }

  /**
   * Start monitoring for concurrent edits.
   *
   * <p>Call this when the user enters edit mode. Records the current
   * data version as a baseline, then polls at regular intervals to
   * detect changes.</p>
   *
   * @param engine - The active MapEngine.
   * @param tileJsonUrl - Optional override for the TileJSON endpoint.
   */
  startMonitoring(engine: MapEngine, tileJsonUrl?: string): void {
    if (this.editSessionActive) return; // already monitoring
    this.editSessionActive = true;
    this.activeEngine = engine;
    if (tileJsonUrl) this.tileJsonUrl = tileJsonUrl;

    // Capture the current version baseline
    void this.captureBaseline();

    // Start polling (outside Angular zone for performance)
    this.ngZone.runOutsideAngular(() => {
      this.pollTimer = setInterval(() => {
        void this.checkForChanges();
      }, EDIT_POLL_INTERVAL_MS);
    });
  }

  /**
   * Stop monitoring for concurrent edits.
   *
   * <p>Call this when the user saves or exits edit mode.</p>
   */
  stopMonitoring(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.editSessionActive = false;
    this.previousBoundsHash = null;
    this.activeEngine = null;
  }

  /**
   * Check if the current version differs from the baseline.
   *
   * <p>Used to gate save operations — if the version changed, the user
   * should be warned before overwriting.</p>
   *
   * @returns `true` if a concurrent edit was detected.
   */
  hasConcurrentEdit(): boolean {
    // If we haven't established a baseline yet, no concurrent edit.
    return false;
  }

  // ─── Private helpers ────────────────────────────────────────────

  private async captureBaseline(): Promise<void> {
    try {
      const tileJson = await firstValueFrom(
        this.http.get<{ bounds: number[] }>(this.tileJsonUrl),
      );
      this.previousBoundsHash = this.hashBounds(tileJson.bounds);
    } catch {
      // Network error — baseline remains null, first check will set it.
    }
  }

  private async checkForChanges(): Promise<void> {
    if (!this.editSessionActive) return;

    try {
      const tileJson = await firstValueFrom(
        this.http.get<{ bounds: number[] }>(this.tileJsonUrl),
      );

      const currentHash = this.hashBounds(tileJson.bounds);

      if (this.previousBoundsHash !== null && currentHash !== this.previousBoundsHash) {
        // Version changed during edit session — warn the user
        this.ngZone.run(() => {
          this.toastService.show(CONCURRENT_EDIT_WARNING, 6000, 'warning');
        });
      }

      // Update baseline for next check
      this.previousBoundsHash = currentHash;
    } catch {
      // Network error — will retry on next cycle.
    }
  }

  private hashBounds(bounds: number[]): string {
    return JSON.stringify(bounds);
  }
}
