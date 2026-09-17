import { Injectable, OnDestroy } from '@angular/core';
import { STYLE_DEFAULTS } from '../utils/map-constants';
import { getTerritoryFillOpacity } from '../../../core/models/territory-colors';
import type { FeatureLayer, ManzanaMarcada } from '../types/map.types';

/** Style options for territory layers — replaces Leaflet's PathOptions. */
export interface PathOptions {
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  weight?: number;
  opacity?: number;
  stroke?: boolean;
  dashArray?: string;
}

// ─── Pure style functions (the single source of truth) ──────────────
// Every style decision in the map feature funnels through these. They are
// deliberately pure (no map library objects) so the interface is the test surface:
// what the tests assert is exactly what production renders.

export function getBaseTerritoryStyle(color: string, isComplete: boolean): PathOptions {
  return {
    fillColor: color,
    fillOpacity: getTerritoryFillOpacity(isComplete),
    opacity: 1,
    color,
    weight: STYLE_DEFAULTS.polygon.weight,
    stroke: true,
  };
}

export function getMarkedManzanaStyle(color: string): PathOptions {
  return {
    fillColor: color,
    fillOpacity: STYLE_DEFAULTS.markedPolygon.fillOpacity,
    opacity: 1,
    color,
    weight: STYLE_DEFAULTS.polygon.weight,
    stroke: true,
  };
}

const HIDDEN_STYLE: PathOptions = Object.freeze({ ...STYLE_DEFAULTS.hiddenPolygon });
export function getHiddenStyle(): PathOptions {
  return HIDDEN_STYLE;
}

export function getSelectedManzanaStyle(): PathOptions {
  return { ...STYLE_DEFAULTS.selectedManzana };
}

export function getPartialPolygonStyle(color: string, dashed: boolean): PathOptions {
  return {
    color,
    fillColor: color,
    fillOpacity: STYLE_DEFAULTS.partialPolygon.fillOpacity,
    weight: STYLE_DEFAULTS.partialPolygon.weight,
    dashArray: dashed ? STYLE_DEFAULTS.partialPolygon.dashArray : undefined,
  };
}

export function getPartialPolygonCompleteStyle(color: string): PathOptions {
  return {
    color,
    fillColor: color,
    fillOpacity: STYLE_DEFAULTS.partialPolygonComplete.fillOpacity,
    weight: STYLE_DEFAULTS.partialPolygonComplete.weight,
    dashArray: undefined,
  };
}

export function getCaptureUnmarkedStyle(color: string): PathOptions {
  return { opacity: 0.6, fillOpacity: 0.05, color, weight: 1.5 };
}

export function getCaptureIncompleteStyle(color: string): PathOptions {
  return { opacity: 0.8, fillOpacity: 0.05, color, weight: 4 };
}

/**
 * Centralizes visual styles and requestAnimationFrame batching.
 *
 * <p>In MapLibre-only mode, the apply* methods are no-ops — territory
 * styling is handled by data-driven tile layers. The queue/cancel
 * mechanism remains functional for batched style operations.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapStyleService implements OnDestroy {
  private pendingStyleFrame: number | null = null;
  private pendingStyleQueue: Array<() => void> = [];

  queueStyleUpdate(fn: () => void): void {
    this.pendingStyleQueue.push(fn);
    this.pendingStyleFrame ??= requestAnimationFrame(() => {
      this.pendingStyleFrame = null;
      const queue = this.pendingStyleQueue;
      this.pendingStyleQueue = [];
      for (const task of queue) task();
    });
  }

  cancelPendingStyleUpdates(): void {
    if (this.pendingStyleFrame !== null) {
      cancelAnimationFrame(this.pendingStyleFrame);
      this.pendingStyleFrame = null;
    }
    this.pendingStyleQueue = [];
  }

  applyStyleToFeatureLayer(_fl: FeatureLayer, _style: PathOptions | ((fl: FeatureLayer) => PathOptions)): void {
    // No-op: MapLibre uses data-driven tile styling
  }

  applyBaseTerritoryStyle(
    _allTerritoriesLayer: FeatureLayer[],
    _manzanaIndex: Array<{ territorioNumero: number }>,
    _territorioNumero: number,
    _color: string,
    _marcadasCount: number,
    _options: { total?: number; isComplete?: boolean } = {}
  ): void {
    // No-op: MapLibre uses data-driven tile styling
  }

  reaplicarMarcasTerritorio(
    _allTerritoriesLayer: FeatureLayer[],
    _manzanaIndex: Array<{ territorioNumero: number }>,
    _manzanasMarcadas: ManzanaMarcada[],
    _territorioNumeros: number[]
  ): void {
    // No-op: MapLibre handles marks via GPU picking
  }

  limpiarMarcasVisuales(_allTerritoriesLayer: FeatureLayer[]): void {
    // No-op: MapLibre handles marks via GPU picking
  }

  ngOnDestroy(): void {
    this.cancelPendingStyleUpdates();
  }
}
