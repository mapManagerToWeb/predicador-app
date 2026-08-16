import { Injectable, inject } from '@angular/core';
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
 * <p>Uses plain Maps instead of signals for internal state so that hot-path
 * operations (territory add/remove, label lookup) are O(1) and never create
 * intermediate array copies.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapTerritoryLayerService {
  // sessionStorage key — full parsed GeoJSON. Avoids the 412 KB round-trip
  // and re-parse on every navigation/reload. Miss-safes to a plain fetch.
  static readonly GEOJSON_CACHE_KEY = 'predicador.territories.geojson.v1';

  // O(1) territory → layer lookup; replaces signal<FeatureLayer[]>
  private layerByTerritory = new Map<number, FeatureLayer>();

  // Flat manzana list for iteration (MapInteractionService); O(1) by-territory index alongside
  private manzanaList: ManzanaIndex[] = [];
  private manzanasByTerritory = new Map<number, ManzanaIndex[]>();

  // O(1) territory → label lookup; replaces signal<L.Marker[]> + querySelector
  private labelByTerritory = new Map<number, L.Marker>();

  // Plain map; was signal<Map<...>> — no reactivity needed (set once at load)
  private dataCache = new Map<number, TerritorioCacheData>();

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
    return this.manzanaList;
  }

  /** O(1) lookup — avoids .find() in hot paths. */
  getFeatureLayerByTerritorio(territorioNum: number): FeatureLayer | undefined {
    return this.layerByTerritory.get(territorioNum);
  }

  getAllTerritoriesLayer(): FeatureLayer[] {
    return Array.from(this.layerByTerritory.values());
  }

  getTerritoryDataCache(): Map<number, TerritorioCacheData> {
    return this.dataCache;
  }

  async loadAllTerritories(territorioService: { getAllGeoJson(): Promise<string> }): Promise<void> {
    this.clearAllLayers();

    const features = this.getCachedFeatures() ?? (await this.fetchAndCacheFeatures(territorioService));
    if (!features) return;

    const byTerritorio = this.groupFeaturesByTerritorio(features);
    this.dataCache = this.buildTerritorioCache(byTerritorio);
  }

  private getCachedFeatures(): GeoJSON.Feature[] | null {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(MapTerritoryLayerService.GEOJSON_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { features: GeoJSON.Feature[] };
      if (!Array.isArray(parsed.features) || parsed.features.length === 0) return null;
      return parsed.features;
    } catch {
      return null;
    }
  }

  private async fetchAndCacheFeatures(territorioService: {
    getAllGeoJson(): Promise<string>;
  }): Promise<GeoJSON.Feature[] | null> {
    const geoJsonText = await territorioService.getAllGeoJson();
    const geoJson = JSON.parse(geoJsonText) as GeoJSON.FeatureCollection;
    const features = geoJson.features;

    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(
          MapTerritoryLayerService.GEOJSON_CACHE_KEY,
          JSON.stringify({ features })
        );
      } catch {
        // Quota exceeded / storage disabled — cache is best-effort only.
      }
    }

    return features;
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
    const newlyLoaded: number[] = [];

    for (const [num, data] of this.dataCache) {
      const isVisible = data.bounds.isValid() && data.bounds.intersects(mapBounds);
      const isLoaded = this.layerByTerritory.has(num); // O(1) — no Set creation

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
    if (this.layerByTerritory.has(territorioNum)) return; // O(1)
    const data = this.dataCache.get(territorioNum);
    if (data) this.addTerritoryLayer(territorioNum, data);
  }

  clearAllLayers(): void {
    for (const fl of this.layerByTerritory.values()) fl.layer.remove();
    for (const lbl of this.labelByTerritory.values()) lbl.remove();
    this.layerByTerritory.clear();
    this.labelByTerritory.clear();
    this.manzanaList = [];
    this.manzanasByTerritory.clear();
    this.dataCache.clear();
  }

  updateLabelsVisibility(): void {
    this.updateLabels(null);
  }

  updateLabelsForSelection(seleccionados: Set<number>): void {
    this.updateLabels(seleccionados);
  }

  private updateLabels(seleccionados: Set<number> | null): void {
    const map = this.engine.getMap();
    if (!map) return;

    const show = map.getZoom() >= MAP_DEFAULTS.labelMinZoom;
    if (!show || seleccionados === null || seleccionados.size === 0) {
      for (const lbl of this.labelByTerritory.values()) lbl.setOpacity(show ? 1 : 0);
      return;
    }

    for (const [num, lbl] of this.labelByTerritory) {
      lbl.setOpacity(seleccionados.has(num) ? 1 : 0);
    }
  }

  /** O(1) count — avoids .filter() in hot paths. */
  getManzanaCountByTerritorio(territorioNum: number): number {
    return this.manzanasByTerritory.get(territorioNum)?.length ?? 0;
  }

  getTerritoryLabels(): L.Marker[] {
    return Array.from(this.labelByTerritory.values());
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
      // Push directly — no array spread/copy
      for (const entry of newEntries) {
        this.manzanaList.push(entry);
        let list = this.manzanasByTerritory.get(territorioNum);
        if (!list) {
          list = [];
          this.manzanasByTerritory.set(territorioNum, list);
        }
        list.push(entry);
      }
    }

    layer.addTo(map);

    if (bounds.isValid()) {
      this.addTerritoryLabel(map, territorioNum, bounds);
    }

    this.layerByTerritory.set(territorioNum, { territorioPadre: territorioNum, color, layer });
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

    // O(1) insert — no array push + spread
    this.labelByTerritory.set(territorioNum, label);
  }

  private removeTerritoryLayer(territorioNum: number): void {
    const fl = this.layerByTerritory.get(territorioNum);
    if (!fl) return;

    fl.layer.remove();
    this.layerByTerritory.delete(territorioNum);

    this.removeTerritoryLabel(territorioNum);

    // Remove manzanas for this territory
    const manzanas = this.manzanasByTerritory.get(territorioNum);
    this.manzanasByTerritory.delete(territorioNum);
    if (manzanas && manzanas.length > 0) {
      const toRemove = new Set(manzanas);
      this.manzanaList = this.manzanaList.filter(m => !toRemove.has(m));
    }
  }

  private removeTerritoryLabel(territorioNum: number): void {
    const label = this.labelByTerritory.get(territorioNum);
    if (label) {
      label.remove();
      this.labelByTerritory.delete(territorioNum);
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
