import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import { MapEngineService } from './map-engine.service';
import {
  getBaseTerritoryStyle,
  getHiddenStyle,
  getMarkedManzanaStyle,
} from './map-style.service';
import { MapLayerRegistry } from './map-layer-registry.service';
import { MapTileLayerService } from './map-tile-layer.service';
import { MapTerritoryLayerService, type ManzanaClickHandler } from './map-territory-layer.service';
import { MapStyleService } from './map-style.service';
import { MapCaptureService } from './map-capture.service';
import { MapPartialDrawService } from './map-partial-draw.service';
import { MapStateService } from './map-state.service';
import type {
  ManzanaIndex,
  FeatureLayer,
  TerritorioCacheData,
  ManzanaMarcada,
  SnappedPoint,
  Edge,
} from '../types/map.types';

/**
 * Facade that coordinates all map sub-services.
 *
 * <p>Hot-path methods (applyBaseTerritoryStyle, reaplicarMarcasTerritorio,
 * computeBaseStyle, restaurarVisibilidadPoligonos) use O(1) Map lookups via
 * getFeatureLayerByTerritorio / getManzanaCountByTerritorio instead of
 * iterating the full territory array.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapRenderingFacade {
  private readonly engine = inject(MapEngineService);
  private readonly tiles = inject(MapTileLayerService);
  private readonly territories = inject(MapTerritoryLayerService);
  private readonly styles = inject(MapStyleService);
  private readonly capture = inject(MapCaptureService);
  private readonly partialDraw = inject(MapPartialDrawService);
  private readonly state = inject(MapStateService);
  private readonly registry = inject(MapLayerRegistry);

  // ─── Engine delegation ───────────────────────────────────────────

  getMap(): L.Map | null {
    return this.engine.getMap();
  }

  initializeMap(mapElement: HTMLElement): void {
    this.engine.initializeMap(mapElement);
    this.tiles.initLayers();
    this.tiles.observeThemeChanges();
  }

  // ─── Tile / satellite ────────────────────────────────────────────

  isSatellite(): boolean {
    return this.tiles.isSatellite();
  }

  toggleSatellite(): void {
    this.tiles.toggleSatellite();
  }

  // ─── Click handler ───────────────────────────────────────────────

  setManzanaClickHandler(handler: ManzanaClickHandler | null): void {
    this.territories.setManzanaClickHandler(handler);
  }

  // ─── Territory data ──────────────────────────────────────────────

  async loadAllTerritories(territorioService: { getAllGeoJson(): Promise<string> }): Promise<void> {
    await this.territories.loadAllTerritories(territorioService);
  }

  updateVisibleTerritories(): number[] {
    return this.territories.updateVisibleTerritories();
  }

  ensureTerritoryLoaded(territorioNum: number): void {
    this.territories.ensureTerritoryLoaded(territorioNum);
  }

  clearAllLayers(): void {
    this.territories.clearAllLayers();
  }

  // ─── Index / data access ─────────────────────────────────────────

  getManzanaIndex(): ManzanaIndex[] {
    return this.territories.getManzanaIndex();
  }

  getAllTerritoriesLayer(): FeatureLayer[] {
    return this.territories.getAllTerritoriesLayer();
  }

  getTerritoryDataCache(): Map<number, TerritorioCacheData> {
    return this.territories.getTerritoryDataCache();
  }

  /** O(1) — replaces getAllTerritoriesLayer().find() in hot paths. */
  getFeatureLayerByTerritorio(territorioNum: number): FeatureLayer | undefined {
    return this.territories.getFeatureLayerByTerritorio(territorioNum);
  }

  /** O(1) — replaces getManzanaIndex().filter().length in hot paths. */
  getManzanaCountByTerritorio(territorioNum: number): number {
    return this.territories.getManzanaCountByTerritorio(territorioNum);
  }

  // ─── Style delegation ────────────────────────────────────────────

  /**
   * Applies the base territory style using O(1) lookups.
   * Bypasses the MapStyleService array-scan version.
   */
  applyBaseTerritoryStyle(
    territorioNumero: number,
    color: string,
    marcadasCount: number,
    options: { total?: number; isComplete?: boolean } = {}
  ): void {
    const fl = this.territories.getFeatureLayerByTerritorio(territorioNumero);
    if (!fl) return;
    const total = options.total ?? this.territories.getManzanaCountByTerritorio(territorioNumero);
    const isComplete = options.isComplete ?? (total > 0 && marcadasCount >= total);
    this.styles.applyStyleToFeatureLayer(fl, getBaseTerritoryStyle(color, isComplete));
  }

  applyStyleToFeatureLayer(fl: FeatureLayer, style: L.PathOptions | ((fl: FeatureLayer) => L.PathOptions)): void {
    this.styles.applyStyleToFeatureLayer(fl, style);
  }

  /**
   * Re-applies base + marked styles for the given territory numbers using O(1) lookups.
   * Bypasses the MapStyleService array-scan version.
   */
  reaplicarMarcasTerritorio(manzanasMarcadas: ManzanaMarcada[], territorioNumeros: number[]): void {
    for (const num of territorioNumeros) {
      const fl = this.territories.getFeatureLayerByTerritorio(num); // O(1)
      if (!fl) continue;

      const total = this.territories.getManzanaCountByTerritorio(num); // O(1)
      const marcadas = manzanasMarcadas.filter(m => m.territorioNumero === num).length;
      const isComplete = total > 0 && marcadas >= total;

      this.styles.applyStyleToFeatureLayer(fl, getBaseTerritoryStyle(fl.color, isComplete));

      for (const m of manzanasMarcadas.filter(m => m.territorioNumero === num)) {
        const layer = this.registry.get(m.id);
        if (layer) layer.setStyle(getMarkedManzanaStyle(fl.color));
      }
    }
  }

  limpiarMarcasVisuales(): void {
    this.styles.limpiarMarcasVisuales(this.territories.getAllTerritoriesLayer());
  }

  queueStyleUpdate(fn: () => void): void {
    this.styles.queueStyleUpdate(fn);
  }

  cancelPendingStyleUpdates(): void {
    this.styles.cancelPendingStyleUpdates();
  }

  // ─── Labels ──────────────────────────────────────────────────────

  updateLabelsVisibility(): void {
    this.territories.updateLabelsVisibility();
  }

  updateLabelsForSelection(seleccionados: Set<number>): void {
    this.territories.updateLabelsForSelection(seleccionados);
  }

  getTerritoryLabels(): L.Marker[] {
    return this.territories.getTerritoryLabels();
  }

  // ─── Visibility ──────────────────────────────────────────────────

  ocultarPoligonosNoSeleccionados(seleccionados: number[]): void {
    const seleccionadosSet = new Set(seleccionados);

    for (const fl of this.territories.getAllTerritoriesLayer()) {
      if (seleccionadosSet.has(fl.territorioPadre)) continue;
      this.styles.applyStyleToFeatureLayer(fl, getHiddenStyle());
    }

    this.territories.updateLabelsForSelection(seleccionadosSet);
  }

  restaurarVisibilidadPoligonos(manzanasMarcadas: ManzanaMarcada[], territoriosSeleccionados: number[]): void {
    this.styles.cancelPendingStyleUpdates();

    const seleccionadosSet = new Set(territoriosSeleccionados);
    const hayFiltroActivo = seleccionadosSet.size > 0;

    this.styles.queueStyleUpdate(() => {
      for (const fl of this.territories.getAllTerritoriesLayer()) {
        if (hayFiltroActivo && !seleccionadosSet.has(fl.territorioPadre)) {
          this.styles.applyStyleToFeatureLayer(fl, getHiddenStyle());
          continue;
        }

        this.styles.applyStyleToFeatureLayer(fl, this.computeBaseStyle(fl.territorioPadre, manzanasMarcadas));
      }

      for (const num of territoriosSeleccionados) {
        const featureLayer = this.territories.getFeatureLayerByTerritorio(num); // O(1)
        if (!featureLayer) continue;

        const marcadas = manzanasMarcadas.filter(m => m.territorioNumero === num);
        for (const m of marcadas) {
          const layer = this.registry.get(m.id);
          if (layer) layer.setStyle(getMarkedManzanaStyle(featureLayer.color));
        }
      }

      if (hayFiltroActivo) {
        this.territories.updateLabelsForSelection(seleccionadosSet);
      } else {
        this.territories.mostrarTodosLosLabels();
      }
    });
  }

  // ─── Capture ─────────────────────────────────────────────────────

  prepararCaptura(manzanasMarcadas: ManzanaMarcada[], territoriosSeleccionados: number[]): Promise<void> {
    return this.capture.prepararCaptura(manzanasMarcadas, territoriosSeleccionados);
  }

  restaurarMapaPostCaptura(
    manzanasMarcadas: ManzanaMarcada[],
    territoriosSeleccionados: number[],
    modoMarcado: string
  ): void {
    this.capture.restaurarMapaPostCaptura(
      manzanasMarcadas,
      territoriosSeleccionados,
      modoMarcado
    );
  }

  // ─── Partial draw ────────────────────────────────────────────────

  redibujarParcial(
    puntos: SnappedPoint[],
    currentTerritoryColor: string,
    manzanaEdges: Edge[],
    onMarkerDrag: (index: number, marker: L.Marker) => void
  ): void {
    this.partialDraw.redibujarParcial(puntos, currentTerritoryColor, manzanaEdges, onMarkerDrag);
  }

  updatePartialPolygonLatLngs(latlngs: L.LatLngExpression[], currentTerritoryColor: string): void {
    this.partialDraw.updatePartialPolygonLatLngs(latlngs, currentTerritoryColor);
  }

  limpiarCapasParciales(): void {
    this.partialDraw.limpiarCapasParciales();
  }

  getPoligonoParcial(): L.Polygon | null {
    return this.partialDraw.getPoligonoParcial();
  }

  clearPoligonoParcialRef(): void {
    this.partialDraw.clearPoligonoParcialRef();
  }

  // ─── Extra layers (delegated to territory-layer) ─────────────────

  addExtraLayer(layer: L.Layer): void {
    this.territories.addExtraLayer(layer);
  }

  removeExtraLayer(layer: L.Layer): void {
    this.territories.removeExtraLayer(layer);
  }

  clearExtraLayers(): void {
    this.territories.clearExtraLayers();
  }

  // ─── Current territory color (delegated to state) ───────────────

  setCurrentTerritoryColor(color: string): void {
    this.state.currentTerritoryColor.set(color);
  }

  getCurrentTerritoryColor(): string {
    return this.state.currentTerritoryColor();
  }

  private computeBaseStyle(territorioNumero: number, manzanasMarcadas: ManzanaMarcada[]): L.PathOptions {
    const total = this.territories.getManzanaCountByTerritorio(territorioNumero); // O(1)
    const marcadas = manzanasMarcadas.filter(m => m.territorioNumero === territorioNumero).length;
    const isComplete = total > 0 && marcadas >= total;
    const color = this.territories.getFeatureLayerByTerritorio(territorioNumero)?.color ?? ''; // O(1)
    return getBaseTerritoryStyle(color, isComplete);
  }

  // ─── Destroy ─────────────────────────────────────────────────────

  destroy(): void {
    this.styles.cancelPendingStyleUpdates();
    this.clearExtraLayers();
    this.partialDraw.destroy();
    this.tiles.destroy();
    this.engine.destroy();
  }
}
