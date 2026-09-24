import { Injectable, signal, computed, effect, inject, untracked } from '@angular/core';
import type { SnappedPoint, Edge } from '../map-geometry';
import type { ManzanaMarcada, ModoMarcado } from '../types/map.types';
import { DraftMarksService, MapDraft } from '../../../core/services/map-draft';

const SATELLITE_KEY = 'territory_satellite';
const INICIO_SESION_KEY = 'map_inicio_sesion';

@Injectable({ providedIn: 'root' })
export class MapStateService {
  manzanasById = signal<Map<string, ManzanaMarcada>>(new Map());
  manzanasCount = computed(() => this.manzanasById().size);
  manzanasMarcadaList = computed(() => {
    const arr: ManzanaMarcada[] = [];
    this.manzanasById().forEach(m => arr.push(m));
    return arr;
  });
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
  isSatellite = signal(this.loadSatellite());
  predicacion = signal<string>('tarde');
  screenshotPreview = signal<string | null>(null);
  currentTerritoryColor = signal('');

  manzanaSeleccionadaColor = signal('');
  manzanaSeleccionadaNombre = signal('');
  manzanaSeleccionadaTerritorio = signal<number | null>(null);
  manzanaEdges = signal<Edge[]>([]);

  manzanasByTerritorio = computed(() => {
    const map = new Map<number, ManzanaMarcada[]>();
    for (const m of this.manzanasById().values()) {
      const list = map.get(m.territorioNumero) ?? [];
      list.push(m);
      if (list.length === 1) map.set(m.territorioNumero, list);
    }
    return map;
  });

  private _datosParcialesGuardados: Map<number, { puntos: SnappedPoint[]; geometria: string }> = new Map();

  /**
   * Cuándo se marcó la primera manzana de la salida en curso (ISO-8601). Se
   * envía en los reportes como `inicioSesion` para medir la duración de la
   * salida y el tiempo por manzana en el panel. Se guarda en localStorage
   * para sobrevivir a una recarga con borrador pendiente.
   */
  readonly inicioSesion = signal<string | null>(this.loadInicioSesion());
  /** Evita borrar el inicio guardado antes de que el borrador restaure las marcas. */
  private huboMarcas = false;

  private readonly draftService = inject(DraftMarksService);
  /** Bumped whenever the (non-signal) partial-marks map changes so the draft effect re-runs. */
  private readonly draftRevision = signal(0);
  private draftTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.manzanasById();
      this.territoriosSeleccionados();
      this.modoMarcado();
      this.predicacion();
      this.draftRevision();
      this.scheduleDraftSave();
    });

    effect(() => {
      const satellite = this.isSatellite();
      this.saveSatellite(satellite);
    });

    effect(() => {
      const hayMarcas = this.manzanasById().size > 0;
      untracked(() => {
        if (hayMarcas) {
          this.huboMarcas = true;
          if (!this.inicioSesion()) this.setInicioSesion(new Date().toISOString());
        } else if (this.huboMarcas) {
          // Se enviaron o se desmarcaron todas: la próxima marca abre otra salida.
          this.setInicioSesion(null);
        }
      });
    });
  }

  private loadInicioSesion(): string | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      return localStorage.getItem(INICIO_SESION_KEY);
    } catch {
      return null;
    }
  }

  private setInicioSesion(valor: string | null): void {
    this.inicioSesion.set(valor);
    try {
      if (valor) localStorage.setItem(INICIO_SESION_KEY, valor);
      else localStorage.removeItem(INICIO_SESION_KEY);
    } catch {
      // Storage can be unavailable (private mode)
    }
  }

  private loadSatellite(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(SATELLITE_KEY) === 'true';
  }

  private saveSatellite(value: boolean): void {
    try {
      localStorage.setItem(SATELLITE_KEY, String(value));
    } catch {
      // Storage can be unavailable (private mode)
    }
  }

  private scheduleDraftSave(): void {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      const draft = this.snapshotToDraft();
      this.draftService.guardar(draft);
    }, 400);
  }

  snapshotToDraft(): MapDraft {
    const manzanasById: Record<string, ManzanaMarcada> = {};
    this.manzanasById().forEach((m, id) => { manzanasById[id] = m; });

    const datosParcialesGuardados: MapDraft['datosParcialesGuardados'] = {};
    for (const [num, parcial] of this._datosParcialesGuardados) {
      datosParcialesGuardados[num] = {
        puntos: parcial.puntos.map(p => ({
          lat: p.latlng.lat,
          lng: p.latlng.lng,
          edgeIdx: p.edgeIdx,
          t: p.t,
        })),
        geometria: parcial.geometria,
      };
    }

    return {
      manzanasById,
      territoriosSeleccionados: this.territoriosSeleccionados(),
      territorioSeleccionado: this.territorioSeleccionado(),
      datosParcialesGuardados,
      modoMarcado: this.modoMarcado(),
      predicacion: this.predicacion(),
      savedAt: Date.now(),
    };
  }

  get datosParcialesGuardados(): Map<number, { puntos: SnappedPoint[]; geometria: string }> { return this._datosParcialesGuardados; }
  set datosParcialesGuardados(val: Map<number, { puntos: SnappedPoint[]; geometria: string }>) { this._datosParcialesGuardados = val; }

  getDatosParciales(territorio: number): { puntos: SnappedPoint[]; geometria: string } | null {
    return this._datosParcialesGuardados.get(territorio) ?? null;
  }
  setDatosParciales(territorio: number, val: { puntos: SnappedPoint[]; geometria: string }): void {
    this._datosParcialesGuardados.set(territorio, val);
    this.draftRevision.update(v => v + 1);
  }
  clearDatosParciales(territorio?: number): void {
    if (territorio === undefined) {
      this._datosParcialesGuardados.clear();
    } else {
      this._datosParcialesGuardados.delete(territorio);
    }
    this.draftRevision.update(v => v + 1);
  }

  resetUIState(): void {
    this.manzanasById.set(new Map());
    this.totalManzanas.set(0);
    this.territorioSeleccionado.set(null);
    this.territoriosSeleccionados.set([]);
    this.modoMarcado.set('none');
    this.puntosParciales.set([]);
    this.enviando.set(false);
    this.isLoading.set(false);
    this.screenshotPreview.set(null);
    this.currentTerritoryColor.set('');
    this._datosParcialesGuardados = new Map();
    this.manzanaSeleccionadaColor.set('');
    this.manzanaSeleccionadaNombre.set('');
    this.manzanaSeleccionadaTerritorio.set(null);
    this.manzanaEdges.set([]);
  }
}
