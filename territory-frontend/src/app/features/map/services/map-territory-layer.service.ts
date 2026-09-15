import { Injectable, inject } from '@angular/core';
import {
  GeoJSON as LeafletGeoJSON,
  Marker,
  DivIcon,
  LatLng,
  LatLngBounds,
  Polygon,
  type Map as LeafletMap,
  type Layer,
  type PathOptions,
  type LeafletMouseEvent,
} from 'leaflet';
import * as GeoJSON from 'geojson';
import { simplify } from '@turf/simplify';
import { union } from '@turf/union';
import { featureCollection } from '@turf/helpers';
import { MAP_DEFAULTS, STYLE_DEFAULTS } from '../utils/map-constants';
import { getColorForTerritorio } from '../utils/territory-colors';
import { MapEngineService } from './map-engine.service';
import { getBaseTerritoryStyle } from './map-style.service';
import { ManzanaSpatialIndex } from './manzana-spatial-index';
import { collectLatLngRings } from './map-rings';
import type { ManzanaIndex, FeatureLayer, TerritorioCacheData } from '../types/map.types';

const SIMPLIFY_TOLERANCE = 0.0001;

/** Resultado procesado (simplify + union) de un territorio, persistible en sessionStorage. */
interface ProcessedTerritoryData {
  simplifiedFc: GeoJSON.FeatureCollection;
  dissolvedFeature: GeoJSON.Feature | null;
}

function simplifyFeatureCollection(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const features = fc.features.map((f) => {
    if (!f.geometry) return f;
    try {
      const simplified = simplify(f as Parameters<typeof simplify>[0], {
        tolerance: SIMPLIFY_TOLERANCE,
        highQuality: true,
      }) as GeoJSON.Feature;
      return { ...f, geometry: simplified.geometry };
    } catch {
      return f;
    }
  });
  return { type: 'FeatureCollection', features };
}

function dissolveTerritory(fc: GeoJSON.FeatureCollection): GeoJSON.Feature | null {
  const validFeatures = fc.features.filter((f) => f.geometry);
  if (validFeatures.length === 0) return null;
  if (validFeatures.length === 1) return validFeatures[0];

  try {
    const turfFeatures = validFeatures.map((f) => ({
      type: 'Feature' as const,
      geometry: f.geometry! as GeoJSON.Polygon | GeoJSON.MultiPolygon,
      properties: f.properties ?? {},
    }));
    const merged = union(featureCollection(turfFeatures));
    if (!merged) return validFeatures[0];
    return {
      type: 'Feature',
      geometry: merged.geometry as GeoJSON.Geometry,
      properties: validFeatures[0].properties ?? {},
    };
  } catch {
    return validFeatures[0];
  }
}

