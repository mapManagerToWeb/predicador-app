import { Injectable, inject, signal } from '@angular/core';
import * as L from 'leaflet';
import * as GeoJSON from 'geojson';
import { MAP_DEFAULTS, STYLE_DEFAULTS } from '../utils/map-constants';
import { getColorForTerritorio } from '../utils/territory-colors';
import { MapEngineService } from './map-engine.service';
import { getBaseTerritoryStyle } from './map-style.service';
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
  private extraLayers: L.Layer[] = [];

  private engine = inject(MapEngineService);

  setManzanaClickHandler(handler: ManzanaClickHandler | null): void {
    this.manzanaClickHandler = handler;
  }

  getManzanaClickHandler(): ManzanaClickHandler | null {
    return this.manzanaClickHandler;
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

    const byTerritorio = this.groupFeaturesByTerritorio(geoJson.features);
    const cache = this.buildTerritorioCache(byTerritorio);

    this.territoryDataCache.set(cache);
  }

  private groupFeaturesByTerritorio(features: GeoJSON.Feature[]): Map<number, GeoJSON.Feature[]> {
    const byTerritorio = new Map<number, GeoJSON.Feature[]>();
    for (const feature of features) {
      const num = feature.properties?.['territorio_padre'];
      if (!num) continue;
      if (!byTerritorio.has(num)) byTerritorio.set(num, []);
      byTerritorio.get(num)!.push(feature);
    }
    return byTerritorio;
  }

  private buildTerritorioCache(byTerritorio: Map<number, GeoJSON.Feature[]>): Map<number, TerritorioCacheData> {
    const cache = new Map<number, TerritorioCacheData>();
    for (const [territorioNum, features] of byTerritorio) {
      const rawColor = features[0]?.properties?.['color'] ?? null;
      const color = getColorForTerritorio(territorioNum, rawColor);
      const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };
      const bounds = this.computeBoundsFromFeatures(features);
      cache.set(territorioNum, { fc, color, bounds });
    }
    return cache;
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
      lbl.setOpacity(text && seleccionados.has(Number(text)) ? 1 : 0);
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

  addExtraLayer(layer: L.Layer): void {
    this.extraLayers.push(layer);
  }

  removeExtraLayer(layer: L.Layer): void {
    this.extraLayers = this.extraLayers.filter(l => l !== layer);
    this.engine.getMap()?.removeLayer(layer);
  }

  clearExtraLayers(): void {
    const map = this.engine.getMap();
    for (const l of this.extraLayers) {
      map?.removeLayer(l);
    }
    this.extraLayers = [];
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
      style: () => this.getTerritoryStyle(color),
      onEachFeature: (feature, l) => this.onEachFeature(feature, l, territorioNum, color, newEntries),
    });

    if (newEntries.length > 0) {
      this.manzanaIndex.update(idx => [...idx, ...newEntries]);
    }

    layer.addTo(map);

    if (bounds.isValid()) {
      this.addTerritoryLabel(map, territorioNum, bounds);
    }

    this.allTerritoriesLayer.update(layers => [...layers, { territorioPadre: territorioNum, color, layer }]);
  }

  private getTerritoryStyle(color: string): L.PathOptions {
    return getBaseTerritoryStyle(color, false);
  }

  private onEachFeature(
    feature: GeoJSON.Feature,
    l: L.Layer,
    territorioNum: number,
    color: string,
    newEntries: ManzanaIndex[]
  ): void {
    if (!(l instanceof L.Polygon)) return;

    const id = String(feature.properties?.['id'] ?? '');
    const nombreBloque = String(feature.properties?.['nombre_bloque'] ?? '');
    const bbox = this.computePolygonBBox(l);

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

  private computePolygonBBox(polygon: L.Polygon): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
    const rings = polygon.getLatLngs();
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

    return { minLat, maxLat, minLng, maxLng };
  }

  private addTerritoryLabel(map: L.Map, territorioNum: number, bounds: L.LatLngBounds): void {
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

  private removeTerritoryLayer(territorioNum: number): void {
    const idx = this.allTerritoriesLayer().findIndex(fl => fl.territorioPadre === territorioNum);
    if (idx < 0) return;

    const fl = this.allTerritoriesLayer()[idx];
    fl.layer.remove();
    this.allTerritoriesLayer.update(layers => layers.filter((_, i) => i !== idx));

    this.removeTerritoryLabel(territorioNum);
    this.manzanaIndex.update(index => index.filter(m => m.territorioNumero !== territorioNum));
  }

  private removeTerritoryLabel(territorioNum: number): void {
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
      return this.extendBoundsFromPolygon((geom as GeoJSON.Polygon).coordinates, minLat, maxLat, minLng, maxLng);
    }

    if (geom.type === 'MultiPolygon') {
      return this.extendBoundsFromMultiPolygon((geom as GeoJSON.MultiPolygon).coordinates, minLat, maxLat, minLng, maxLng);
    }

    return { minLat, maxLat, minLng, maxLng };
  }

  private extendBoundsFromPolygon(
    coordinates: number[][][],
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number
  ): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
    for (const ring of coordinates) {
      for (const [lng, lat] of ring) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
    }
    return { minLat, maxLat, minLng, maxLng };
  }

  private extendBoundsFromMultiPolygon(
    coordinates: number[][][][],
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number
  ): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
    for (const poly of coordinates) {
      const result = this.extendBoundsFromPolygon(poly, minLat, maxLat, minLng, maxLng);
      minLat = result.minLat;
      maxLat = result.maxLat;
      minLng = result.minLng;
      maxLng = result.maxLng;
    }
    return { minLat, maxLat, minLng, maxLng };
  }
}
