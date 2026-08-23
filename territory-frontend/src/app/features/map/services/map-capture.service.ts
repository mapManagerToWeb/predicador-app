import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import { MAP_DEFAULTS } from '../utils/map-constants';
import { MapEngineService } from './map-engine.service';
import { MapTerritoryLayerService } from './map-territory-layer.service';
import { MapLayerRegistry } from './map-layer-registry.service';
import {
  getBaseTerritoryStyle,
  getCaptureUnmarkedStyle,
  getCaptureIncompleteStyle,
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

  /**
   * Waits for all visible tile images to finish loading.
   * Returns when every <img> in the tile pane has complete=true,
   * or after MAX_TILE_WAIT_MS (whichever comes first).
   */
  waitForTiles(map: L.Map): Promise<void> {
    const container = map.getContainer();
    const tiles = Array.from(
      container.querySelectorAll('.leaflet-tile-pane img')
    ) as HTMLImageElement[];

    if (tiles.length === 0) return Promise.resolve();

    const allLoaded = () => tiles.every(t => t.complete);
    if (allLoaded()) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve();
      };

      const timeout = setTimeout(done, MAP_DEFAULTS.maxTileWaitMs);

      const cleanup = () => {
        clearTimeout(timeout);
        for (const tile of tiles) {
          tile.removeEventListener('load', check);
          tile.removeEventListener('error', check);
        }
      };

      const check = () => {
        if (allLoaded()) done();
      };

      for (const tile of tiles) {
        if (!tile.complete) {
          tile.addEventListener('load', check);
          tile.addEventListener('error', check);
        }
      }

      // Also check after a frame (in case tiles finish between checks)
      requestAnimationFrame(() => {
        requestAnimationFrame(check);
      });
    });
  }

  /**
   * Convierte todos los tiles visibles a data: URLs para evitar
   * el CORS SecurityError de Safari al capturar con html-to-image.
   * Solo aplica cuando el tile es cross-origin (satélite ArcGIS).
   */
  private async inlineTileImages(): Promise<void> {
    if (typeof document === 'undefined') return;

    const tiles = Array.from(
      document.querySelectorAll('.leaflet-tile-pane img')
    ) as HTMLImageElement[];

    await Promise.all(
      tiles.map(tile =>
        new Promise<void>(resolve => {
          if (!tile.src || tile.src.startsWith('data:')) {
            resolve();
            return;
          }

          const canvas = document.createElement('canvas');
          canvas.width = tile.naturalWidth || 256;
          canvas.height = tile.naturalHeight || 256;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve();
            return;
          }

          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            try {
              ctx.drawImage(img, 0, 0);
              tile.src = canvas.toDataURL('image/jpeg', 0.85);
            } catch {
              // Si ArcGIS rechaza CORS, dejamos el tile como está
              // (aparecerá blanco, pero no rompe la captura completa)
            }
            resolve();
          };
          img.onerror = () => resolve();
          img.src =
            tile.src + (tile.src.includes('?') ? '&' : '?') + '_cb=' + Date.now();
        })
      )
    );
  }

  getAllTerritoriesLayer(): FeatureLayer[] {
    return this.territories.getAllTerritoriesLayer();
  }

  async prepararCaptura(manzanasMarcadas: ManzanaMarcada[], territoriosSeleccionados: number[]): Promise<void> {
    const map = this.engine.getMap();
    if (!map) return Promise.resolve();

    const seleccionados = new Set(territoriosSeleccionados);
    const _markedLayers = new Set<L.Path>(
      manzanasMarcadas.map(m => this.registry.get(m.id)!).filter(Boolean)
    );
    const allTerritoriesLayer = this.territories.getAllTerritoriesLayer();
    const territoryLabels = this.territories.getTerritoryLabels();

    // ← AGREGAR: inline tiles para Safari antes de capturar
    if (this.isSafari()) {
      await this.inlineTileImages();
    }

    this.styleTerritoryLayers(allTerritoriesLayer, seleccionados, _markedLayers);
    this.stylePartialMarks(manzanasMarcadas, allTerritoriesLayer);
    this.updateLabelVisibility(territoryLabels, seleccionados);
    this.fitBoundsToSelection(map, seleccionados, manzanasMarcadas, allTerritoriesLayer);

    return this.waitForTiles(map);
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
    this.styleTerritoryLayersSoloIncompletos(allTerritoriesLayer, incompletos, manzanasMarcadas);
    this.stylePartialMarks(manzanasMarcadas, allTerritoriesLayer);
    this.updateLabelVisibility(territoryLabels, incompletos);
    this.fitBoundsToSelection(map, incompletos, manzanasMarcadas, allTerritoriesLayer);

    return this.waitForTiles(map);
  }

  /**
   * Aplica estilos de captura SOLO a territorios incompletos.
   * Los completados se ocultan. Las manzanas ya marcadas se resaltan
   * con getMarkedManzanaStyle y las no marcadas con getCaptureIncompleteStyle.
   */
  private styleTerritoryLayersSoloIncompletos(
    allTerritoriesLayer: FeatureLayer[],
    incompletos: Set<number>,
    manzanasMarcadas: ManzanaMarcada[]
  ): void {
    const markedLayers = new Set<L.Path>(
      manzanasMarcadas.map(m => this.registry.get(m.id)).filter((l): l is L.Path => Boolean(l))
    );

    for (const fl of allTerritoriesLayer) {
      if (incompletos.has(fl.territorioPadre)) {
        fl.layer.eachLayer(l => {
          if (!(l instanceof L.Path)) return;
          l.setStyle(markedLayers.has(l) ? getMarkedManzanaStyle(fl.color) : getCaptureIncompleteStyle(fl.color));
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
      // animate: false — the map must settle instantly before the tile waiter
      // snapshot; an animated fitBounds keeps the OLD tiles in the pane while
      // transforming, so waitForTiles resolves on them and the screenshot is
      // captured mid-animation (shifted/skewed territory on mobile).
      map.fitBounds(combined, { padding: MAP_DEFAULTS.capturePadding, animate: false });
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

  private isSafari(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /AppleWebKit/.test(ua) && !/(Chrome|CriOS|Edg|OPR|Firefox|SamsungBrowser)/.test(ua);
  }
}
