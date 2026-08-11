import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { TOAST_MESSAGES } from '../utils/map-constants';

@Injectable({ providedIn: 'root' })
export class MapInitializationService {
  private readonly rendering = inject(MapRenderingFacade);
  private readonly selection = inject(MapSelectionService);
  private readonly state = inject(MapStateService);
  private readonly territorioService = inject(TerritorioService);
  private readonly toastService = inject(Toast);

  async initialize(el: HTMLElement, onMapClick: (e: L.LeafletMouseEvent) => void): Promise<void> {
    this.rendering.initializeMap(el);
    const map = this.rendering.getMap();
    if (!map) return;

    this.rendering.setManzanaClickHandler((id, nombreBloque, polygon, color, territorioNumero, e) => {
      if (this.state.modoMarcado() === 'completa') {
        L.DomEvent.stop(e);
        // En modo marcar-completo solo se marcan manzanas de territorios YA
        // seleccionados. Togglear un territorio ajeno desde aquí lo agregaría
        // a la selección, igual que el parcial bloquea clicks fuera del suyo.
        if (this.state.territoriosSeleccionados().includes(territorioNumero)) {
          this.selection.toggleManzana(id, nombreBloque, polygon, color, territorioNumero);
        }
      }
    });

    map.on('click', onMapClick);
    map.on('zoomend', () => this.rendering.updateLabelsVisibility());
    map.on('moveend', () => void this.onMoveEnd());

    await this.loadAllTerritories();
  }

  private async loadAllTerritories(): Promise<void> {
    if (this.state.isLoading()) return;
    this.state.isLoading.set(true);

    try {
      await this.loadTerritoriesWithRetry();
      await this.onMoveEnd();
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

  private async onMoveEnd(): Promise<void> {
    const newlyLoaded = this.rendering.updateVisibleTerritories();

    for (const num of newlyLoaded) {
      const fl = this.rendering.getFeatureLayerByTerritorio(num);
      if (fl) {
        await this.selection.restaurarMarcadoDesdeDB(num, fl.color, { actualizarEstadoMarcado: false });
      }
    }

    if (this.state.modoMarcado() !== 'none' && newlyLoaded.length > 0) {
      this.rendering.ocultarPoligonosNoSeleccionados(this.state.territoriosSeleccionados());
    }
  }

  private async restoreAllMarks(): Promise<void> {
    const layers = this.rendering.getAllTerritoriesLayer();
    const territorios = layers.map(fl => fl.territorioPadre);

    if (territorios.length === 0) return;

    const reportesPorTerritorio = await this.territorioService.getReportesPorTerritorios(territorios);

    for (const fl of layers) {
      const reportes = reportesPorTerritorio.get(fl.territorioPadre) ?? [];
      this.selection.restaurarMarcadoConReportes(fl.territorioPadre, reportes, fl.color, { actualizarEstadoMarcado: false });
    }
  }

  async reloadAllTerritories(): Promise<void> {
    this.territorioService.invalidateAll();
    await this.loadAllTerritories();
  }
}
