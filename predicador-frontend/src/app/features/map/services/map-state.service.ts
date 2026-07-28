import { Injectable, signal, computed } from '@angular/core';
import { ManzanaMarcada, FeatureLayer } from '../map-report.service';
import * as L from 'leaflet';
import { SnappedPoint, Edge } from '../map-geometry';

export type ModoMarcado = 'none' | 'completa' | 'parcial';

export interface ManzanaIndex {
  polygon: L.Polygon;
  id: string;
  nombreBloque: string;
  color: string;
  territorioNumero: number;
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

export interface TerritoryDataCache {
  fc: GeoJSON.FeatureCollection;
  color: string;
  bounds: L.LatLngBounds;
}

@Injectable({ providedIn: 'root' })
export class MapStateService {
  manzanasMarcadas = signal<ManzanaMarcada[]>([]);
  manzanasCount = computed(() => this.manzanasMarcadas().length);
  totalManzanas = signal(0);
  territorioSeleccionado = signal<number | null>(null);
  territoriosSeleccionados = signal<number[]>([]);
  tieneTerritorio = computed(() => this.territoriosSeleccionados().length > 0);

  modoMarcado = signal<ModoMarcado>('none');
  puntosParciales = signal<SnappedPoint[]>([]);
  puntosCount = computed(() => this.puntosParciales().length);
  puedeConfirmar = computed(() => this.puntosCount() >= 2);

  enviando = signal(false);
  isLoading = signal(false);
  isSatellite = signal(false);
  predicacion = signal<string>('tarde');
  screenshotPreview = signal<string | null>(null);

  private _territoryLabels: L.Marker[] = [];
  private _poligonoParcial: L.Polygon | null = null;
  private _markersParciales: L.Layer[] = [];
  private _extraLayers: L.Layer[] = [];
  private _datosParcialesGuardados: Map<number, { puntos: SnappedPoint[]; geometria: string }> = new Map();
  private _manzanaSeleccionada: L.Polygon | null = null;
  private _manzanaSeleccionadaColor = '';
  private _manzanaSeleccionadaNombre = '';
  private _manzanaSeleccionadaTerritorio: number | null = null;
  private _manzanaEdges: Edge[] = [];
  private _pendingStyleFrame: number | null = null;
  private _pendingStyleQueue: Array<() => void> = [];
  private _manzanaIndex: ManzanaIndex[] = [];
  private _allTerritoriesLayer: FeatureLayer[] = [];
  private _territoryDataCache = new Map<number, TerritoryDataCache>();
  private _currentTerritoryColor = '';

  get territoryLabels(): L.Marker[] { return this._territoryLabels; }
  set territoryLabels(val: L.Marker[]) { this._territoryLabels = val; }

  get poligonoParcial(): L.Polygon | null { return this._poligonoParcial; }
  set poligonoParcial(val: L.Polygon | null) { this._poligonoParcial = val; }

  get markersParciales(): L.Layer[] { return this._markersParciales; }
  set markersParciales(val: L.Layer[]) { this._markersParciales = val; }

  get extraLayers(): L.Layer[] { return this._extraLayers; }
  set extraLayers(val: L.Layer[]) { this._extraLayers = val; }

  get datosParcialesGuardados(): Map<number, { puntos: SnappedPoint[]; geometria: string }> { return this._datosParcialesGuardados; }
  set datosParcialesGuardados(val: Map<number, { puntos: SnappedPoint[]; geometria: string }>) { this._datosParcialesGuardados = val; }

  getDatosParciales(territorio: number): { puntos: SnappedPoint[]; geometria: string } | null {
    return this._datosParcialesGuardados.get(territorio) ?? null;
  }
  setDatosParciales(territorio: number, val: { puntos: SnappedPoint[]; geometria: string }): void {
    this._datosParcialesGuardados.set(territorio, val);
  }
  clearDatosParciales(territorio?: number): void {
    if (territorio === undefined) {
      this._datosParcialesGuardados.clear();
    } else {
      this._datosParcialesGuardados.delete(territorio);
    }
  }

