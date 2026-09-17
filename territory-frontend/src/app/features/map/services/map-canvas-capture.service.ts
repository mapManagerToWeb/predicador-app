import { Injectable } from '@angular/core';

/**
 * Renders the current map state to an offscreen canvas.
 *
 * <p>In MapLibre-only mode, capture uses html-to-image or similar
 * approach. This service is retained as a no-op for compatibility.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapCanvasCaptureService {
  async capture(): Promise<string | null> {
    // No-op: MapLibre capture uses a different rendering path
    return null;
  }
}
