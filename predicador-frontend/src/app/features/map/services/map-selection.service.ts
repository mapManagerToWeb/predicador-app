import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapLayerRegistry } from './map-layer-registry.service';
import { MapMarkRestorationService } from './map-mark-restoration.service';
import { Toast } from '../../../core/services/toast';
import { DraftMarksService } from '../../../core/services/map-draft';
import { TOAST_MESSAGES } from '../utils/map-constants';
import {
  getBaseTerritoryStyle,
  getMarkedManzanaStyle,
  getSelectedManzanaStyle,
} from './map-style.service';
import { getTerritoryProgress } from '../utils/territory-progress';
import type { ModoMarcado } from '../types/map.types';
import type { Reporte } from '../../../core/models/models';

@Injectable({ providedIn: 'root' })
export class MapSelectionService {
  private readonly state = inject(MapStateService);
  private readonly rendering = inject(MapRenderingFacade);
  private readonly registry = inject(MapLayerRegistry);
  private readonly restoration = inject(MapMarkRestorationService);
  private readonly toastService = inject(Toast);
  private readonly draftService = inject(DraftMarksService);

  /** The currently selected manzana polygon (transient UI state, not in state). */
  private selectedPolygon: L.Polygon | null = null;

  seleccionarManzana(polygon: L.Polygon, color: string, nombreBloque: string, territorioNumero: number): void {
    this.restaurarManzanaAnterior();

    this.selectedPolygon = polygon;
    this.state.manzanaSeleccionadaColor.set(color);
    this.state.manzanaSeleccionadaNombre.set(nombreBloque);
    this.state.manzanaSeleccionadaTerritorio.set(territorioNumero);

    const rings = polygon.getLatLngs();
    const outer = rings[0] as L.LatLng[];
    const edges: { from: L.LatLng; to: L.LatLng }[] = [];
    if (outer && outer.length >= 3) {
      for (let i = 0; i < outer.length - 1; i++) {
        edges.push({ from: outer[i], to: outer[i + 1] });
      }
      edges.push({ from: outer[outer.length - 1], to: outer[0] });
    }
    this.state.manzanaEdges.set(edges);

    polygon.setStyle(getSelectedManzanaStyle());

    if (!this.state.territoriosSeleccionados().includes(territorioNumero)) {
      this.state.territoriosSeleccionados.update(nums => [...nums, territorioNumero]);
      this.state.territorioSeleccionado.set(
        this.state.territoriosSeleccionados().length === 1 ? territorioNumero : null
      );

      const featureLayer = this.rendering.getFeatureLayerByTerritorio(territorioNumero);
      if (featureLayer) {
        const total = this.rendering.getManzanaCountByTerritorio(territorioNumero);
        const marcadas = this.state.manzanasByTerritorio().get(territorioNumero)?.length ?? 0;
        const isComplete = total > 0 && marcadas >= total;

        this.rendering.applyStyleToFeatureLayer(featureLayer, getBaseTerritoryStyle(featureLayer.color, isComplete));
      }

      this.rendering.ocultarPoligonosNoSeleccionados(this.state.territoriosSeleccionados());
      this.state.totalManzanas.set(
        this.state.territoriosSeleccionados().reduce(
          (sum, n) => sum + this.rendering.getManzanaCountByTerritorio(n), 0
        )
      );
    }

    // Actualizar el color del territorio actual al color de la manzana seleccionada
    this.rendering.setCurrentTerritoryColor(color);
  }

  restaurarManzanaAnterior(): void {
    if (!this.selectedPolygon) return;

    const territorios = this.state.territoriosSeleccionados();
    if (territorios.length > 0) {
      const total = this.rendering.getManzanaCountByTerritorio(territorios[0]);
      const marcadas = this.state.manzanasByTerritorio().get(territorios[0])?.length ?? 0;
      const isComplete = total > 0 && marcadas >= total;

      this.selectedPolygon.setStyle(
        getBaseTerritoryStyle(this.state.manzanaSeleccionadaColor(), isComplete)
      );
    }

    this.selectedPolygon = null;
    this.state.manzanaSeleccionadaNombre.set('');
    this.state.manzanaSeleccionadaTerritorio.set(null);
    this.state.manzanaEdges.set([]);
  }

