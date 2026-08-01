import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import { getTerritoryFillOpacity } from '../utils/territory-colors';
import { TOAST_MESSAGES, STYLE_DEFAULTS } from '../utils/map-constants';
import { elegirUltimoReporte } from '../utils/report-utils';
import type { ModoMarcado } from '../types/map.types';
import type { Reporte } from '../../../core/models/models';

@Injectable({ providedIn: 'root' })
export class MapSelectionService {
  private readonly state = inject(MapStateService);
  private readonly rendering = inject(MapRenderingFacade);
  private readonly territorioService = inject(TerritorioService);
  private readonly toastService = inject(Toast);

  seleccionarManzana(polygon: L.Polygon, color: string, nombreBloque: string, territorioNumero: number): void {
    this.restaurarManzanaAnterior();

    this.state.manzanaSeleccionada = polygon;
    this.state.manzanaSeleccionadaColor = color;
    this.state.manzanaSeleccionadaNombre = nombreBloque;
    this.state.manzanaSeleccionadaTerritorio = territorioNumero;

    const rings = polygon.getLatLngs();
    const outer = rings[0] as L.LatLng[];
    const edges: { from: L.LatLng; to: L.LatLng }[] = [];
    if (outer && outer.length >= 3) {
      for (let i = 0; i < outer.length - 1; i++) {
        edges.push({ from: outer[i], to: outer[i + 1] });
      }
      edges.push({ from: outer[outer.length - 1], to: outer[0] });
    }
    this.state.manzanaEdges = edges;

    polygon.setStyle(STYLE_DEFAULTS.selectedManzana);

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
        const baseOpacity = getTerritoryFillOpacity(isComplete);

        this.rendering.applyStyleToFeatureLayer(featureLayer, { opacity: 1, fillOpacity: baseOpacity, color: featureLayer.color, weight: STYLE_DEFAULTS.polygon.weight, stroke: true });
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
    if (!this.state.manzanaSeleccionada) return;

    const territorios = this.state.territoriosSeleccionados();
    if (territorios.length > 0) {
      const total = this.rendering.getManzanaIndex().filter(m => m.territorioNumero === territorios[0]).length;
      const marcadas = this.state.manzanasMarcadas().filter(m => m.territorioNumero === territorios[0]).length;
      const isComplete = total > 0 && marcadas >= total;
      const baseOpacity = getTerritoryFillOpacity(isComplete);

      this.state.manzanaSeleccionada.setStyle({
        color: this.state.manzanaSeleccionadaColor,
        fillColor: this.state.manzanaSeleccionadaColor,
        fillOpacity: baseOpacity,
        weight: STYLE_DEFAULTS.polygon.weight,
      });
    }

    this.state.manzanaSeleccionada = null;
    this.state.manzanaSeleccionadaNombre = '';
    this.state.manzanaSeleccionadaTerritorio = null;
    this.state.manzanaEdges = [];
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
  ): { total: number; marcadas: number; isComplete: boolean; baseOpacity: number } {
    const total = this.rendering.getManzanaIndex().filter(m => m.territorioNumero === territorioNumero).length;
    const marcadas = marcadasList.filter(m => m.territorioNumero === territorioNumero).length;
    const isComplete = total > 0 && marcadas >= total;
    const baseOpacity = getTerritoryFillOpacity(isComplete);
    return { total, marcadas, isComplete, baseOpacity };
  }

  private desmarcarManzana(
    current: { id: string; nombreBloque: string; layer: L.Path; territorioNumero: number }[],
    idx: number,
    territorioNumero: number,
    color: string,
    layer: L.Path
  ): void {
    current.splice(idx, 1);
    const { baseOpacity, marcadas } = this.calcularCompletitudTerritorio(territorioNumero, current);
    layer.setStyle({ fillColor: color, fillOpacity: baseOpacity, color, weight: STYLE_DEFAULTS.polygon.weight });

    if (marcadas === 0) {
      this.state.territoriosSeleccionados.update(nums => nums.filter(n => n !== territorioNumero));
      const seleccionados = this.state.territoriosSeleccionados();
      this.state.territorioSeleccionado.set(seleccionados.length === 1 ? seleccionados[0] : null);
      this.rendering.ocultarPoligonosNoSeleccionados(seleccionados);
    }
  }

  private marcarManzana(
    current: { id: string; nombreBloque: string; layer: L.Path; territorioNumero: number }[],
    id: string,
    nombreBloque: string,
    layer: L.Path,
    color: string,
    territorioNumero: number
  ): void {
    current.push({ id, nombreBloque, layer, territorioNumero });
    layer.setStyle({
      fillColor: color,
      fillOpacity: STYLE_DEFAULTS.markedPolygon.fillOpacity,
      color,
      weight: STYLE_DEFAULTS.polygon.weight,
    });

    if (this.state.territoriosSeleccionados().includes(territorioNumero)) return;

    this.state.territoriosSeleccionados.update(nums => [...nums, territorioNumero]);
    const seleccionados = this.state.territoriosSeleccionados();
    this.state.territorioSeleccionado.set(seleccionados.length === 1 ? territorioNumero : null);

    const featureLayer = this.rendering.getAllTerritoriesLayer().find(f => f.territorioPadre === territorioNumero);
    if (featureLayer) {
      const { baseOpacity } = this.calcularCompletitudTerritorio(territorioNumero, current);
      this.rendering.applyStyleToFeatureLayer(featureLayer, { opacity: 1, fillOpacity: baseOpacity, color: featureLayer.color, weight: STYLE_DEFAULTS.polygon.weight, stroke: true });
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
          this.rendering.removeExtraLayer(p.layer);
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
          mc.polygon.setStyle({
            fillColor: color,
            fillOpacity: 0.7,
            color,
            weight: STYLE_DEFAULTS.polygon.weight,
          });
          if (actualizarEstadoMarcado && !existingIds.has(mc.id)) {
            this.state.manzanasMarcadas.update(current => [
              ...current,
              { id: mc.id, nombreBloque: mc.nombreBloque, layer: mc.polygon as unknown as L.Path, territorioNumero },
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

      const parcialId = `parcial-${Date.now()}`;
      const polygon = L.polygon(latlngs, {
        fillColor: color,
        fillOpacity: STYLE_DEFAULTS.partialPolygonComplete.fillOpacity,
        color,
        weight: STYLE_DEFAULTS.partialPolygonComplete.weight,
      }).addTo(map);

      this.rendering.addExtraLayer(polygon);

      if (actualizarEstadoMarcado) {
        this.state.manzanasMarcadas.update(current => [
          ...current,
          { id: parcialId, nombreBloque: 'Zona parcial', layer: polygon as unknown as L.Path, territorioNumero },
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
