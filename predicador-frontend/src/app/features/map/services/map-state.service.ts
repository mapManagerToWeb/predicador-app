import { Injectable, signal, computed } from '@angular/core';
import type * as L from 'leaflet';
import type { SnappedPoint, Edge } from '../map-geometry';
import type { ManzanaMarcada, ModoMarcado } from '../types/map.types';

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

  private _datosParcialesGuardados: Map<number, { puntos: SnappedPoint[]; geometria: string }> = new Map();
  private _manzanaSeleccionada: L.Polygon | null = null;
  private _manzanaSeleccionadaColor = '';
  private _manzanaSeleccionadaNombre = '';
  private _manzanaSeleccionadaTerritorio: number | null = null;
  private _manzanaEdges: Edge[] = [];

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
    this._datosParcialesGuardados = new Map();
    this._manzanaSeleccionada = null;
    this._manzanaSeleccionadaColor = '';
    this._manzanaSeleccionadaNombre = '';
    this._manzanaSeleccionadaTerritorio = null;
    this._manzanaEdges = [];
  }
}
