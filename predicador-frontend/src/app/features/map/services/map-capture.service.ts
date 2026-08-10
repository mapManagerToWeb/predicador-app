import { Injectable, inject, DestroyRef } from '@angular/core';
import * as L from 'leaflet';
import { MAP_DEFAULTS } from '../utils/map-constants';
import { MapEngineService } from './map-engine.service';
import { MapTerritoryLayerService } from './map-territory-layer.service';
import { MapLayerRegistry } from './map-layer-registry.service';
import {
  getBaseTerritoryStyle,
  getCaptureUnmarkedStyle,
  getHiddenStyle,
  getMarkedManzanaStyle,
  getPartialPolygonCompleteStyle,
} from './map-style.service';
import type { ManzanaMarcada, FeatureLayer } from '../types/map.types';

/**
 * Manages screenshot capture preparation and post-capture restoration.
 *
 * <p>Injects low-level services directly (not the facade) to avoid
 * circular dependency: Facade → CaptureService → Facade.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapCaptureService {
  private engine = inject(MapEngineService);
  private territories = inject(MapTerritoryLayerService);
  private registry = inject(MapLayerRegistry);
  private readonly destroyRef = inject(DestroyRef);
  private captureTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.captureTimer !== null) clearTimeout(this.captureTimer);
    });
  }

  getAllTerritoriesLayer(): FeatureLayer[] {
    return this.territories.getAllTerritoriesLayer();
  }

  prepararCaptura(manzanasMarcadas: ManzanaMarcada[], territoriosSeleccionados: number[]): Promise<void> {
    const map = this.engine.getMap();
    if (!map) return Promise.resolve();

    const seleccionados = new Set(territoriosSeleccionados);
    const _markedLayers = new Set<L.Path>(
      manzanasMarcadas.map(m => this.registry.get(m.id)!).filter(Boolean)
    );
    const allTerritoriesLayer = this.territories.getAllTerritoriesLayer();
    const territoryLabels = this.territories.getTerritoryLabels();

    this.styleTerritoryLayers(allTerritoriesLayer, seleccionados, _markedLayers);
    this.stylePartialMarks(manzanasMarcadas, allTerritoriesLayer);
    this.updateLabelVisibility(territoryLabels, seleccionados);
    this.fitBoundsToSelection(map, seleccionados, manzanasMarcadas, allTerritoriesLayer);

    return new Promise<void>((resolve) => {
      this.captureTimer = setTimeout(() => {
        this.captureTimer = null;
        resolve();
      }, MAP_DEFAULTS.captureDelayMs);
    });
  }

  /**
   * Prepara captura SOLO para territorios INCOMPLETOS.
   * Los territorios completados se ocultan para la captura.
   */
  prepararCapturaSoloIncompletos(
    manzanasMarcadas: ManzanaMarcada[],
    territoriosSeleccionados: number[],
    allTerritoriesLayer: FeatureLayer[],
    getManzanaCountByTerritorio: (num: number) => number
  ): Promise<void> {
    const map = this.engine.getMap();
    if (!map) return Promise.resolve();

    // Filtrar solo territorios INCOMPLETOS
    const incompletos = new Set<number>();
    for (const num of territoriosSeleccionados) {
      const total = getManzanaCountByTerritorio(num);
      const marcadas = manzanasMarcadas.filter(m => m.territorioNumero === num && !m.id.startsWith('parcial-')).length;
      if (total > 0 && marcadas < total) {
        incompletos.add(num);
      }
    }

if (incompletos.size === 0) return Promise.resolve();

    const territoryLabels = this.territories.getTerritoryLabels();

    // Ocultar territorios completados
    this.styleTerritoryLayersSoloIncompletos(allTerritoriesLayer, incompletos);
    this.stylePartialMarks(manzanasMarcadas, allTerritoriesLayer);
    this.updateLabelVisibility(territoryLabels, incompletos);
    this.fitBoundsToSelection(map, incompletos, manzanasMarcadas, allTerritoriesLayer);

    return new Promise<void>((resolve) => {
      this.captureTimer = setTimeout(() => {
        this.captureTimer = null;
        resolve();
      }, MAP_DEFAULTS.captureDelayMs);
    });
  }

  /**
   * Aplica estilos de captura SOLO a territorios incompletos.
   * Los completados se ocultan.
   */
  private styleTerritoryLayersSoloIncompletos(
    allTerritoriesLayer: FeatureLayer[],
    incompletos: Set<number>
  ): void {
    for (const fl of allTerritoriesLayer) {
      if (incompletos.has(fl.territorioPadre)) {
        // Incompleto: estilo de captura (no marcado)
        fl.layer.eachLayer(l => {
          if (l instanceof L.Path) {
            l.setStyle({ opacity: 0.6, fillOpacity: 0.05, color: fl.color, weight: 1.5 });
          }
        });
      } else {
        // Completado: ocultar
        this.applyHiddenStyle(fl);
      }
    }
  }

  restaurarMapaPostCaptura(
    manzanasMarcadas: ManzanaMarcada[],
    territoriosSeleccionados: number[],
    modoMarcado: string
  ): void {
    const map = this.engine.getMap();
    if (!map) return;

    const seleccionados = new Set(territoriosSeleccionados);
    const allTerritoriesLayer = this.territories.getAllTerritoriesLayer();
    const territoryLabels = this.territories.getTerritoryLabels();

    this.restoreTerritoryLayers(allTerritoriesLayer, seleccionados, manzanasMarcadas, modoMarcado);
    this.fitBoundsToSelected(map, seleccionados, allTerritoriesLayer);
    this.restoreLabelVisibility(map, territoryLabels, seleccionados);
  }

  private styleTerritoryLayers(
    allTerritoriesLayer: FeatureLayer[],
    seleccionados: Set<number>,
    markedLayers: Set<L.Path>
  ): void {
    for (const fl of allTerritoriesLayer) {
      if (!seleccionados.has(fl.territorioPadre)) {
        this.applyHiddenStyle(fl);
        continue;
      }
      this.applySelectionStyle(fl, markedLayers);
    }
  }

  private applyHiddenStyle(fl: FeatureLayer): void {
    fl.layer.eachLayer(l => {
      if (l instanceof L.Path) l.setStyle(getHiddenStyle());
    });
  }

  private applySelectionStyle(fl: FeatureLayer, markedLayers: Set<L.Path>): void {
    fl.layer.eachLayer(l => {
      if (!(l instanceof L.Path)) return;
      const isMarked = markedLayers.has(l);
      l.setStyle(isMarked ? getMarkedManzanaStyle(fl.color) : getCaptureUnmarkedStyle(fl.color));
    });
  }

  private stylePartialMarks(manzanasMarcadas: ManzanaMarcada[], _allTerritoriesLayer: FeatureLayer[]): void {
    for (const m of manzanasMarcadas) {
      if (!m.id.startsWith('parcial-')) continue;
      const layer = this.registry.get(m.id);
      if (!layer) continue;
      const fl = this.territories.getFeatureLayerByTerritorio(m.territorioNumero);
      if (!fl) continue;
      layer.setStyle(getPartialPolygonCompleteStyle(fl.color));
    }
  }

  private updateLabelVisibility(territoryLabels: L.Marker[], seleccionados: Set<number>): void {
    for (const lbl of territoryLabels) {
      const el = lbl.getElement();
      if (!el) continue;
      const text = el.querySelector('.territory-label__text')?.textContent;
      const num = text ? Number(text) : Number.NaN;
      lbl.setOpacity(seleccionados.has(num) ? 1 : 0);
    }
  }

  private fitBoundsToSelection(
    map: L.Map,
    seleccionados: Set<number>,
    manzanasMarcadas: ManzanaMarcada[],
    allTerritoriesLayer: FeatureLayer[]
  ): void {
    const combined = this.calculateCombinedBounds(seleccionados, manzanasMarcadas, allTerritoriesLayer);
    if (combined) {
      map.fitBounds(combined, { padding: MAP_DEFAULTS.capturePadding });
    }
  }

  private calculateCombinedBounds(
    seleccionados: Set<number>,
    manzanasMarcadas: ManzanaMarcada[],
    allTerritoriesLayer: FeatureLayer[]
  ): L.LatLngBounds | null {
    let combined = this.getBoundsFromSelectedTerritories(seleccionados, allTerritoriesLayer);
    if (!combined) {
      combined = this.getBoundsFromMarkedManzanas(manzanasMarcadas);
    }
    return combined;
  }

  private getBoundsFromSelectedTerritories(seleccionados: Set<number>, _allTerritoriesLayer: FeatureLayer[]): L.LatLngBounds | null {
    let combined: L.LatLngBounds | null = null;
    for (const num of seleccionados) {
      const fl = this.territories.getFeatureLayerByTerritorio(num);
      if (!fl) continue;
      const b = fl.layer.getBounds();
      if (b.isValid()) {
        combined = combined ? combined.extend(b) : b;
      }
    }
    return combined;
  }

  private getBoundsFromMarkedManzanas(manzanasMarcadas: ManzanaMarcada[]): L.LatLngBounds | null {
    let combined: L.LatLngBounds | null = null;
    for (const m of manzanasMarcadas) {
      const layer = this.registry.get(m.id);
      if (!(layer instanceof L.Polygon)) continue;
      const b = layer.getBounds();
      if (b.isValid()) {
        combined = combined ? combined.extend(b) : b;
      }
    }
    return combined;
  }

  private restoreTerritoryLayers(
    allTerritoriesLayer: FeatureLayer[],
    seleccionados: Set<number>,
    manzanasMarcadas: ManzanaMarcada[],
    modoMarcado: string
  ): void {
    for (const fl of allTerritoriesLayer) {
      if (!seleccionados.has(fl.territorioPadre)) {
        this.applyVisibilityStyle(fl, modoMarcado);
        continue;
      }
      this.applyRestoredSelectionStyle(fl, manzanasMarcadas);
    }
  }

  private applyVisibilityStyle(fl: FeatureLayer, modoMarcado: string): void {
    const isVisible = modoMarcado === 'none';
    fl.layer.eachLayer(l => {
      if (l instanceof L.Path) {
        l.setStyle(isVisible ? getBaseTerritoryStyle(fl.color, false) : getHiddenStyle());
      }
    });
  }

  private applyRestoredSelectionStyle(fl: FeatureLayer, _manzanasMarcadas: ManzanaMarcada[]): void {
    fl.layer.eachLayer(l => {
      if (!(l instanceof L.Path)) return;
      const isMarked = this.registry.hasLayer(l);
      if (!isMarked) {
        l.setStyle(getBaseTerritoryStyle(fl.color, false));
      }
    });
  }

  private fitBoundsToSelected(map: L.Map, seleccionados: Set<number>, allTerritoriesLayer: FeatureLayer[]): void {
    const combined = this.getBoundsFromSelectedTerritories(seleccionados, allTerritoriesLayer);
    if (combined?.isValid()) {
      map.fitBounds(combined, { padding: MAP_DEFAULTS.boundsPadding });
    }
  }

  private restoreLabelVisibility(map: L.Map, territoryLabels: L.Marker[], seleccionados: Set<number>): void {
    const zoomVisible = map.getZoom() >= MAP_DEFAULTS.labelMinZoom;
    if (seleccionados.size > 0 && zoomVisible) {
      this.showSelectedLabels(territoryLabels, seleccionados);
    } else {
      this.showAllLabels(territoryLabels, zoomVisible);
    }
  }

  private showSelectedLabels(territoryLabels: L.Marker[], seleccionados: Set<number>): void {
    for (const lbl of territoryLabels) {
      const el = lbl.getElement();
      if (!el) continue;
      const text = el.querySelector('.territory-label__text')?.textContent;
      lbl.setOpacity(text && seleccionados.has(Number(text)) ? 1 : 0);
    }
  }

  private showAllLabels(territoryLabels: L.Marker[], zoomVisible: boolean): void {
    for (const lbl of territoryLabels) {
      lbl.setOpacity(zoomVisible ? 1 : 0);
    }
  }
}