  get manzanaSeleccionada(): L.Polygon | null { return this._manzanaSeleccionada; }
  set manzanaSeleccionada(val: L.Polygon | null) { this._manzanaSeleccionada = val; }

  get manzanaSeleccionadaColor(): string { return this._manzanaSeleccionadaColor; }
  set manzanaSeleccionadaColor(val: string) { this._manzanaSeleccionadaColor = val; }

  get manzanaSeleccionadaNombre(): string { return this._manzanaSeleccionadaNombre; }
  set manzanaSeleccionadaNombre(val: string) { this._manzanaSeleccionadaNombre = val; }

  get manzanaSeleccionadaTerritorio(): number | null { return this._manzanaSeleccionadaTerritorio; }
  set manzanaSeleccionadaTerritorio(val: number | null) { this._manzanaSeleccionadaTerritorio = val; }

  get manzanaEdges(): Edge[] { return this._manzanaEdges; }
  set manzanaEdges(val: Edge[]) { this._manzanaEdges = val; }

  get pendingStyleFrame(): number | null { return this._pendingStyleFrame; }
  set pendingStyleFrame(val: number | null) { this._pendingStyleFrame = val; }

  get pendingStyleQueue(): Array<() => void> { return this._pendingStyleQueue; }
  set pendingStyleQueue(val: Array<() => void>) { this._pendingStyleQueue = val; }

  get manzanaIndex(): ManzanaIndex[] { return this._manzanaIndex; }
  set manzanaIndex(val: ManzanaIndex[]) { this._manzanaIndex = val; }

  get allTerritoriesLayer(): FeatureLayer[] { return this._allTerritoriesLayer; }
  set allTerritoriesLayer(val: FeatureLayer[]) { this._allTerritoriesLayer = val; }

  get territoryDataCache(): Map<number, TerritoryDataCache> { return this._territoryDataCache; }
  set territoryDataCache(val: Map<number, TerritoryDataCache>) { this._territoryDataCache = val; }

  get currentTerritoryColor(): string { return this._currentTerritoryColor; }
  set currentTerritoryColor(val: string) { this._currentTerritoryColor = val; }

  resetUIState(): void {
    this.manzanasMarcadas.set([]);
    this.totalManzanas.set(0);
    this.territorioSeleccionado.set(null);
    this.territoriosSeleccionados.set([]);
    this.modoMarcado.set('none');
    this.puntosParciales.set([]);
    this.enviando.set(false);
    this.isLoading.set(false);
    this.isSatellite.set(false);
    this.screenshotPreview.set(null);
    this._territoryLabels = [];
    this._poligonoParcial = null;
    this._markersParciales = [];
    this._extraLayers = [];
    this._datosParcialesGuardados = new Map();
    this._manzanaSeleccionada = null;
    this._manzanaSeleccionadaColor = '';
    this._manzanaSeleccionadaNombre = '';
    this._manzanaSeleccionadaTerritorio = null;
    this._manzanaEdges = [];
    this._pendingStyleFrame = null;
    this._pendingStyleQueue = [];
    this._manzanaIndex = [];
    this._allTerritoriesLayer = [];
    this._territoryDataCache.clear();
    this._currentTerritoryColor = '';
  }

  queueStyleUpdate(fn: () => void): void {
    this._pendingStyleQueue.push(fn);
    if (this._pendingStyleFrame === null) {
      this._pendingStyleFrame = requestAnimationFrame(() => {
        this._pendingStyleFrame = null;
        const queue = this._pendingStyleQueue;
        this._pendingStyleQueue = [];
        for (const fn of queue) fn();
      });
    }
  }

  cancelPendingStyleUpdates(): void {
    if (this._pendingStyleFrame !== null) {
      cancelAnimationFrame(this._pendingStyleFrame);
      this._pendingStyleFrame = null;
    }
    this._pendingStyleQueue = [];
  }
}