import { isPlatformBrowser } from '@angular/common';
import type { MapEngine } from './map-engine.interface';
import type { MapEngineChoice } from './map-state.service';

/**
 * Checks whether WebGL2 is available in the current browser.
 */
export function isWebGL2Available(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

/**
 * Whether the given engine choice resolves to MapLibre (rather than Leaflet).
 */
export function shouldUseMapLibre(
  choice: MapEngineChoice,
): boolean {
  return choice === 'maplibre' || (choice === 'auto' && isWebGL2Available());
}

/**
 * Dynamically creates a MapLibre engine instance.
 *
 * <p>Must only be called when {@link shouldUseMapLibre} returns `true`.
 * The import is dynamic so MapLibre never enters the server bundle.</p>
 *
 * @param platformId - The Angular PLATFORM_ID token (from inject()).
 */
export async function createMaplibreEngine(
  platformId: object,
): Promise<MapEngine> {
  if (!isPlatformBrowser(platformId)) {
    throw new Error('MapLibre engine requires a browser platform');
  }

  const { MaplibreEngineService } = await import(
    './maplibre-engine.service'
  );
  return new MaplibreEngineService();
}
