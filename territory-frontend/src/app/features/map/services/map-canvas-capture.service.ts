import { Injectable } from '@angular/core';
import type { MapEngine } from './map-engine.interface';

/**
 * Renders the current map state to a JPEG base64 screenshot.
 *
 * <p>The capture is delegated to the active {@link MapEngine} (attached by
 * MapPage once the MapLibre engine is created, cleared on destroy) so the
 * WhatsApp screenshot shows the real rendered map — tiles, marked overlay
 * and all. No DOM serialization: `MapEngine.captureCanvas()` reads the
 * WebGL canvas directly (bug fix "screenshot WhatsApp").</p>
 */
@Injectable({ providedIn: 'root' })
export class MapCanvasCaptureService {
  private engine: MapEngine | null = null;

  /**
   * Attach the engine to capture from. Pass null when the map is destroyed
   * so a stale engine reference cannot be captured after teardown.
   */
  setEngine(engine: MapEngine | null): void {
    this.engine = engine;
  }

  /**
   * Capture the current map state as JPEG base64 (without the `data:`
   * prefix), or null when no engine is attached / capture fails.
   */
  async capture(): Promise<string | null> {
    return this.engine?.captureCanvas() ?? null;
  }
}
