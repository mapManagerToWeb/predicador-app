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
        this.selection.toggleManzana(id, nombreBloque, polygon, color, territorioNumero);
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
      await this.rendering.loadAllTerritories(this.territorioService);
      await this.onMoveEnd();
      await this.restoreAllMarks();
    } catch {
      this.toastService.show(TOAST_MESSAGES.loadError);
    } finally {
      this.state.isLoading.set(false);
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
