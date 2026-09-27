import { Injectable, inject } from '@angular/core';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import { DraftMarksService } from './map-draft';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { TOAST_MESSAGES } from '../utils/map-constants';
import type { MapDraft } from './map-draft';
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

  async initialize(_el: HTMLElement, _onMapClick: unknown): Promise<void> {
    await this.loadAllTerritories();
  }

  private async loadAllTerritories(): Promise<void> {
    if (this.state.isLoading()) return;
    this.state.isLoading.set(true);

    try {
      // In MapLibre mode, fetch territory colors + the metadata DTOs
      // (counts, bounds, label centroids) needed by selection, marking,
      // restoration, counters and labels. Geometry is fetched on demand
      // per territory by the rendering facade.
      await Promise.all([
        this.rendering.fetchAndBuildFeatureLayers(this.territorioService),
        this.rendering.loadTerritoryMetadata(),
      ]);

      // Restore marks from DB/cache for previously worked territories
      await this.restoreAllMarks();
    } catch {
      this.toastService.show(TOAST_MESSAGES.loadError);
    } finally {
      this.state.isLoading.set(false);
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
    // MapLibre mode has no TerritoryData cache (that structure was Leaflet-era:
    // `getTerritoryDataCache()` returns an empty map), so the loaded feature
    // layers are the source of truth for "every known territory". Without this
    // union the list is empty, the revalidation never runs and the marks already
    // stored in the DB stay invisible until the user selects a territory.
    const todos = Array.from(new Set([
      ...layers.map(fl => fl.territorioPadre),
      ...this.rendering.getTerritoryDataCache().keys(),
    ]));
    const draft = this.draftService.cargar();
    const territoriosConDraft = new Set(draft?.territoriosSeleccionados ?? []);
    const sinDraft = todos.filter(n => !territoriosConDraft.has(n));

    if (sinDraft.length === 0) {
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

    // Partial zones saved in the draft must repaint from their stored
    // geometry even when the report path below cannot supply one (legacy
    // drafts): seed the per-territory partial records first so the marked
    // overlay's synthesized partial features resolve before the restore.
    for (const [num, parcial] of Object.entries(draft.datosParcialesGuardados)) {
      const territorioNumero = Number(num);
      if (!Number.isFinite(territorioNumero)) continue;
      this.state.setDatosParciales(territorioNumero, {
        puntos: parcial.puntos.map(p => ({
          latlng: { lat: p.lat, lng: p.lng },
          edgeIdx: p.edgeIdx,
          t: p.t,
        })),
        geometria: parcial.geometria,
      });
    }

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

  /**
   * Public entry point for MapPage — loads territory metadata and restores marks.
   * Called once after the MapLibre engine is initialized.
   */
  async loadAllTerritoriesPublic(): Promise<void> {
    await this.loadAllTerritories();
  }
}
