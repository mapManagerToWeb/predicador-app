import { Injectable, signal, computed } from '@angular/core';
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
  currentTerritoryColor = signal('');

  manzanaSeleccionadaColor = signal('');
  manzanaSeleccionadaNombre = signal('');
  manzanaSeleccionadaTerritorio = signal<number | null>(null);
  manzanaEdges = signal<Edge[]>([]);

  private _datosParcialesGuardados: Map<number, { puntos: SnappedPoint[]; geometria: string }> = new Map();

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
    this.currentTerritoryColor.set('');
    this._datosParcialesGuardados = new Map();
    this.manzanaSeleccionadaColor.set('');
    this.manzanaSeleccionadaNombre.set('');
    this.manzanaSeleccionadaTerritorio.set(null);
    this.manzanaEdges.set([]);
  }
}