  toggleManzana(id: string, nombreBloque: string, layer: L.Path, color: string, territorioNumero: number): void {
    if (this.state.manzanasById().has(id)) {
      this.desmarcarManzana(id, territorioNumero, color, layer);
    } else {
      this.marcarManzana(id, nombreBloque, layer, color, territorioNumero);
    }
  }

  private desmarcarManzana(
    id: string,
    territorioNumero: number,
    color: string,
    layer: L.Path
  ): void {
    const newMap = new Map(this.state.manzanasById());
    newMap.delete(id);
    this.state.manzanasById.set(newMap);
    const marcadas = this.state.manzanasByTerritorio().get(territorioNumero) ?? [];
    const { marcadas: marcadasCount, isComplete } = getTerritoryProgress(this.rendering.getManzanaCountByTerritorio(territorioNumero), marcadas.length);
    layer.setStyle(getBaseTerritoryStyle(color, isComplete));
    this.registry.unregister(id);

    if (marcadasCount === 0) {
      this.state.territoriosSeleccionados.update(nums => nums.filter(n => n !== territorioNumero));
      const seleccionados = this.state.territoriosSeleccionados();
      this.state.territorioSeleccionado.set(seleccionados.length === 1 ? seleccionados[0] : null);
      this.rendering.ocultarPoligonosNoSeleccionados(seleccionados);
    }

    this.updateTotalManzanas(this.state.territoriosSeleccionados());
  }

  marcarManzana(
    id: string,
    nombreBloque: string,
    layer: L.Path,
    color: string,
    territorioNumero: number
  ): void {
    const newMap = new Map(this.state.manzanasById());
    newMap.set(id, { id, nombreBloque, color, territorioNumero });
    this.state.manzanasById.set(newMap);
    this.registry.register(id, layer);
    layer.setStyle(getMarkedManzanaStyle(color));

    if (this.state.territoriosSeleccionados().includes(territorioNumero)) return;

    this.state.territoriosSeleccionados.update(nums => [...nums, territorioNumero]);
    const seleccionados = this.state.territoriosSeleccionados();
    this.state.territorioSeleccionado.set(seleccionados.length === 1 ? territorioNumero : null);

    const featureLayer = this.rendering.getFeatureLayerByTerritorio(territorioNumero);
    if (featureLayer) {
      const marcadas = this.state.manzanasByTerritorio().get(territorioNumero) ?? [];
      const { isComplete } = getTerritoryProgress(this.rendering.getManzanaCountByTerritorio(territorioNumero), marcadas.length);
      this.rendering.applyStyleToFeatureLayer(featureLayer, getBaseTerritoryStyle(featureLayer.color, isComplete));
    }

    this.rendering.ocultarPoligonosNoSeleccionados(seleccionados);
    this.updateTotalManzanas(this.state.territoriosSeleccionados());
  }

