import {
  Component,
  OnDestroy,
  inject,
  afterNextRender,
  ChangeDetectionStrategy,
} from '@angular/core';
import * as L from 'leaflet';
import { Toast } from '../../core/services/toast';
import { TerritorySearch } from './territory-search/territory-search';
import { type ManzanaMarcada, type FeatureLayer, type DatosParciales } from './map-report.service';
import { MapStateService } from './services/map-state.service';
import { MapRenderingService } from './services/map-rendering.service';
import { MapInteractionService } from './services/map-interaction.service';
import { MapSelectionService } from './services/map-selection.service';
import { MapInitializationService } from './services/map-initialization.service';
import { MapPartialMarkService } from './services/map-partial-mark.service';
import { MapDataPersistenceService } from './services/map-data-persistence.service';
import { TOAST_MESSAGES } from './utils/map-constants';
import type { ModoMarcado } from './types/map.types';

export type { ManzanaMarcada, FeatureLayer, DatosParciales };

@Component({
  selector: 'app-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TerritorySearch],
  templateUrl: './map.html',
  styleUrl: './map.css',
})
export class MapPage implements OnDestroy {
  private state = inject(MapStateService);
  private rendering = inject(MapRenderingService);
  private interaction = inject(MapInteractionService);
  private selection = inject(MapSelectionService);
  private initialization = inject(MapInitializationService);
  private partialMark = inject(MapPartialMarkService);
  private dataPersistence = inject(MapDataPersistenceService);
  private toastService = inject(Toast);

  manzanasMarcadas = this.state.manzanasMarcadas;
  manzanasCount = this.state.manzanasCount;
  totalManzanas = this.state.totalManzanas;
  territorioSeleccionado = this.state.territorioSeleccionado;
  territoriosSeleccionados = this.state.territoriosSeleccionados;
  tieneTerritorio = this.state.tieneTerritorio;
  modoMarcado = this.state.modoMarcado;
  puntosParciales = this.state.puntosParciales;
  puntosCount = this.state.puntosCount;
  puedeConfirmar = this.state.puedeConfirmar;
  enviando = this.state.enviando;
  isLoading = this.state.isLoading;
  isSatellite = this.state.isSatellite;
  predicacion = this.state.predicacion;
  screenshotPreview = this.state.screenshotPreview;

  constructor() {
    afterNextRender(() => this.initMap());
  }

  private initMap(): void {
    const el = document.getElementById('map');
    if (!el) return;

    void this.initialization.initialize(el, (e: L.LeafletMouseEvent) => this.onMapClick(e));
  }


  async onTerritorioSeleccionado(numeros: number[]): Promise<void> {
    // Si se recibe un array vacío, limpiar selección y restaurar visibilidad
    if (numeros.length === 0) {
      this.selection.limpiarMarcas();
      this.rendering.restaurarVisibilidadPoligonos(this.state.manzanasMarcadas(), []);
      return;
    }

    const numsAConsiderar = this.selection.prepareTerritorioSeleccionado(numeros);

    for (const numero of numsAConsiderar) {
      const featureLayer = this.rendering.getAllTerritoriesLayer().find(f => f.territorioPadre === numero);
      if (featureLayer) {
        await this.selection.restaurarMarcadoDesdeDB(numero, featureLayer.color, { actualizarEstadoMarcado: true });
      }
    }
  }

  private onMapClick(e: L.LeafletMouseEvent): void {
    const result = this.interaction.handleMapClick(e);

    switch (result.action) {
      case 'remove_partial':
        if (result.partialId) this.partialMark.eliminarParcial(result.partialId);
        break;
      case 'toggle_manzana':
        if (result.manzana) {
          const m = result.manzana;
          this.selection.toggleManzana(m.id, m.nombreBloque, m.polygon, m.color, m.territorioNumero);
        }
        break;
      case 'select_territory':
        if (result.manzana) {
          void this.handleTerritorySelection(result.manzana.territorioNumero);
        }
        break;
      case 'select_manzana':
        if (result.manzana) {
          this.selection.seleccionarManzana(
            result.manzana.polygon,
            result.manzana.color,
            result.manzana.nombreBloque,
            result.manzana.territorioNumero
          );
          this.toastService.show(TOAST_MESSAGES.selectManzana(result.manzana.nombreBloque));
        } else {
          this.toastService.show(TOAST_MESSAGES.noNearbyManzana);
        }
        break;
      case 'add_partial_point':
        if (result.snappedPoint) this.partialMark.agregarPunto(result.snappedPoint);
        break;
      case 'none':
        if (this.state.modoMarcado() === 'parcial' && this.state.puntosCount() >= 6) {
          this.toastService.show(TOAST_MESSAGES.maxPoints);
        }
        break;
    }
  }

  private async handleTerritorySelection(territorioNumero: number): Promise<void> {
    const current = this.state.territoriosSeleccionados();
    let numeros: number[];

    if (current.includes(territorioNumero)) {
      numeros = current.filter(n => n !== territorioNumero);
    } else if (current.length > 0) {
      numeros = [...current, territorioNumero];
    } else {
      numeros = [territorioNumero];
    }

    await this.onTerritorioSeleccionado(numeros);
  }


  toggleSatellite(): void {
    this.rendering.toggleSatellite();
    this.state.isSatellite.set(this.rendering.isSatellite());
  }

  setModoMarcado(modo: ModoMarcado): void {
    this.selection.setModoMarcado(modo);
  }

  deshacerPunto(): void {
    this.partialMark.deshacerPunto();
  }

  finalizarParcial(): void {
    this.partialMark.finalizarParcial();
  }

  cancelarParcial(): void {
    this.partialMark.cancelarParcial();
  }

  async guardarEnBaseDeDatos(): Promise<void> {
    await this.dataPersistence.guardarEnBaseDeDatos();
  }

  prepararCaptura(): Promise<void> {
    return this.dataPersistence.prepararCaptura();
  }

  restaurarMapaPostCaptura(): void {
    this.dataPersistence.restaurarMapaPostCaptura();
  }

  limpiarMarcas(): void {
    this.selection.limpiarMarcas();
  }

  async guardarYEnviar(): Promise<void> {
    await this.dataPersistence.guardarYEnviar();
  }

  limpiarTodo(): void {
    const hasData = this.state.manzanasMarcadas().length > 0 || this.state.territoriosSeleccionados().length > 0;
    this.limpiarMarcas();

    if (hasData) {
      void this.initialization.reloadAllTerritories();
    }
  }

  ngOnDestroy(): void {
    this.state.cancelPendingStyleUpdates();
    this.rendering.destroy();
  }
}
