import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import { MAP_DEFAULTS, STYLE_DEFAULTS } from '../utils/map-constants';
import { MapEngineService } from './map-engine.service';
import { MapTerritoryLayerService } from './map-territory-layer.service';
import type { ManzanaMarcada } from '../types/map.types';

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

    for (const fl of allTerritoriesLayer) {
      if (!seleccionados.has(fl.territorioPadre)) {
        fl.layer.eachLayer(l => {
          if (l instanceof L.Path) l.setStyle(STYLE_DEFAULTS.hiddenPolygon);
        });
        continue;
      }

      fl.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          const isMarked = markedLayers.has(l as unknown as L.Path);
          if (isMarked) {
            l.setStyle({
              fillColor: fl.color,
              fillOpacity: STYLE_DEFAULTS.markedPolygon.fillOpacity,
              color: fl.color,
              weight: STYLE_DEFAULTS.polygon.weight,
              opacity: 1,
              dashArray: undefined,
            });
          } else {
            l.setStyle({
              opacity: 0.6,
              fillOpacity: 0.05,
              color: fl.color,
              weight: 1.5,
              dashArray: undefined,
            });
          }
        }
      });
    }

    for (const m of manzanasMarcadas) {
      if (!m.id.startsWith('parcial-')) continue;
      const fl = allTerritoriesLayer.find(f => f.territorioPadre === m.territorioNumero);
      if (!fl) continue;
      if (m.layer instanceof L.Path) {
        m.layer.setStyle({
          fillColor: fl.color,
          fillOpacity: STYLE_DEFAULTS.partialPolygonComplete.fillOpacity,
          color: fl.color,
          weight: STYLE_DEFAULTS.partialPolygonComplete.weight,
          opacity: 1,
          dashArray: undefined,
        });
      }
    }

    for (const lbl of territoryLabels) {
      const el = lbl.getElement();
      if (!el) continue;
      const text = el.querySelector('.territory-label__text')?.textContent;
      const num = text ? Number(text) : NaN;
      lbl.setOpacity(seleccionados.has(num) ? 1 : 0);
    }

    let combined: L.LatLngBounds | null = null;
    for (const num of seleccionados) {
      const fl = allTerritoriesLayer.find(f => f.territorioPadre === num);
      if (!fl) continue;
      const b = fl.layer.getBounds();
      if (b.isValid()) {
        if (!combined) combined = b;
        else combined.extend(b);
      }
    }

    if (!combined) {
      for (const m of manzanasMarcadas) {
        if (m.layer instanceof L.Polygon) {
          const b = m.layer.getBounds();
          if (b.isValid()) {
            if (!combined) combined = b;
            else combined.extend(b);
          }
        }
      }
    }

    if (combined) {
      map.fitBounds(combined, { padding: MAP_DEFAULTS.capturePadding });
    }

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

    for (const fl of allTerritoriesLayer) {
      if (!seleccionados.has(fl.territorioPadre)) {
        fl.layer.eachLayer(l => {
          if (l instanceof L.Path) {
            const isVisible = modoMarcado === 'none';
            l.setStyle({
              opacity: isVisible ? 1 : 0,
              fillOpacity: isVisible ? 0.05 : 0,
              color: fl.color,
              weight: STYLE_DEFAULTS.polygon.weight,
            });
          }
        });
        continue;
      }

      fl.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          const isMarked = manzanasMarcadas.some(m => m.layer === l);
          if (!isMarked) {
            l.setStyle({
              opacity: 1,
              fillOpacity: 0.05,
              color: fl.color,
              weight: STYLE_DEFAULTS.polygon.weight,
            });
          }
        }
      });
    }

    let combined: L.LatLngBounds | null = null;
    for (const num of seleccionados) {
      const fl = allTerritoriesLayer.find(f => f.territorioPadre === num);
      if (fl) {
        const bounds = fl.layer.getBounds();
        if (bounds.isValid()) {
          if (!combined) combined = bounds;
          else combined.extend(bounds);
        }
      }
    }

    if (combined && combined.isValid()) {
      map.fitBounds(combined, { padding: MAP_DEFAULTS.boundsPadding });
    }

    const zoomVisible = map.getZoom() >= MAP_DEFAULTS.labelMinZoom;
    if (seleccionados.size > 0 && zoomVisible) {
      for (const lbl of territoryLabels) {
        const el = lbl.getElement();
        if (!el) continue;
        const text = el.querySelector('.territory-label__text')?.textContent;
        if (text && seleccionados.has(Number(text))) {
          lbl.setOpacity(1);
        } else {
          lbl.setOpacity(0);
        }
      }
    } else {
      for (const lbl of territoryLabels) {
        lbl.setOpacity(zoomVisible ? 1 : 0);
      }
    }
  }
}
