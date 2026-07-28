import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import { MapRenderingService } from './map-rendering.service';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { TOAST_MESSAGES } from '../utils/map-constants';

@Injectable({ providedIn: 'root' })
export class MapInitializationService {
  private rendering = inject(MapRenderingService);
  private selection = inject(MapSelectionService);
  private state = inject(MapStateService);
  private territorioService = inject(TerritorioService);
  private toastService = inject(Toast);

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
      const fl = this.rendering.getAllTerritoriesLayer().find(f => f.territorioPadre === num);
      if (fl) {
        await this.selection.restaurarMarcadoDesdeDB(num, fl.color, { actualizarEstadoMarcado: false });
      }
    }

    if (this.state.modoMarcado() !== 'none' && newlyLoaded.length > 0) {
      this.rendering.ocultarPoligonosNoSeleccionados(this.state.territoriosSeleccionados());
    }
  }

  private async restoreAllMarks(): Promise<void> {
    const BATCH_SIZE = 4;
    const layers = this.rendering.getAllTerritoriesLayer();

    for (let i = 0; i < layers.length; i += BATCH_SIZE) {
      const batch = layers.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(fl =>
          this.selection.restaurarMarcadoDesdeDB(fl.territorioPadre, fl.color, { actualizarEstadoMarcado: false })
        )
      );
    }
  }

  async reloadAllTerritories(): Promise<void> {
    this.territorioService.invalidateAll();
    await this.loadAllTerritories();
  }
}
