import { Injectable, OnDestroy, inject } from '@angular/core';
import * as L from 'leaflet';
import { STYLE_DEFAULTS } from '../utils/map-constants';
import { getTerritoryFillOpacity } from '../utils/territory-colors';
import { MapLayerRegistry } from './map-layer-registry.service';
import type { FeatureLayer, ManzanaMarcada } from '../types/map.types';

// ─── Pure style functions (the single source of truth) ──────────────
// Every style decision in the map feature funnels through these. They are
// deliberately pure (no Leaflet objects) so the interface is the test surface:
// what the tests assert is exactly what production renders.

export function getBaseTerritoryStyle(color: string, isComplete: boolean): L.PathOptions {
  return {
    fillColor: color,
    fillOpacity: getTerritoryFillOpacity(isComplete),
    opacity: 1,
    color,
    weight: STYLE_DEFAULTS.polygon.weight,
    stroke: true,
  };
}

export function getMarkedManzanaStyle(color: string): L.PathOptions {
  return {
    fillColor: color,
    fillOpacity: STYLE_DEFAULTS.markedPolygon.fillOpacity,
    opacity: 1,
    color,
    weight: STYLE_DEFAULTS.polygon.weight,
    stroke: true,
  };
}

// Singleton — Leaflet reads but never mutates the passed style object, so
// returning a frozen constant avoids one allocation per hidden territory per frame.
const HIDDEN_STYLE: L.PathOptions = Object.freeze({ ...STYLE_DEFAULTS.hiddenPolygon });
export function getHiddenStyle(): L.PathOptions {
  return HIDDEN_STYLE;
}

export function getSelectedManzanaStyle(): L.PathOptions {
  return { ...STYLE_DEFAULTS.selectedManzana };
}

export function getPartialPolygonStyle(color: string, dashed: boolean): L.PathOptions {
  return {
    color,
    fillColor: color,
    fillOpacity: STYLE_DEFAULTS.partialPolygon.fillOpacity,
    weight: STYLE_DEFAULTS.partialPolygon.weight,
    dashArray: dashed ? STYLE_DEFAULTS.partialPolygon.dashArray : undefined,
  };
}

export function getPartialPolygonCompleteStyle(color: string): L.PathOptions {
  return {
    color,
    fillColor: color,
    fillOpacity: STYLE_DEFAULTS.partialPolygonComplete.fillOpacity,
    weight: STYLE_DEFAULTS.partialPolygonComplete.weight,
    dashArray: undefined,
  };
}

export function getCaptureUnmarkedStyle(color: string): L.PathOptions {
  return { opacity: 0.6, fillOpacity: 0.05, color, weight: 1.5 };
}

/**
 * Centralizes visual styles and requestAnimationFrame batching.
 *
 * <p>Provides queueStyleUpdate() and cancelPendingStyleUpdates() for
 * batching DOM-heavy style operations to avoid layout thrashing.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapStyleService implements OnDestroy {
  private pendingStyleFrame: number | null = null;
  private pendingStyleQueue: Array<() => void> = [];
  private readonly registry = inject(MapLayerRegistry);

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

  applyStyleToFeatureLayer(fl: FeatureLayer, style: L.PathOptions | ((fl: FeatureLayer) => L.PathOptions)): void {
    const resolved = typeof style === 'function' ? style(fl) : style;
    fl.layer.eachLayer(l => {
      if (l instanceof L.Path) l.setStyle(resolved);
    });
  }

  applyBaseTerritoryStyle(
    allTerritoriesLayer: FeatureLayer[],
    manzanaIndex: Array<{ territorioNumero: number }>,
    territorioNumero: number,
    color: string,
    marcadasCount: number,
    options: { total?: number; isComplete?: boolean } = {}
  ): void {
    const total = options.total ?? manzanaIndex.filter(m => m.territorioNumero === territorioNumero).length;
    const isComplete = options.isComplete ?? (total > 0 && marcadasCount >= total);
    const style = getBaseTerritoryStyle(color, isComplete);

    for (const fl of allTerritoriesLayer) {
      if (fl.territorioPadre !== territorioNumero) continue;
      this.applyStyleToFeatureLayer(fl, style);
    }
  }

  reaplicarMarcasTerritorio(
    allTerritoriesLayer: FeatureLayer[],
    manzanaIndex: Array<{ territorioNumero: number }>,
    manzanasMarcadas: ManzanaMarcada[],
    territorioNumeros: number[]
  ): void {
    for (const num of territorioNumeros) {
      const featureLayer = allTerritoriesLayer.find(f => f.territorioPadre === num);
      if (!featureLayer) continue;

      const total = manzanaIndex.filter(m => m.territorioNumero === num).length;
      const marcadas = manzanasMarcadas.filter(m => m.territorioNumero === num).length;
      const isComplete = total > 0 && marcadas >= total;

      this.applyStyleToFeatureLayer(featureLayer, getBaseTerritoryStyle(featureLayer.color, isComplete));

      const marcadasLayers = manzanasMarcadas.filter(m => m.territorioNumero === num);
      for (const m of marcadasLayers) {
        const layer = this.registry.get(m.id);
        if (layer) layer.setStyle(getMarkedManzanaStyle(featureLayer.color));
      }
    }
  }

  limpiarMarcasVisuales(allTerritoriesLayer: FeatureLayer[]): void {
    for (const fl of allTerritoriesLayer) {
      this.applyStyleToFeatureLayer(fl, getBaseTerritoryStyle(fl.color, false));
    }
  }

  ngOnDestroy(): void {
    this.cancelPendingStyleUpdates();
  }
}