  prepareTerritorioSeleccionado(numeros: number[]): number[] {
    const estabaEnModoMarcado = this.state.modoMarcado() !== 'none';

    // Limpiar explícitamente el estado parcial y de selección de manzana al cambiar de territorio
    this.limpiarParcial();
    this.restaurarManzanaAnterior();

    if (!estabaEnModoMarcado) {
      this.resetUIState();
    } else {
      this.rendering.clearExtraLayers();
    }

    if (estabaEnModoMarcado) {
      const existentes = new Set(this.state.territoriosSeleccionados());
      for (const n of numeros) existentes.add(n);
      this.state.territoriosSeleccionados.set(Array.from(existentes));
    } else {
      this.state.modoMarcado.set('none');
      this.state.territoriosSeleccionados.set(numeros);
    }

    this.state.territorioSeleccionado.set(
      this.state.territoriosSeleccionados().length === 1 ? this.state.territoriosSeleccionados()[0] : null
    );

    for (const numero of numeros) {
      this.rendering.ensureTerritoryLoaded(numero);
    }

    const numsAConsiderar = estabaEnModoMarcado ? this.state.territoriosSeleccionados() : numeros;

    let combinedBounds: L.LatLngBounds | null = null;
    for (const numero of numsAConsiderar) {
      const featureLayer = this.rendering.getFeatureLayerByTerritorio(numero);
      if (!featureLayer) continue;

      this.rendering.setCurrentTerritoryColor(featureLayer.color);
      this.reaplicarMarcasTerritorio(numero);

      const bounds = featureLayer.layer.getBounds();
      if (bounds.isValid()) {
        if (!combinedBounds) combinedBounds = bounds;
        else combinedBounds.extend(bounds);
      }
    }

    const map = this.rendering.getMap();
    if (combinedBounds && combinedBounds.isValid() && map) {
      map.fitBounds(combinedBounds, { padding: [30, 30] });
    }

    this.rendering.cancelPendingStyleUpdates();
    this.rendering.ocultarPoligonosNoSeleccionados(this.state.territoriosSeleccionados());
    this.updateTotalManzanas(numsAConsiderar);

    return numsAConsiderar;
  }

  private updateTotalManzanas(numsAConsiderar: number[]): void {
    const total = numsAConsiderar.reduce(
      (sum, n) => sum + this.rendering.getManzanaCountByTerritorio(n), 0
    );
    this.state.totalManzanas.set(total);
  }

  async restaurarMarcadoDesdeDB(
    territorioNumero: number,
    colorOverride?: string,
    options: { actualizarEstadoMarcado?: boolean } = {}
  ): Promise<void> {
    await this.restoration.restaurarDesdeDB(territorioNumero, colorOverride, options);
  }

  restaurarMarcadoConReportes(
    territorioNumero: number,
    reportes: Reporte[],
    colorOverride?: string,
    options: { actualizarEstadoMarcado?: boolean } = {}
  ): void {
    this.restoration.restaurarConReportes(territorioNumero, reportes, colorOverride, options);
  }

  setModoMarcado(modo: ModoMarcado): void {
    if (this.state.modoMarcado() !== modo) {
      this.limpiarParcial();
      this.restaurarManzanaAnterior();
    }
    this.state.modoMarcado.set(modo);

    if (modo === 'completa' || modo === 'parcial') {
      this.rendering.ocultarPoligonosNoSeleccionados(this.state.territoriosSeleccionados());
      this.toastService.show(modo === 'parcial' ? TOAST_MESSAGES.partialMode : TOAST_MESSAGES.completeMode);
    } else {
      this.rendering.restaurarVisibilidadPoligonos(this.state.manzanasMarcadaList(), this.state.territoriosSeleccionados());
    }
  }

  limpiarMarcas(): void {
    this.registry.clear();
    this.state.manzanasById.set(new Map());
    this.resetUIState();
    this.rendering.limpiarMarcasVisuales();
    this.state.totalManzanas.set(0);
    this.state.territorioSeleccionado.set(null);
    this.state.territoriosSeleccionados.set([]);
    this.rendering.setCurrentTerritoryColor('');
    this.draftService.clear();
  }

  private reaplicarMarcasTerritorio(territorioNumero: number): void {
    this.rendering.reaplicarMarcasTerritorio(this.state.manzanasMarcadaList(), [territorioNumero]);
  }

  reaplicarMarcasSeleccionadas(): void {
    this.rendering.reaplicarMarcasTerritorio(this.state.manzanasMarcadaList(), this.state.territoriosSeleccionados());
  }

  private resetUIState(): void {
    this.limpiarParcial();
    this.restaurarManzanaAnterior();
    this.state.modoMarcado.set('none');
    this.rendering.clearExtraLayers();
    this.rendering.restaurarVisibilidadPoligonos(this.state.manzanasMarcadaList(), this.state.territoriosSeleccionados());
  }

  limpiarParcial(): void {
    this.rendering.limpiarCapasParciales();
    this.state.puntosParciales.set([]);
  }
}
