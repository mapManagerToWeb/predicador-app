import { Injectable } from '@angular/core';
import { Path } from 'leaflet';

/**
 * Seam that resolves a marked manzana's id to its live Leaflet layer.
 *
 * <p>This is the adapter behind the state module. Production uses the real
 * registry (backed by a Map). Tests can use the same registry with fake
 * layer objects — no Leaflet dependency required to construct it.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapLayerRegistry {
  private readonly layers = new Map<string, Path>();

  get(id: string): Path | null {
    return this.layers.get(id) ?? null;
  }

  register(id: string, layer: Path): void {
    this.layers.set(id, layer);
  }

  unregister(id: string): void {
    this.layers.delete(id);
  }

  clear(): void {
    this.layers.clear();
  }

  /** Checks if a given live layer is currently tracked as marked. */
  hasLayer(layer: Path): boolean {
    for (const l of this.layers.values()) if (l === layer) return true;
    return false;
  }

  /** All currently tracked layers (for capture's markedLayers set). */
  values(): Iterable<Path> {
    return this.layers.values();
  }
}