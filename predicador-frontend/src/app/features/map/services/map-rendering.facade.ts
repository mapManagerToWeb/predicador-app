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

  getFeatureLayerByTerritorio(territorioNum: number): FeatureLayer | undefined {
    return this.territories.getFeatureLayerByTerritorio(territorioNum);
  }

  getManzanaCountByTerritorio(territorioNum: number): number {
    return this.territories.getManzanaCountByTerritorio(territorioNum);
  }

  // ─── Style delegation ────────────────────────────────────────────

  applyBaseTerritoryStyle(
    territorioNumero: number,
    color: string,
    marcadasCount: number,
    options: { total?: number; isComplete?: boolean } = {}
  ): void {
    this.styles.applyBaseTerritoryStyle(
      this.territories.getAllTerritoriesLayer(),
      this.territories.getManzanaIndex(),
      territorioNumero,
      color,
      marcadasCount,
      options
    );
  }

  applyStyleToFeatureLayer(fl: FeatureLayer, style: L.PathOptions | ((fl: FeatureLayer) => L.PathOptions)): void {
    this.styles.applyStyleToFeatureLayer(fl, style);
  }

  /**
   * Re-applies base + marked styles for the given territory numbers using O(1) lookups.
   * Bypasses the MapStyleService array-scan version.
   */
  reaplicarMarcasTerritorio(manzanasMarcadaList: ManzanaMarcada[], territorioNumeros: number[]): void {
    this.styles.reaplicarMarcasTerritorio(
      this.territories.getAllTerritoriesLayer(),
      this.territories.getManzanaIndex(),
      manzanasMarcadaList,
      territorioNumeros
    );
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

    this.styles.cancelPendingStyleUpdates();
    this.styles.queueStyleUpdate(() => {
      for (const fl of this.territories.getAllTerritoriesLayer()) {
        if (seleccionadosSet.has(fl.territorioPadre)) continue;
        this.styles.applyStyleToFeatureLayer(fl, getHiddenStyle());
      }
    });

    this.territories.updateLabelsForSelection(seleccionadosSet);
  }

  restaurarVisibilidadPoligonos(manzanasMarcadaList: ManzanaMarcada[], territoriosSeleccionados: number[]): void {
    this.styles.cancelPendingStyleUpdates();

    const seleccionadosSet = new Set(territoriosSeleccionados);
    const hayFiltroActivo = seleccionadosSet.size > 0;

    this.styles.queueStyleUpdate(() => {
      for (const fl of this.territories.getAllTerritoriesLayer()) {
        if (hayFiltroActivo && !seleccionadosSet.has(fl.territorioPadre)) {
          this.styles.applyStyleToFeatureLayer(fl, getHiddenStyle());
          continue;
        }

        this.styles.applyStyleToFeatureLayer(fl, this.computeBaseStyle(fl.territorioPadre, manzanasMarcadaList));
      }

      for (const num of territoriosSeleccionados) {
        const featureLayer = this.territories.getFeatureLayerByTerritorio(num);
        if (!featureLayer) continue;

        const marcadas = manzanasMarcadaList.filter(m => m.territorioNumero === num);
        for (const m of marcadas) {
          const layer = this.registry.get(m.id);
          if (layer) layer.setStyle(getMarkedManzanaStyle(featureLayer.color));
        }
      }

      if (hayFiltroActivo) {
        this.territories.updateLabelsForSelection(seleccionadosSet);
      } else {
        this.territories.updateLabelsVisibility();
      }
    });
  }

  /**
   * Restores the full map view (every territory visible) while re-applying the
   * marked-manzana styles. Used after a save/send so the user keeps seeing their
   * marks without an active territory selection.
   */
  restaurarVistaConMarcas(manzanasMarcadaList: ManzanaMarcada[]): void {
    this.styles.cancelPendingStyleUpdates();

    this.styles.queueStyleUpdate(() => {
      for (const fl of this.territories.getAllTerritoriesLayer()) {
        this.styles.applyStyleToFeatureLayer(fl, this.computeBaseStyle(fl.territorioPadre, manzanasMarcadaList));
      }

      for (const m of manzanasMarcadaList) {
        const layer = this.registry.get(m.id);
        if (!layer) continue;
        const featureLayer = this.territories.getFeatureLayerByTerritorio(m.territorioNumero);
        if (!featureLayer) continue;
        layer.setStyle(getMarkedManzanaStyle(featureLayer.color));
      }

      this.territories.updateLabelsVisibility();
    });
  }

  // ─── Capture ─────────────────────────────────────────────────────

  prepararCaptura(manzanasMarcadaList: ManzanaMarcada[], territoriosSeleccionados: number[]): Promise<void> {
    return this.capture.prepararCaptura(manzanasMarcadaList, territoriosSeleccionados);
  }

  restaurarMapaPostCaptura(
    manzanasMarcadaList: ManzanaMarcada[],
    territoriosSeleccionados: number[],
    modoMarcado: string
  ): void {
    this.capture.restaurarMapaPostCaptura(
      manzanasMarcadaList,
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

  actualizarParcialEnDrag(
    puntos: SnappedPoint[],
    currentTerritoryColor: string,
    manzanaEdges: Edge[],
    index: number,
    marker: L.Marker
  ): void {
    this.partialDraw.actualizarParcialEnDrag(puntos, currentTerritoryColor, manzanaEdges, index, marker);
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

  private computeBaseStyle(territorioNumero: number, manzanasMarcadaList: ManzanaMarcada[]): L.PathOptions {
    const total = this.territories.getManzanaCountByTerritorio(territorioNumero);
    const marcadas = manzanasMarcadaList.filter(m => m.territorioNumero === territorioNumero).length;
    const isComplete = total > 0 && marcadas >= total;
    const color = this.territories.getFeatureLayerByTerritorio(territorioNumero)?.color ?? '';
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
