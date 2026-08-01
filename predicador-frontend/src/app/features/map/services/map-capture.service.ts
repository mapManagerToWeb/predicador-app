import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import { MAP_DEFAULTS, STYLE_DEFAULTS } from '../utils/map-constants';
import { MapEngineService } from './map-engine.service';
import { MapTerritoryLayerService } from './map-territory-layer.service';
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

  prepararCaptura(manzanasMarcadas: ManzanaMarcada[], territoriosSeleccionados: number[]): Promise<void> {
    const map = this.engine.getMap();
    if (!map) return Promise.resolve();

    const seleccionados = new Set(territoriosSeleccionados);
    const markedLayers = new Set(manzanasMarcadas.map(m => m.layer));
    const allTerritoriesLayer = this.territories.getAllTerritoriesLayer();
    const territoryLabels = this.territories.getTerritoryLabels();

    this.styleTerritoryLayers(allTerritoriesLayer, seleccionados, markedLayers);
    this.stylePartialMarks(manzanasMarcadas, allTerritoriesLayer);
    this.updateLabelVisibility(territoryLabels, seleccionados);
    this.fitBoundsToSelection(map, seleccionados, manzanasMarcadas, allTerritoriesLayer);

    return new Promise(resolve =>
      requestAnimationFrame(() => setTimeout(resolve, MAP_DEFAULTS.captureDelayMs))
    );
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
      if (l instanceof L.Path) l.setStyle(STYLE_DEFAULTS.hiddenPolygon);
    });
  }

  private applySelectionStyle(fl: FeatureLayer, markedLayers: Set<L.Path>): void {
    fl.layer.eachLayer(l => {
      if (!(l instanceof L.Path)) return;
      const isMarked = markedLayers.has(l as unknown as L.Path);
      l.setStyle(isMarked ? this.getMarkedStyle(fl.color) : this.getUnmarkedStyle(fl.color));
    });
  }

  private getMarkedStyle(color: string): L.PathOptions {
    return {
      fillColor: color,
      fillOpacity: STYLE_DEFAULTS.markedPolygon.fillOpacity,
      color,
      weight: STYLE_DEFAULTS.polygon.weight,
      opacity: 1,
    };
  }

  private getUnmarkedStyle(color: string): L.PathOptions {
    return {
      opacity: 0.6,
      fillOpacity: 0.05,
      color,
      weight: 1.5,
    };
  }

  private stylePartialMarks(manzanasMarcadas: ManzanaMarcada[], allTerritoriesLayer: FeatureLayer[]): void {
    for (const m of manzanasMarcadas) {
      if (!m.id.startsWith('parcial-')) continue;
      if (!(m.layer instanceof L.Path)) continue;
      const fl = allTerritoriesLayer.find(f => f.territorioPadre === m.territorioNumero);
      if (!fl) continue;
      m.layer.setStyle({
        fillColor: fl.color,
        fillOpacity: STYLE_DEFAULTS.partialPolygonComplete.fillOpacity,
        color: fl.color,
        weight: STYLE_DEFAULTS.partialPolygonComplete.weight,
        opacity: 1,
      });
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

  private getBoundsFromSelectedTerritories(seleccionados: Set<number>, allTerritoriesLayer: FeatureLayer[]): L.LatLngBounds | null {
    let combined: L.LatLngBounds | null = null;
    for (const num of seleccionados) {
      const fl = allTerritoriesLayer.find(f => f.territorioPadre === num);
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
      if (!(m.layer instanceof L.Polygon)) continue;
      const b = m.layer.getBounds();
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
        l.setStyle({
          opacity: isVisible ? 1 : 0,
          fillOpacity: isVisible ? 0.05 : 0,
          color: fl.color,
          weight: STYLE_DEFAULTS.polygon.weight,
        });
      }
    });
  }

  private applyRestoredSelectionStyle(fl: FeatureLayer, manzanasMarcadas: ManzanaMarcada[]): void {
    fl.layer.eachLayer(l => {
      if (!(l instanceof L.Path)) return;
      const isMarked = manzanasMarcadas.some(m => m.layer === l);
      if (!isMarked) {
        l.setStyle({
          opacity: 1,
          fillOpacity: 0.05,
          color: fl.color,
          weight: STYLE_DEFAULTS.polygon.weight,
        });
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