export type ManzanaClickHandler = (
  id: string,
  nombreBloque: string,
  polygon: Polygon,
  color: string,
  territorioNumero: number,
  event: LeafletMouseEvent,
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
  static readonly GEOJSON_CACHE_KEY = 'territory.territories.geojson.v1';

  // Presupuesto de main-thread por frame para AGREGAR territorios visibles
  // (la carga es un stream por rAF, no un burst síncrono por moveend).
  static readonly VISIBLE_LOAD_BUDGET_MS = 8;

  // Tope defensivo de agregados por frame (independiente del presupuesto).
  static readonly VISIBLE_LOAD_MAX_PER_FRAME = 6;

  // sessionStorage key — processed geometry (simplify + union) per territory.
  // Same lifecycle as GEOJSON_CACHE_KEY: pruned together in podarGeojsonCache.
  // Avoids recomputing turf simplify/union on every navigation/reload.
  static readonly PROCESSED_CACHE_KEY = 'territory.territories.processed.v1';

  // O(1) territory → layer lookup; replaces signal<FeatureLayer[]>
  private layerByTerritory = new Map<number, FeatureLayer>();

  // Flat manzana list for iteration (MapInteractionService); O(1) by-territory index alongside
  private manzanaList: ManzanaIndex[] = [];
  private manzanasByTerritory = new Map<number, ManzanaIndex[]>();

  // Spatial grid over manzana bboxes — turns tap hit-testing from O(V) into
  // O(1) cell lookups. Kept in sync with manzanaList at every mutation point.
  private spatialIndex = new ManzanaSpatialIndex();

  // O(1) territory → label lookup; replaces signal<Marker[]> + querySelector
  private labelByTerritory = new Map<number, Marker>();

  // Plain map; was signal<Map<...>> — no reactivity needed (set once at load)
  private dataCache = new Map<number, TerritorioCacheData>();

  private manzanaClickHandler: ManzanaClickHandler | null = null;
  private extraLayers: Layer[] = [];

  // Cola de territorios visibles pendientes de agregar. Se procesa por frames
  // con presupuesto de tiempo (streaming) para no bloquear el hilo principal
  // en un único burst síncrono por moveend.
  private pendingLoadQueue: number[] = [];
  private loadFrameHandle: number | null = null;
  private pendingBatchCallback: ((newlyLoaded: number[]) => void) | null = null;
  private loadIdleWaiters: Array<() => void> = [];

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

  /** Manzanas whose bbox covers the cell containing the point (O(1) lookup). */
  queryManzanasAt(latlng: { lat: number; lng: number }): ManzanaIndex[] {
    return this.spatialIndex.queryAt(latlng);
  }

  /** Manzanas in the cells within `radiusCells` of the point's cell, deduplicated. */
  queryManzanasNear(latlng: { lat: number; lng: number }, radiusCells = 1): ManzanaIndex[] {
    return this.spatialIndex.queryNear(latlng, radiusCells);
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

  /** True when a usable GeoJSON snapshot is cached in sessionStorage. */
  hasCachedGeojson(): boolean {
    if (typeof sessionStorage === 'undefined') return false;
    try {
      const raw = sessionStorage.getItem(MapTerritoryLayerService.GEOJSON_CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { features: GeoJSON.Feature[] };
      return Array.isArray(parsed.features) && parsed.features.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Descarta el snapshot de sessionStorage si referencia territorios que ya no
   * existen en el backend, forzando un refetch autoritativo en el próximo load.
   */
  podarGeojsonCache(vigentes: Set<number>): void {
    if (!this.hasCachedGeojson()) return;
    const features = this.getCachedFeatures() ?? [];
    const obsoleto = features.some(
      (f) => !vigentes.has(Number(f.properties?.['territorio_padre'])),
    );
    if (!obsoleto) return;
    try {
      sessionStorage.removeItem(MapTerritoryLayerService.GEOJSON_CACHE_KEY);
      sessionStorage.removeItem(MapTerritoryLayerService.PROCESSED_CACHE_KEY);
    } catch {
      // Storage no disponible — el refetch igualmente ocurrirá en memoria.
    }
  }

  async loadAllTerritories(territorioService: { getAllGeoJson(): Promise<string> }): Promise<void> {
    this.clearAllLayers();

    const cachedFeatures = this.getCachedFeatures();
    const features = cachedFeatures ?? (await this.fetchAndCacheFeatures(territorioService));
    if (!features) return;

    const byTerritorio = this.groupFeaturesByTerritorio(features);
    // La procesada solo es válida si la cruda estaba cacheada (mismo ciclo de vida).
    // Si la cruda se fetcheó ahora, la procesada podría ser huérfana → reprocesar.
    const cachedProcessed = cachedFeatures ? this.getCachedProcessed() : null;
    this.dataCache = await this.buildTerritorioCache(byTerritorio, cachedProcessed);
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
          JSON.stringify({ features }),
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

  private getCachedProcessed(): Record<string, ProcessedTerritoryData> | null {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(MapTerritoryLayerService.PROCESSED_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, ProcessedTerritoryData>;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  private saveProcessedToCache(processed: Record<string, ProcessedTerritoryData>): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(
        MapTerritoryLayerService.PROCESSED_CACHE_KEY,
        JSON.stringify(processed),
      );
    } catch {
      // Quota exceeded / storage disabled — cache is best-effort only.
    }
  }

  private async buildTerritorioCache(
    byTerritorio: Map<number, GeoJSON.Feature[]>,
    cachedProcessed?: Record<string, ProcessedTerritoryData> | null,
  ): Promise<Map<number, TerritorioCacheData>> {
    const cache = new Map<number, TerritorioCacheData>();
    const processedToSave: Record<string, ProcessedTerritoryData> = {};

    for (const [territorioNum, features] of byTerritorio) {
      const key = String(territorioNum);
      const cached = cachedProcessed?.[key];

      let simplifiedFc: GeoJSON.FeatureCollection;
      let dissolvedFeature: GeoJSON.Feature | null;

      if (cached) {
        simplifiedFc = cached.simplifiedFc;
        dissolvedFeature = cached.dissolvedFeature;
      } else {
        const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };
        dissolvedFeature = dissolveTerritory(fc);
        simplifiedFc = simplifyFeatureCollection(fc);
        processedToSave[key] = { simplifiedFc, dissolvedFeature };
        // Cede al event loop entre territorios: el browser puede pintar/responder
        // durante el primer cálculo en lugar de bloquear todo el frame.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const rawColor = features[0]?.properties?.['color'] ?? null;
      const color = getColorForTerritorio(territorioNum, rawColor);
      const bounds = this.computeBoundsFromFeatures(features);
      cache.set(territorioNum, {
        fc: { type: 'FeatureCollection', features },
        simplifiedFc,
        dissolvedFeature,
        color,
        bounds,
      });
    }

    if (Object.keys(processedToSave).length > 0) {
      this.saveProcessedToCache(processedToSave);
    }
    return cache;
  }

  /**
   * Actualiza los territorios visibles del viewport de forma incremental.
   *
   * <p>Las REMOCIONES se aplican de inmediato (síncrono, como antes), pero los
   * AGREGADOS se encolan y se procesan por frames con un presupuesto de
   * tiempo (VISIBLE_LOAD_BUDGET_MS) para no bloquear el main thread en un
   * único burst síncrono. Cada batch procesado invoca `onBatchLoaded` con los
   * números recién agregados, DESPUÉS de crear sus capas (para que
   * getFeatureLayerByTerritorio ya responda).</p>
   *
   * <p>Una nueva llamada reemplaza por completo la cola pendiente (re-target):
   * las entradas obsoletas de una generación anterior se descartan y la carga
   * se re-apunta al viewport actual; el callback pasado pasa a ser el vigente.</p>
   */
  updateVisibleTerritories(onBatchLoaded?: (newlyLoaded: number[]) => void): void {
    const map = this.engine.getMap();
    if (!map) {
      // Sin mapa (destroy en curso): limpia cualquier stream pendiente y avisa
      // a los waiters de idle.
      this.cancelPendingLoads();
      return;
    }

    const mapBounds = map.getBounds().pad(MAP_DEFAULTS.mapBoundsPadFactor);
    const toLoad: number[] = [];

    for (const [num, data] of this.dataCache) {
      const isVisible = data.bounds.isValid() && data.bounds.intersects(mapBounds);
      const isLoaded = this.layerByTerritory.has(num); // O(1) — no Set creation

      if (isVisible && !isLoaded) {
        toLoad.push(num);
      } else if (!isVisible && isLoaded) {
        this.removeTerritoryLayer(num);
      }
    }

    // Reemplazo total de la cola: los territorios ya cargados no pueden estar
    // en toLoad, así que un re-target a mitad de stream nunca duplica capas.
    this.pendingLoadQueue = toLoad;
    this.pendingBatchCallback = onBatchLoaded ?? null;

    if (toLoad.length === 0) {
      // Paridad con el contrato anterior: refrescar etiquetas en cada moveend
      // aunque no haya cargas nuevas (rango zoom/label no cambia, es barato).
      this.updateLabelsVisibility();
      this.notifyLoadIdle();
      return;
    }

    // Un solo frame pendiente a la vez: la iteración de la cola es continua.
    if (this.loadFrameHandle === null) {
      this.loadFrameHandle = requestAnimationFrame(() => this.processLoadFrame());
    }
  }

  /** Procesa un frame del stream de carga respetando el presupuesto de tiempo. */
  private processLoadFrame(): void {
    this.loadFrameHandle = null;
    if (!this.engine.getMap()) {
      // El mapa fue destruido mientras el stream estaba pendiente.
      this.cancelPendingLoads();
      return;
    }

    const started = performance.now();
    const batch: number[] = [];

    while (
      this.pendingLoadQueue.length > 0 &&
      batch.length < MapTerritoryLayerService.VISIBLE_LOAD_MAX_PER_FRAME &&
      performance.now() - started < MapTerritoryLayerService.VISIBLE_LOAD_BUDGET_MS
    ) {
      const num = this.pendingLoadQueue.shift()!;
      // Guard defensivo: si el territorio se cargó por otra vía
      // (ensureTerritoryLoaded) mientras el frame estaba pendiente, no agregar
      // dos veces.
      if (this.layerByTerritory.has(num)) continue;
      const data = this.dataCache.get(num);
      if (data) {
        this.addTerritoryLayer(num, data);
        batch.push(num);
      }
    }

    if (batch.length > 0) {
      this.updateLabelsVisibility();
      // El callback corre después de crear las capas del batch.
      this.pendingBatchCallback?.(batch);
    }

    if (this.pendingLoadQueue.length > 0) {
      this.loadFrameHandle = requestAnimationFrame(() => this.processLoadFrame());
    } else {
      this.pendingBatchCallback = null;
      this.notifyLoadIdle();
    }
  }

  /**
   * Resuelve cuando el stream de carga actual drena (o es cancelado). Si no
   * hay cola ni frame pendiente, resuelve de inmediato.
   */
  whenTerritoryLoadsIdle(): Promise<void> {
    if (this.pendingLoadQueue.length === 0 && this.loadFrameHandle === null) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.loadIdleWaiters.push(resolve);
    });
  }

  /** Cancela el frame pendiente, vacía la cola y notifica a los waiters de idle. */
  cancelPendingLoads(): void {
    if (this.loadFrameHandle !== null) {
      cancelAnimationFrame(this.loadFrameHandle);
      this.loadFrameHandle = null;
    }
    this.pendingLoadQueue = [];
    this.pendingBatchCallback = null;
    this.notifyLoadIdle();
  }

  private notifyLoadIdle(): void {
    const waiters = this.loadIdleWaiters;
    this.loadIdleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  ensureTerritoryLoaded(territorioNum: number): void {
    if (this.layerByTerritory.has(territorioNum)) return; // O(1)
    const data = this.dataCache.get(territorioNum);
    if (data) this.addTerritoryLayer(territorioNum, data);
    // Si el número seguía pendiente en el stream, descartarlo para evitar un
    // doble add cuando procese el frame (sin cambiar la carga síncrona).
    this.pendingLoadQueue = this.pendingLoadQueue.filter((n) => n !== territorioNum);
  }

  clearAllLayers(): void {
    this.cancelPendingLoads();
    for (const fl of this.layerByTerritory.values()) fl.layer.remove();
    for (const lbl of this.labelByTerritory.values()) lbl.remove();
    this.layerByTerritory.clear();
    this.labelByTerritory.clear();
    this.manzanaList = [];
    this.manzanasByTerritory.clear();
    this.spatialIndex.clear();
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

  getTerritoryLabels(): Marker[] {
    return Array.from(this.labelByTerritory.values());
  }

  addExtraLayer(layer: Layer): void {
    this.extraLayers.push(layer);
  }

  removeExtraLayer(layer: Layer): void {
    this.extraLayers = this.extraLayers.filter((l) => l !== layer);
    this.engine.getMap()?.removeLayer(layer);
  }

  getExtraLayers(): Layer[] {
    return this.extraLayers;
  }

  clearExtraLayers(): void {
    const map = this.engine.getMap();
    for (const l of this.extraLayers) {
      map?.removeLayer(l);
    }
    this.extraLayers = [];
  }

  private addTerritoryLayer(territorioNum: number, data: TerritorioCacheData): void {
    const { simplifiedFc, dissolvedFeature, color, bounds } = data;
    const map = this.engine.getMap();
    if (!map) return;

    const useDissolved = map.getZoom() < MAP_DEFAULTS.labelMinZoom && dissolvedFeature;
    const newEntries: ManzanaIndex[] = [];

    let layer: LeafletGeoJSON;
    if (useDissolved) {
      layer = new LeafletGeoJSON(dissolvedFeature, {
        style: () => this.getTerritoryStyle(color),
      });
    } else {
      layer = new LeafletGeoJSON(simplifiedFc, {
        style: () => this.getTerritoryStyle(color),
        onEachFeature: (feature, l) =>
          this.onEachFeature(feature, l, territorioNum, color, newEntries),
      });
    }

    if (newEntries.length > 0) {
      // Push directly — no array spread/copy
      for (const entry of newEntries) {
        this.manzanaList.push(entry);
        this.spatialIndex.insert(entry);
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

  private getTerritoryStyle(color: string): PathOptions {
    return getBaseTerritoryStyle(color, false);
  }

  private onEachFeature(
    feature: GeoJSON.Feature,
    l: Layer,
    territorioNum: number,
    color: string,
    newEntries: ManzanaIndex[],
  ): void {
    if (!(l instanceof Polygon)) return;

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

    l.on('click', (e: LeafletMouseEvent) => {
      this.manzanaClickHandler?.(id, nombreBloque, l, color, territorioNum, e);
    });
  }

  private computePolygonBBox(polygon: Polygon): {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } {
    // collectLatLngRings aplana Polygon/MultiPolygon (Leaflet 2.0 comparte
    // clase sin distinguir); sin esto, una manzana MultiPolygon daba bbox
    // Infinity/-Infinity y fallaba el hit-testing del índice espacial.
    const rings = collectLatLngRings(polygon.getLatLngs());
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    for (const ring of rings) {
      for (const pt of ring) {
        if (pt.lat < minLat) minLat = pt.lat;
        if (pt.lat > maxLat) maxLat = pt.lat;
        if (pt.lng < minLng) minLng = pt.lng;
        if (pt.lng > maxLng) maxLng = pt.lng;
      }
    }

    return { minLat, maxLat, minLng, maxLng };
  }

  private addTerritoryLabel(map: LeafletMap, territorioNum: number, bounds: LatLngBounds): void {
    const center = bounds.getCenter();
    const label = new Marker(center, {
      icon: new DivIcon({
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
      this.manzanaList = this.manzanaList.filter((m) => !toRemove.has(m));
      for (const m of manzanas) {
        this.spatialIndex.remove(m);
      }
    }
  }

  private removeTerritoryLabel(territorioNum: number): void {
    const label = this.labelByTerritory.get(territorioNum);
    if (label) {
      label.remove();
      this.labelByTerritory.delete(territorioNum);
    }
  }

  private computeBoundsFromFeatures(features: GeoJSON.Feature[]): LatLngBounds {
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

    return new LatLngBounds(new LatLng(minLat, minLng), new LatLng(maxLat, maxLng));
  }

  private extendBoundsFromGeometry(
    geom: GeoJSON.Geometry | null,
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number,
  ): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
    if (!geom) return { minLat, maxLat, minLng, maxLng };

    if (geom.type === 'Polygon') {
      return this.extendBoundsFromPolygon(
        (geom as GeoJSON.Polygon).coordinates,
        minLat,
        maxLat,
        minLng,
        maxLng,
      );
    }

    if (geom.type === 'MultiPolygon') {
      return this.extendBoundsFromMultiPolygon(
        (geom as GeoJSON.MultiPolygon).coordinates,
        minLat,
        maxLat,
        minLng,
        maxLng,
      );
    }

    return { minLat, maxLat, minLng, maxLng };
  }

  private extendBoundsFromPolygon(
    coordinates: number[][][],
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number,
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
    maxLng: number,
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
