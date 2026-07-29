import { Injectable, signal } from '@angular/core';
import * as L from 'leaflet';
import * as GeoJSON from 'geojson';
import { MAP_DEFAULTS, STYLE_DEFAULTS } from '../utils/map-constants';
import { getColorForTerritorio, getTerritoryFillOpacity } from '../utils/territory-colors';
import { MapEngineService } from './map-engine.service';
import type { ManzanaIndex, FeatureLayer, TerritorioCacheData } from '../types/map.types';

export type ManzanaClickHandler = (
  id: string,
  nombreBloque: string,
  polygon: L.Polygon,
  color: string,
  territorioNumero: number,
  event: L.LeafletMouseEvent
) => void;

/**
 * Manages territory GeoJSON layers, indices, and viewport-based loading.
 *
 * <p>Loads GeoJSON, groups features by territory, creates/removes Leaflet
 * layers, manages manzana indices, and handles territory labels.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapTerritoryLayerService {
  private allTerritoriesLayer = signal<FeatureLayer[]>([]);
  private manzanaIndex = signal<ManzanaIndex[]>([]);
  private territoryLabels = signal<L.Marker[]>([]);
  private territoryDataCache = signal<Map<number, TerritorioCacheData>>(new Map());
  private manzanaClickHandler: ManzanaClickHandler | null = null;

  constructor(private engine: MapEngineService) {}

  setManzanaClickHandler(handler: ManzanaClickHandler | null): void {
    this.manzanaClickHandler = handler;
  }

  getManzanaIndex(): ManzanaIndex[] {
    return this.manzanaIndex();
  }

  getAllTerritoriesLayer(): FeatureLayer[] {
    return this.allTerritoriesLayer();
  }

  getTerritoryDataCache(): Map<number, TerritorioCacheData> {
    return this.territoryDataCache();
  }

  async loadAllTerritories(territorioService: { getAllGeoJson(): Promise<string> }): Promise<void> {
    this.clearAllLayers();

    const geoJsonText = await territorioService.getAllGeoJson();
    const geoJson = JSON.parse(geoJsonText) as GeoJSON.FeatureCollection;

    const byTerritorio = new Map<number, GeoJSON.Feature[]>();
    for (const feature of geoJson.features) {
      const num = feature.properties?.['territorio_padre'];
      if (num) {
        if (!byTerritorio.has(num)) byTerritorio.set(num, []);
        byTerritorio.get(num)!.push(feature);
      }
    }

    const cache = new Map<number, TerritorioCacheData>();
    for (const [territorioNum, features] of byTerritorio) {
      const rawColor = features[0]?.properties?.['color'] ?? null;
      const color = getColorForTerritorio(territorioNum, rawColor);
      const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };
      const bounds = this.computeBoundsFromFeatures(features);
      cache.set(territorioNum, { fc, color, bounds });
    }

    this.territoryDataCache.set(cache);
  }

  updateVisibleTerritories(): number[] {
    const map = this.engine.getMap();
    if (!map) return [];

    const mapBounds = map.getBounds().pad(MAP_DEFAULTS.mapBoundsPadFactor);
    const loadedNums = new Set(this.allTerritoriesLayer().map(fl => fl.territorioPadre));
    const newlyLoaded: number[] = [];

    for (const [num, data] of this.territoryDataCache()) {
      const isVisible = data.bounds.isValid() && data.bounds.intersects(mapBounds);
      const isLoaded = loadedNums.has(num);

      if (isVisible && !isLoaded) {
        this.addTerritoryLayer(num, data);
        newlyLoaded.push(num);
      } else if (!isVisible && isLoaded) {
        this.removeTerritoryLayer(num);
      }
    }

    this.updateLabelsVisibility();
    return newlyLoaded;
  }

  ensureTerritoryLoaded(territorioNum: number): void {
    if (this.allTerritoriesLayer().some(fl => fl.territorioPadre === territorioNum)) return;
    const data = this.territoryDataCache().get(territorioNum);
    if (data) this.addTerritoryLayer(territorioNum, data);
  }

  clearAllLayers(): void {
    for (const fl of this.allTerritoriesLayer()) fl.layer.remove();
    for (const lbl of this.territoryLabels()) lbl.remove();
    this.allTerritoriesLayer.set([]);
    this.territoryLabels.set([]);
    this.manzanaIndex.set([]);
    this.territoryDataCache.set(new Map());
  }

  updateLabelsVisibility(): void {
    const map = this.engine.getMap();
    if (!map) return;

    const show = map.getZoom() >= MAP_DEFAULTS.labelMinZoom;
    for (const lbl of this.territoryLabels()) {
      lbl.setOpacity(show ? 1 : 0);
    }
  }

  updateLabelsForSelection(seleccionados: Set<number>): void {
    const map = this.engine.getMap();
    if (!map) return;

    const zoomVisible = map.getZoom() >= MAP_DEFAULTS.labelMinZoom;

    if (seleccionados.size === 0 || !zoomVisible) {
      this.mostrarTodosLosLabels();
      return;
    }

    for (const lbl of this.territoryLabels()) {
      const el = lbl.getElement();
      if (!el) continue;
      const text = el.querySelector('.territory-label__text')?.textContent;
      if (text && seleccionados.has(Number(text))) {
        lbl.setOpacity(1);
      } else {
        lbl.setOpacity(0);
      }
    }
  }

  mostrarTodosLosLabels(): void {
    const map = this.engine.getMap();
    if (!map) return;
    const show = map.getZoom() >= MAP_DEFAULTS.labelMinZoom;
    for (const lbl of this.territoryLabels()) lbl.setOpacity(show ? 1 : 0);
  }

  getFeatureLayerByTerritorio(territorioNum: number): FeatureLayer | undefined {
    return this.allTerritoriesLayer().find(f => f.territorioPadre === territorioNum);
  }

  getTerritoryLabels(): L.Marker[] {
    return this.territoryLabels();
  }

  getManzanaCountByTerritorio(territorioNum: number): number {
    return this.manzanaIndex().filter(m => m.territorioNumero === territorioNum).length;
  }

  private addTerritoryLayer(territorioNum: number, data: TerritorioCacheData): void {
    const { fc, color, bounds } = data;
    const map = this.engine.getMap();
    if (!map) return;

    const newEntries: ManzanaIndex[] = [];

    const layer = L.geoJSON(fc, {
      style: () => ({
        fillColor: color,
        fillOpacity: getTerritoryFillOpacity(false),
        opacity: 1,
        color,
        weight: STYLE_DEFAULTS.polygon.weight,
        smoothFactor: STYLE_DEFAULTS.polygon.smoothFactor,
      }),
      onEachFeature: (feature, l) => {
        if (l instanceof L.Polygon) {
          const id = String(feature.properties?.['id'] ?? '');
          const nombreBloque = String(feature.properties?.['nombre_bloque'] ?? '');

          const rings = l.getLatLngs();
          const outer = rings[0] as L.LatLng[];
          let minLat = Infinity;
          let maxLat = -Infinity;
          let minLng = Infinity;
          let maxLng = -Infinity;
          if (outer) {
            for (const pt of outer) {
              if (pt.lat < minLat) minLat = pt.lat;
              if (pt.lat > maxLat) maxLat = pt.lat;
              if (pt.lng < minLng) minLng = pt.lng;
              if (pt.lng > maxLng) maxLng = pt.lng;
            }
          }
          const bbox = { minLat, maxLat, minLng, maxLng };

          newEntries.push({
            polygon: l,
            id,
            nombreBloque,
            color,
            territorioNumero: territorioNum,
            bbox,
          });

          l.on('click', (e: L.LeafletMouseEvent) => {
            this.manzanaClickHandler?.(id, nombreBloque, l, color, territorioNum, e);
          });
        }
      },
    });

    if (newEntries.length > 0) {
      this.manzanaIndex.update(idx => [...idx, ...newEntries]);
    }

    layer.addTo(map);

    if (bounds.isValid()) {
      const center = bounds.getCenter();
      const label = L.marker(center, {
        icon: L.divIcon({
          className: STYLE_DEFAULTS.label.className,
          html: `<span class="territory-label__text">${territorioNum}</span>`,
          iconSize: [...STYLE_DEFAULTS.label.iconSize],
          iconAnchor: [...STYLE_DEFAULTS.label.iconAnchor],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(map);
      this.territoryLabels.update(labels => [...labels, label]);
    }

    this.allTerritoriesLayer.update(layers => [...layers, { territorioPadre: territorioNum, color, layer }]);
  }

  private removeTerritoryLayer(territorioNum: number): void {
    const idx = this.allTerritoriesLayer().findIndex(fl => fl.territorioPadre === territorioNum);
    if (idx < 0) return;

    const fl = this.allTerritoriesLayer()[idx];
    fl.layer.remove();
    this.allTerritoriesLayer.update(layers => layers.filter((_, i) => i !== idx));

    const labelIdx = this.territoryLabels().findIndex(lbl => {
      const el = lbl.getElement();
      if (!el) return false;
      const text = el.querySelector('.territory-label__text')?.textContent;
      return text === String(territorioNum);
    });
    if (labelIdx >= 0) {
      this.territoryLabels()[labelIdx].remove();
      this.territoryLabels.update(labels => labels.filter((_, i) => i !== labelIdx));
    }

    this.manzanaIndex.update(index => index.filter(m => m.territorioNumero !== territorioNum));
  }

  private computeBoundsFromFeatures(features: GeoJSON.Feature[]): L.LatLngBounds {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    for (const f of features) {
      const extended = this.extendBoundsFromGeometry(f.geometry, minLat, maxLat, minLng, maxLng);
      minLat = extended.minLat;
      maxLat = extended.maxLat;
      minLng = extended.minLng;
      maxLng = extended.maxLng;
    }

    return L.latLngBounds(L.latLng(minLat, minLng), L.latLng(maxLat, maxLng));
  }

  private extendBoundsFromGeometry(
    geom: GeoJSON.Geometry | null,
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number
  ): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
    if (!geom) return { minLat, maxLat, minLng, maxLng };

    if (geom.type === 'Polygon') {
      for (const ring of (geom as GeoJSON.Polygon).coordinates) {
        for (const [lng, lat] of ring) {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        }
      }
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of (geom as GeoJSON.MultiPolygon).coordinates) {
        for (const ring of poly) {
          for (const [lng, lat] of ring) {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
          }
        }
      }
    }

    return { minLat, maxLat, minLng, maxLng };
  }
}
