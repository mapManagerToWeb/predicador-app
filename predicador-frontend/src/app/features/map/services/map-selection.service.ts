import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import * as GeoJSON from 'geojson';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapLayerRegistry } from './map-layer-registry.service';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import { TOAST_MESSAGES, nextParcialId } from '../utils/map-constants';
import { elegirUltimoReporte } from '../utils/report-utils';
import {
  getBaseTerritoryStyle,
  getMarkedManzanaStyle,
  getPartialPolygonCompleteStyle,
  getSelectedManzanaStyle,
} from './map-style.service';
import type { ModoMarcado } from '../types/map.types';
import type { Reporte } from '../../../core/models/models';

@Injectable({ providedIn: 'root' })
export class MapSelectionService {
  private readonly state = inject(MapStateService);
  private readonly rendering = inject(MapRenderingFacade);
  private readonly registry = inject(MapLayerRegistry);
  private readonly territorioService = inject(TerritorioService);
  private readonly toastService = inject(Toast);

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

      const featureLayer = this.rendering.getAllTerritoriesLayer().find(f => f.territorioPadre === territorioNumero);
      if (featureLayer) {
        const total = this.rendering.getManzanaIndex().filter(m => m.territorioNumero === territorioNumero).length;
        const marcadas = this.state.manzanasMarcadas().filter(m => m.territorioNumero === territorioNumero).length;
        const isComplete = total > 0 && marcadas >= total;

        this.rendering.applyStyleToFeatureLayer(featureLayer, getBaseTerritoryStyle(featureLayer.color, isComplete));
      }

