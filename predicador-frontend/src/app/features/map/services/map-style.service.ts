import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import { STYLE_DEFAULTS } from '../utils/map-constants';
import { getTerritoryFillOpacity } from '../utils/territory-colors';
import type { FeatureLayer, ManzanaMarcada } from '../types/map.types';

// ─── Pure style functions (testable without Leaflet) ────────────────

export function getBaseTerritoryStyle(
  color: string,
  isComplete: boolean
): L.PathOptions {
  return {
    opacity: 1,
    fillOpacity: getTerritoryFillOpacity(isComplete),
    color,
    weight: STYLE_DEFAULTS.polygon.weight,
  };
}

export function getMarkedManzanaStyle(color: string): L.PathOptions {
  return {
    fillColor: color,
    fillOpacity: STYLE_DEFAULTS.markedPolygon.fillOpacity,
    color,
    weight: STYLE_DEFAULTS.polygon.weight,
  };
}

export function getHiddenStyle(): L.PathOptions {
  return { ...STYLE_DEFAULTS.hiddenPolygon };
}

export function getSelectedManzanaStyle(color: string): L.PathOptions {
  return {
    weight: STYLE_DEFAULTS.selectedManzana.weight,
    color: STYLE_DEFAULTS.selectedManzana.color,
    fillColor: color,
    fillOpacity: STYLE_DEFAULTS.selectedManzana.fillOpacity,
  };
}

/**
 * Centralizes visual styles and requestAnimationFrame batching.
 *
 * <p>Provides queueStyleUpdate() and cancelPendingStyleUpdates() for
 * batching DOM-heavy style operations to avoid layout thrashing.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapStyleService {
  private pendingStyleFrame: number | null = null;
  private pendingStyleQueue: Array<() => void> = [];

  queueStyleUpdate(fn: () => void): void {
    this.pendingStyleQueue.push(fn);
    if (this.pendingStyleFrame === null) {
      this.pendingStyleFrame = requestAnimationFrame(() => {
        this.pendingStyleFrame = null;
        const queue = this.pendingStyleQueue;
        this.pendingStyleQueue = [];
        for (const fn of queue) fn();
      });
    }
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
    const fillOpacity = getTerritoryFillOpacity(isComplete);

    for (const fl of allTerritoriesLayer) {
      if (fl.territorioPadre !== territorioNumero) continue;
      fl.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          l.setStyle({ fillColor: color, fillOpacity, opacity: 1, color, weight: STYLE_DEFAULTS.polygon.weight, stroke: true });
        }
      });
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
      const fillOpacity = getTerritoryFillOpacity(isComplete);

      this.applyStyleToFeatureLayer(featureLayer, {
        fillOpacity,
        opacity: 1,
        weight: STYLE_DEFAULTS.polygon.weight,
        fillColor: featureLayer.color,
        color: featureLayer.color,
        stroke: true,
      });

      const marcadasLayers = manzanasMarcadas.filter(m => m.territorioNumero === num);
      for (const m of marcadasLayers) {
        m.layer.setStyle({
          fillColor: featureLayer.color,
          fillOpacity: STYLE_DEFAULTS.markedPolygon.fillOpacity,
          color: featureLayer.color,
          weight: STYLE_DEFAULTS.polygon.weight,
          stroke: true,
        });
      }
    }
  }

  limpiarMarcasVisuales(allTerritoriesLayer: FeatureLayer[]): void {
    for (const fl of allTerritoriesLayer) {
      this.applyStyleToFeatureLayer(fl, {
        fillColor: fl.color,
        fillOpacity: STYLE_DEFAULTS.polygon.fillOpacity,
        color: fl.color,
        weight: STYLE_DEFAULTS.polygon.weight,
        opacity: 1,
        stroke: true,
      });
    }
  }

  ngOnDestroy(): void {
    this.cancelPendingStyleUpdates();
  }
}
