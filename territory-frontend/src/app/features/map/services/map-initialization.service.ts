import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import { DraftMarksService } from '../../../core/services/map-draft';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { TOAST_MESSAGES } from '../utils/map-constants';
import type { MapDraft } from '../../../core/services/map-draft';
import type { Reporte } from '../../../core/models/models';
import type { FeatureLayer } from '../types/map.types';

@Injectable({ providedIn: 'root' })
export class MapInitializationService {
  private readonly rendering = inject(MapRenderingFacade);
  private readonly selection = inject(MapSelectionService);
  private readonly state = inject(MapStateService);
  private readonly territorioService = inject(TerritorioService);
  private readonly toastService = inject(Toast);
  private readonly draftService = inject(DraftMarksService);

  async initialize(el: HTMLElement, onMapClick: (e: L.LeafletMouseEvent) => void): Promise<void> {
    this.rendering.initializeMap(el);
    const map = this.rendering.getMap();
    if (!map) return;

    this.rendering.setManzanaClickHandler((id, nombreBloque, polygon, color, territorioNumero, e) => {
      if (this.state.modoMarcado() !== 'completa') return;

      L.DomEvent.stop(e);
      // En modo marcar-completo solo se marcan manzanas de territorios YA
      // seleccionados y nunca se desmarcan: un manzana ya marcada es un no-op,
      // y un click sobre un territorio ajeno lo agregaría a la selección
      // (igual que el parcial bloquea clicks fuera del suyo).
      if (!this.state.territoriosSeleccionados().includes(territorioNumero)) return;
      if (this.state.manzanasById().has(id)) return;
      this.selection.marcarManzana(id, nombreBloque, polygon, color, territorioNumero);
    });

    map.on('click', onMapClick);
    map.on('zoomend', () => this.rendering.updateLabelsVisibility());
    map.on('moveend', () => this.onMoveEnd());

    await this.loadAllTerritories();
  }

  private async loadAllTerritories(): Promise<void> {
    if (this.state.isLoading()) return;
    this.state.isLoading.set(true);

    try {
      await this.loadTerritoriesWithRetry();
      this.onMoveEnd();
      await this.restoreAllMarks();
    } catch {
      this.toastService.show(TOAST_MESSAGES.loadError);
    } finally {
      this.state.isLoading.set(false);
    }
  }

  /**
   * Reintenta la carga inicial de territorios con backoff. Durante el arranque
   * en frío del stack los servicios todavía no se registran en Eureka y el
   * gateway no puede resolver `lb://territory-service` (502/503). El retry del
   * gateway no ayuda ahí — el load balancer falla antes de llegar a él — así
   * que reintentamos desde el frontend para no obligar al usuario a recargar.
   *
   * El territory-service puede tardar hasta ~150s en arrancar cuando conecta a
   * una BD cloud (Neon): HikariPool inicializa, Flyway valida y el registro en
   * Eureka se propaga. Por eso el backoff es lineal y prolongado (20 intentos
   * x 10s = 200s máx) en vez de exponencial corto.
   */
  private static readonly MAX_LOAD_RETRIES = 20;
  private static readonly LOAD_RETRY_DELAY_MS = 10000;

  private async loadTerritoriesWithRetry(attempt = 1): Promise<void> {
    try {
      await this.rendering.loadAllTerritories(this.territorioService);
    } catch (error) {
      if (attempt >= MapInitializationService.MAX_LOAD_RETRIES) throw error;
      await new Promise(resolve => setTimeout(resolve, MapInitializationService.LOAD_RETRY_DELAY_MS));
      await this.loadTerritoriesWithRetry(attempt + 1);
    }
  }

  private onMoveEnd(): void {
    const newlyLoaded = this.rendering.updateVisibleTerritories();
    if (newlyLoaded.length === 0) return;

    const draft = this.draftService.cargar();

    for (const num of newlyLoaded) {
      const fl = this.rendering.getFeatureLayerByTerritorio(num);
      if (!fl) continue;

      // Sin red: los territorios recién visibles se pintan desde el cache de
      // localStorage (sembrado por la revalidación de restoreAllMarks) o desde
      // el draft si están en borrador. El revalidador ya marcó los vacíos como
      // -1, así que un territorio sin cache no pinta nada y no pide reportes.
      if (draft?.territoriosSeleccionados.includes(num)) {
        this.selection.restaurarMarcadoConReportes(
          num,
          [this.reporteDesdeDraft(draft, num)],
          fl.color,
          { actualizarEstadoMarcado: false }
        );
        continue;
      }

      const cached = this.territorioService.getReportesDesdeCache([num]).get(num) ?? [];
      this.selection.restaurarMarcadoConReportes(num, cached, fl.color, { actualizarEstadoMarcado: false });
    }

    // Ocultar los no seleccionados siempre que haya una selección activa
    // (no solo en modo marcado), para que no reaparezcan al navegar el mapa.
    if (this.state.territoriosSeleccionados().length > 0) {
      this.rendering.ocultarPoligonosNoSeleccionados(this.state.territoriosSeleccionados());
    }
  }

