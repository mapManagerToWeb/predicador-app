import { Injectable } from '@angular/core';
import * as L from 'leaflet';

/**
 * Seam that resolves a marked manzana's id to its live Leaflet layer.
 *
 * <p>This is the adapter behind the state module. Production uses the real
 * registry (backed by a Map). Tests can use the same registry with fake
 * layer objects — no Leaflet dependency required to construct it.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapLayerRegistry {
  private readonly layers = new Map<string, L.Path>();

  get(id: string): L.Path | null {
    return this.layers.get(id) ?? null;
  }

  register(id: string, layer: L.Path): void {
    this.layers.set(id, layer);
  }

  unregister(id: string): void {
    this.layers.delete(id);
  }

  clear(): void {
    this.layers.clear();
  }

  /** Checks if a given live layer is currently tracked as marked. */
  hasLayer(layer: L.Path): boolean {
    for (const l of this.layers.values()) if (l === layer) return true;
    return false;
  }

  /** All currently tracked layers (for capture's markedLayers set). */
  values(): Iterable<L.Path> {
    return this.layers.values();
  }
}