      this.rendering.ocultarPoligonosNoSeleccionados(this.state.territoriosSeleccionados());
      this.state.totalManzanas.set(
        this.rendering.getManzanaIndex().filter(m => this.state.territoriosSeleccionados().includes(m.territorioNumero)).length
      );
    }

    // Actualizar el color del territorio actual al color de la manzana seleccionada
    this.rendering.setCurrentTerritoryColor(color);
  }

  restaurarManzanaAnterior(): void {
    if (!this.selectedPolygon) return;

    const territorios = this.state.territoriosSeleccionados();
    if (territorios.length > 0) {
      const total = this.rendering.getManzanaIndex().filter(m => m.territorioNumero === territorios[0]).length;
      const marcadas = this.state.manzanasMarcadas().filter(m => m.territorioNumero === territorios[0]).length;
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
    const current = [...this.state.manzanasMarcadas()];
    const idx = current.findIndex(m => m.id === id);

    if (idx >= 0) {
      this.desmarcarManzana(current, idx, territorioNumero, color, layer);
    } else {
      this.marcarManzana(current, id, nombreBloque, layer, color, territorioNumero);
    }

    this.state.manzanasMarcadas.set(current);
    this.state.totalManzanas.set(
      this.rendering.getManzanaIndex().filter(m => this.state.territoriosSeleccionados().includes(m.territorioNumero)).length
    );
  }

  private calcularCompletitudTerritorio(
    territorioNumero: number,
    marcadasList: { territorioNumero: number }[]
  ): { total: number; marcadas: number; isComplete: boolean } {
    const total = this.rendering.getManzanaIndex().filter(m => m.territorioNumero === territorioNumero).length;
    const marcadas = marcadasList.filter(m => m.territorioNumero === territorioNumero).length;
    const isComplete = total > 0 && marcadas >= total;
    return { total, marcadas, isComplete };
  }

  private desmarcarManzana(
    current: { id: string; nombreBloque: string; color: string; territorioNumero: number }[],
    idx: number,
    territorioNumero: number,
    color: string,
    layer: L.Path
  ): void {
    const removed = current[idx];
    current.splice(idx, 1);
    const { marcadas, isComplete } = this.calcularCompletitudTerritorio(territorioNumero, current);
    layer.setStyle(getBaseTerritoryStyle(color, isComplete));
    if (removed) this.registry.unregister(removed.id);

    if (marcadas === 0) {
      this.state.territoriosSeleccionados.update(nums => nums.filter(n => n !== territorioNumero));
      const seleccionados = this.state.territoriosSeleccionados();
      this.state.territorioSeleccionado.set(seleccionados.length === 1 ? seleccionados[0] : null);
      this.rendering.ocultarPoligonosNoSeleccionados(seleccionados);
    }
  }

  private marcarManzana(
    current: { id: string; nombreBloque: string; color: string; territorioNumero: number }[],
    id: string,
    nombreBloque: string,
    layer: L.Path,
    color: string,
    territorioNumero: number
  ): void {
    current.push({ id, nombreBloque, color, territorioNumero });
    this.registry.register(id, layer);
    layer.setStyle(getMarkedManzanaStyle(color));

    if (this.state.territoriosSeleccionados().includes(territorioNumero)) return;

    this.state.territoriosSeleccionados.update(nums => [...nums, territorioNumero]);
    const seleccionados = this.state.territoriosSeleccionados();
    this.state.territorioSeleccionado.set(seleccionados.length === 1 ? territorioNumero : null);

    const featureLayer = this.rendering.getAllTerritoriesLayer().find(f => f.territorioPadre === territorioNumero);
    if (featureLayer) {
      const { isComplete } = this.calcularCompletitudTerritorio(territorioNumero, current);
      this.rendering.applyStyleToFeatureLayer(featureLayer, getBaseTerritoryStyle(featureLayer.color, isComplete));
    }

    this.rendering.ocultarPoligonosNoSeleccionados(seleccionados);
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
      const featureLayer = this.rendering.getAllTerritoriesLayer().find(f => f.territorioPadre === numero);
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
    if (numsAConsiderar.length === 1) {
      const fl = this.rendering.getAllTerritoriesLayer().find(f => f.territorioPadre === numsAConsiderar[0]);
      if (fl) {
        this.state.totalManzanas.set(Array.from(fl.layer.getLayers()).filter(l => l instanceof L.Path).length);
      }
    } else {
      let total = 0;
      for (const numero of numsAConsiderar) {
        const fl = this.rendering.getAllTerritoriesLayer().find(f => f.territorioPadre === numero);
        if (fl) {
          total += Array.from(fl.layer.getLayers()).filter(l => l instanceof L.Path).length;
        }
      }
      this.state.totalManzanas.set(total);
    }
  }

  async restaurarMarcadoDesdeDB(
    territorioNumero: number,
    colorOverride?: string,
    options: { actualizarEstadoMarcado?: boolean } = {}
  ): Promise<void> {
    try {
      const reportes = await this.territorioService.getReportesPorTerritorio(territorioNumero);
      this.restaurarMarcadoConReportes(territorioNumero, reportes, colorOverride, options);
    } catch {
      this.toastService.show(TOAST_MESSAGES.restoreError);
    }
  }

  restaurarMarcadoConReportes(
    territorioNumero: number,
    reportes: Reporte[],
    colorOverride?: string,
    options: { actualizarEstadoMarcado?: boolean } = {}
  ): void {
    try {
      // Preferir SIEMPRE el color específico del featureLayer del territorio para no
      // arrastrar el color global (`currentTerritoryColor`) del último territorio activo.
      const featureLayerColor = this.rendering
        .getAllTerritoriesLayer()
        .find(f => f.territorioPadre === territorioNumero)?.color;
      const color = colorOverride ?? featureLayerColor ?? this.rendering.getCurrentTerritoryColor();
      const { actualizarEstadoMarcado = true } = options;

      // Antes de restaurar, quitar cualquier polígono parcial previo asociado a este
      // territorio para evitar duplicados con distinto id y color al guardar.
      if (actualizarEstadoMarcado) {
        const previosParciales = this.state.manzanasMarcadas()
          .filter(m => m.territorioNumero === territorioNumero && m.id.startsWith('parcial-'));
        for (const p of previosParciales) {
          const layer = this.registry.get(p.id);
          if (layer) this.rendering.removeExtraLayer(layer);
          this.registry.unregister(p.id);
        }
        if (previosParciales.length > 0) {
          this.state.manzanasMarcadas.update(current =>
            current.filter(m => !(m.territorioNumero === territorioNumero && m.id.startsWith('parcial-')))
          );
        }
      }

      const ultimo = elegirUltimoReporte(reportes);
      const ids = ultimo?.manzanasIds ? ultimo.manzanasIds.split(',').filter(Boolean) : [];
      const total = this.rendering.getManzanaIndex().filter(mc => mc.territorioNumero === territorioNumero).length;
      const marcadas = ids.length;
      const isComplete = total > 0 && marcadas >= total;

      this.rendering.applyBaseTerritoryStyle(territorioNumero, color, marcadas, { total, isComplete });

      if (!reportes.length || !ultimo) return;

      const manzanaId = ultimo.manzanaId ? String(ultimo.manzanaId) : null;
      const existingIds = new Set(
        this.state.manzanasMarcadas().filter(m => m.territorioNumero === territorioNumero).map(m => m.id)
      );

      for (const mc of this.rendering.getManzanaIndex()) {
        if (mc.territorioNumero !== territorioNumero) continue;
        const isMarked = ids.includes(mc.id) || (manzanaId !== null && mc.id === manzanaId);
        if (isMarked) {
          mc.polygon.setStyle(getMarkedManzanaStyle(color));
          if (actualizarEstadoMarcado && !existingIds.has(mc.id)) {
            this.registry.register(mc.id, mc.polygon);
            this.state.manzanasMarcadas.update(current => [
              ...current,
              { id: mc.id, nombreBloque: mc.nombreBloque, color, territorioNumero },
            ]);
          }
        }
      }

      if (ultimo.geometriaParcial) {
        this.restaurarGeometriaParcial(ultimo.geometriaParcial, color, territorioNumero, actualizarEstadoMarcado);
      }
    } catch {
      this.toastService.show(TOAST_MESSAGES.restoreError);
    }
  }

  private restaurarGeometriaParcial(
    geometriaParcial: string,
    color: string,
    territorioNumero: number,
    actualizarEstadoMarcado: boolean
  ): void {
    const map = this.rendering.getMap();
    if (!map) return;

    try {
      const geometry = JSON.parse(geometriaParcial) as GeoJSON.Geometry;
      let latlngs: L.LatLngExpression[] = [];

      if (geometry.type === 'Polygon') {
        latlngs = (geometry as GeoJSON.Polygon).coordinates[0].map(c => L.latLng(c[1], c[0]));
      } else if (geometry.type === 'MultiPolygon') {
        latlngs = (geometry as GeoJSON.MultiPolygon).coordinates[0][0].map(c => L.latLng(c[1], c[0]));
      }

      if (latlngs.length === 0) return;

      const parcialId = nextParcialId();
      const polygon = L.polygon(latlngs, getPartialPolygonCompleteStyle(color)).addTo(map);

      this.rendering.addExtraLayer(polygon);

      if (actualizarEstadoMarcado) {
        this.registry.register(parcialId, polygon);
        this.state.manzanasMarcadas.update(current => [
          ...current,
          { id: parcialId, nombreBloque: 'Zona parcial', color, territorioNumero },
        ]);
      }
    } catch {
      /* ignore parse errors */
    }
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
      this.rendering.restaurarVisibilidadPoligonos(this.state.manzanasMarcadas(), this.state.territoriosSeleccionados());
    }
  }

  limpiarMarcas(): void {
    this.registry.clear();
    this.state.manzanasMarcadas.set([]);
    this.resetUIState();
    this.rendering.limpiarMarcasVisuales();
    this.state.totalManzanas.set(0);
    this.state.territorioSeleccionado.set(null);
    this.state.territoriosSeleccionados.set([]);
    this.rendering.setCurrentTerritoryColor('');
  }

  private reaplicarMarcasTerritorio(territorioNumero: number): void {
    this.rendering.reaplicarMarcasTerritorio(this.state.manzanasMarcadas(), [territorioNumero]);
  }

  reaplicarMarcasSeleccionadas(): void {
    this.rendering.reaplicarMarcasTerritorio(this.state.manzanasMarcadas(), this.state.territoriosSeleccionados());
  }

  private resetUIState(): void {
    this.limpiarParcial();
    this.restaurarManzanaAnterior();
    this.state.modoMarcado.set('none');
    this.rendering.clearExtraLayers();
    this.rendering.restaurarVisibilidadPoligonos(this.state.manzanasMarcadas(), this.state.territoriosSeleccionados());
  }

  limpiarParcial(): void {
    this.rendering.limpiarCapasParciales();
    this.state.puntosParciales.set([]);
  }
}
