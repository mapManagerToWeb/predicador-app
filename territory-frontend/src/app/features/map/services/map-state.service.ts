import { Injectable, signal, computed, effect, inject, untracked } from '@angular/core';
import type { EdicionLados, ManzanaMarcada, ModoMarcado, ZonaParcial } from '../types/map.types';
import { serializarZonas } from '../utils/lados';
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
  /** Zonas parciales (por lados) de la salida en curso, por id `parcial-…`. */
  zonasParciales = signal<Map<string, ZonaParcial>>(new Map());
  /** Manzana abierta en modo parcial para elegir sus lados. */
  edicionLados = signal<EdicionLados | null>(null);

  enviando = signal(false);
  isLoading = signal(false);
  isSatellite = signal(this.loadSatellite());
  predicacion = signal<string>('tarde');
  screenshotPreview = signal<string | null>(null);
  currentTerritoryColor = signal('');

  manzanaSeleccionadaColor = signal('');
  manzanaSeleccionadaNombre = signal('');
  manzanaSeleccionadaTerritorio = signal<number | null>(null);

  manzanasByTerritorio = computed(() => {
    const map = new Map<number, ManzanaMarcada[]>();
    for (const m of this.manzanasById().values()) {
      const list = map.get(m.territorioNumero) ?? [];
      list.push(m);
      if (list.length === 1) map.set(m.territorioNumero, list);
    }
    return map;
  });

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
  private draftTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.manzanasById();
      this.territoriosSeleccionados();
      this.modoMarcado();
      this.predicacion();
      this.zonasParciales();
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
    for (const territorio of new Set([...this.zonasParciales().values()].map(z => z.territorio))) {
      const { geometriaParcial, puntosParciales } = serializarZonas(this.zonasDeTerritorio(territorio));
      if (geometriaParcial) {
        datosParcialesGuardados[territorio] = { puntos: [], geometria: geometriaParcial, detalle: puntosParciales ?? undefined };
      }
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

  zonasDeTerritorio(territorio: number): ZonaParcial[] {
    return [...this.zonasParciales().values()].filter(z => z.territorio === territorio);
  }

  resetUIState(): void {
    this.manzanasById.set(new Map());
    this.totalManzanas.set(0);
    this.territorioSeleccionado.set(null);
    this.territoriosSeleccionados.set([]);
    this.modoMarcado.set('none');
    this.zonasParciales.set(new Map());
    this.edicionLados.set(null);
    this.enviando.set(false);
    this.isLoading.set(false);
    this.screenshotPreview.set(null);
    this.currentTerritoryColor.set('');
    this.manzanaSeleccionadaColor.set('');
    this.manzanaSeleccionadaNombre.set('');
    this.manzanaSeleccionadaTerritorio.set(null);
  }
}