  private async restoreAllMarks(): Promise<void> {
    const layers = this.rendering.getAllTerritoriesLayer();
    const draft = this.draftService.cargar();
    const territoriosConDraft = new Set(draft?.territoriosSeleccionados ?? []);

    if (layers.length > 0) {
      // 1) Pintado instantáneo desde localStorage (draft mandó en su territorio).
      const instantaneo = this.territorioService.getReportesDesdeCache(layers.map(fl => fl.territorioPadre));
      for (const fl of layers) {
        if (territoriosConDraft.has(fl.territorioPadre)) continue;
        this.selection.restaurarMarcadoConReportes(
          fl.territorioPadre,
          instantaneo.get(fl.territorioPadre) ?? [],
          fl.color,
          { actualizarEstadoMarcado: false }
        );
      }

      // 2) Restaurar draft (geom por id + territoriosSeleccionados + modo).
      if (draft) {
        this.restaurarMarcadoDesdeDraft(draft, layers);
      }
    }

    // 3) Revalidación de fondo de TODOS los territorios (no solo los cargados):
    // el `/versions` filtra a no-vacíos, siembra el cache de localStorage y
    // marca los vacíos como -1, así los pan/zoom posteriores no hacen red.
    await this.revalidarTodos(layers);
  }

  private async revalidarTodos(layers: FeatureLayer[]): Promise<void> {
    const todos = Array.from(this.rendering.getTerritoryDataCache().keys());
    const draft = this.draftService.cargar();
    const territoriosConDraft = new Set(draft?.territoriosSeleccionados ?? []);
    const sinDraft = todos.filter(n => !territoriosConDraft.has(n));

    if (sinDraft.length === 0) {
      this.selection.reaplicarMarcasSeleccionadas();
      return;
    }

    try {
      const revalidado = await this.territorioService.revalidarReportes(sinDraft);
      for (const [num, reportes] of revalidado) {
        const fl = layers.find(f => f.territorioPadre === num);
        if (!fl) continue; // Aún sin capa: el cache ya quedó sembrado para cuando se cargue.
        this.selection.restaurarMarcadoConReportes(num, reportes, fl.color, { actualizarEstadoMarcado: false });
      }
    } catch {
      // Offline/backend caído: el mapa ya pintó desde el cache; sin reintento.
    }
  }

  private restaurarMarcadoDesdeDraft(draft: MapDraft, layers: FeatureLayer[]): void {
    this.state.manzanasById.set(
      new Map(Object.entries(draft.manzanasById).map(([id, m]) => [id, m]))
    );
    this.state.territoriosSeleccionados.set(draft.territoriosSeleccionados);
    this.state.territorioSeleccionado.set(draft.territorioSeleccionado);
    this.state.modoMarcado.set(draft.modoMarcado);
    this.state.predicacion.set(draft.predicacion);

    for (const num of draft.territoriosSeleccionados) {
      const fl = layers.find(f => f.territorioPadre === num);
      this.selection.restaurarMarcadoConReportes(
        num,
        [this.reporteDesdeDraft(draft, num)],
        fl?.color,
        { actualizarEstadoMarcado: false }
      );
    }
  }

  private reporteDesdeDraft(draft: MapDraft, territorioNumero: number): Reporte {
    const manzanas = Object.values(draft.manzanasById)
      .filter(m => m.territorioNumero === territorioNumero)
      .map(m => m.id);
    const parcial = draft.datosParcialesGuardados[territorioNumero];
    return {
      id: 0,
      manzanaId: manzanas.filter(id => !id.startsWith('parcial-'))[0] ?? null,
      fecha: new Date(draft.savedAt).toISOString(),
      encargadoId: 0,
      encargadoNombre: '',
      encargadoApellido: '',
      sessionTime: '',
      estado: draft.modoMarcado === 'completa' ? 'completed' : 'incomplete',
      territorioNumero,
      totalManzanas: 0,
      manzanasMarcadas: manzanas.length,
      tipoSesion: draft.modoMarcado === 'completa' ? 'completa' : 'parcial',
      geometriaParcial: parcial?.geometria ?? null,
      puntosParciales: parcial ? JSON.stringify(parcial.puntos.map(p => ({ lat: p.lat, lng: p.lng }))) : null,
      manzanasIds: manzanas.filter(id => !id.startsWith('parcial-')).join(',') || null,
    };
  }

  async reloadAllTerritories(): Promise<void> {
    this.territorioService.limpiarCache();
    await this.loadAllTerritories();
  }
}
