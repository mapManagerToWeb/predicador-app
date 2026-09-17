import { Injectable, inject } from '@angular/core';
import { MapStyleService } from './map-style.service';
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
 * Facade that coordinates map sub-services.
 *
 * <p>In the MapLibre-only mode, most territory-layer and style methods are
 * no-ops — territory rendering is handled by vector tiles and GPU picking.
 * State-only methods (color, cancellation) remain functional.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapRenderingFacade {
  private readonly styles = inject(MapStyleService);
  private readonly state = inject(MapStateService);

  // ─── Tile / satellite ────────────────────────────────────────────

  isSatellite(): boolean {
    return false;
  }

  toggleSatellite(): void {
    // MapLibre satellite toggle is handled via vector tile styling
  }

  // ─── Click handler ───────────────────────────────────────────────

  setManzanaClickHandler(_handler: unknown): void {
    // No-op: MapLibre uses GPU picking via MapPickingService
  }

  // ─── Territory data ──────────────────────────────────────────────

  async loadAllTerritories(_territorioService: { getAllGeoJson(): Promise<string> }): Promise<void> {
    // No-op: MapLibre loads territories via vector tiles
  }

  updateVisibleTerritories(_onBatchLoaded?: (newlyLoaded: number[]) => void): void {
    // No-op: MapLibre manages viewport-based tile loading
  }

  whenTerritoryLoadsIdle(): Promise<void> {
    return Promise.resolve();
  }

  cancelPendingLoads(): void {
    // No-op: no pending Leaflet loads
  }

  ensureTerritoryLoaded(_territorioNum: number): void {
    // No-op: MapLibre loads tiles on demand
  }

  clearAllLayers(): void {
    // No-op: MapLibre manages layers via vector tiles
  }

  // ─── Index / data access ─────────────────────────────────────────

  getManzanaIndex(): ManzanaIndex[] {
    return [];
  }

  queryManzanasAt(_latlng: { lat: number; lng: number }): ManzanaIndex[] {
    return [];
  }

  queryManzanasNear(_latlng: { lat: number; lng: number }, _radiusCells = 1): ManzanaIndex[] {
    return [];
  }

  getAllTerritoriesLayer(): FeatureLayer[] {
    return [];
  }

  getTerritoryDataCache(): Map<number, TerritorioCacheData> {
    return new Map();
  }

  hasCachedGeojson(): boolean {
    return false;
  }

  podarGeojsonCache(_vigentes: Set<number>): void {
    // No-op
  }

  getFeatureLayerByTerritorio(_territorioNum: number): FeatureLayer | undefined {
    return undefined;
  }

  getManzanaCountByTerritorio(_territorioNum: number): number {
    return 0;
  }

  // ─── Style delegation ────────────────────────────────────────────

  applyBaseTerritoryStyle(
    _territorioNumero: number,
    _color: string,
    _marcadasCount: number,
    _options: { total?: number; isComplete?: boolean } = {}
  ): void {
    // No-op: MapLibre uses data-driven tile styling
  }

  applyStyleToFeatureLayer(_fl: FeatureLayer, _style: unknown): void {
    // No-op: MapLibre uses GPU feature-state for styling
  }

  reaplicarMarcasTerritorio(_manzanasMarcadaList: ManzanaMarcada[], _territorioNumeros: number[]): void {
    // No-op: MapLibre handles marks via GPU picking
  }

  limpiarMarcasVisuales(): void {
    // No-op: MapLibre handles marks via GPU picking
  }

  queueStyleUpdate(fn: () => void): void {
    this.styles.queueStyleUpdate(fn);
  }

  cancelPendingStyleUpdates(): void {
    this.styles.cancelPendingStyleUpdates();
  }

  // ─── Labels ──────────────────────────────────────────────────────

  updateLabelsVisibility(): void {
    // No-op: MapLibre uses symbol layers for labels
  }

  updateLabelsForSelection(_seleccionados: Set<number>): void {
    // No-op: MapLibre uses symbol layers for labels
  }

  getTerritoryLabels(): unknown[] {
    return [];
  }

  // ─── Visibility ──────────────────────────────────────────────────

  ocultarPoligonosNoSeleccionados(_seleccionados: number[]): void {
    // No-op: MapLibre uses tile-based rendering
  }

  restaurarVisibilidadPoligonos(_manzanasMarcadaList: ManzanaMarcada[], _territoriosSeleccionados: number[]): void {
    // No-op: MapLibre uses tile-based rendering
  }

  restaurarVistaConMarcas(_manzanasMarcadaList: ManzanaMarcada[]): void {
    // No-op: MapLibre uses tile-based rendering
  }

  // ─── Capture ─────────────────────────────────────────────────────

  prepararCaptura(_manzanasMarcadaList: ManzanaMarcada[], _territoriosSeleccionados: number[]): Promise<void> {
    return Promise.resolve();
  }

  restaurarMapaPostCaptura(
    _manzanasMarcadaList: ManzanaMarcada[],
    _territoriosSeleccionados: number[],
    _modoMarcado: string
  ): void {
    // No-op
  }

  // ─── Partial draw ────────────────────────────────────────────────

  redibujarParcial(
    _puntos: SnappedPoint[],
    _currentTerritoryColor: string,
    _manzanaEdges: Edge[],
    _onMarkerDrag: (index: number, marker: unknown) => void
  ): void {
    // No-op: MapLibre partial draw uses edit overlay
  }

  updatePartialPolygonLatLngs(_latlngs: unknown[], _currentTerritoryColor: string): void {
    // No-op
  }

  actualizarParcialEnDrag(
    _puntos: SnappedPoint[],
    _currentTerritoryColor: string,
    _manzanaEdges: Edge[],
    _index: number,
    _marker: unknown
  ): void {
    // No-op
  }

  limpiarCapasParciales(): void {
    // No-op
  }

  getPoligonoParcial(): unknown | null {
    return null;
  }

  clearPoligonoParcialRef(): void {
    // No-op
  }

  // ─── Extra layers ───────────────────────────────────────────────

  addExtraLayer(_layer: unknown): void {
    // No-op
  }

  removeExtraLayer(_layer: unknown): void {
    // No-op
  }

  clearExtraLayers(): void {
    // No-op
  }

  // ─── Current territory color (delegated to state) ───────────────

  setCurrentTerritoryColor(color: string): void {
    this.state.currentTerritoryColor.set(color);
  }

  getCurrentTerritoryColor(): string {
    return this.state.currentTerritoryColor();
  }

  // ─── Destroy ─────────────────────────────────────────────────────

  destroy(): void {
    this.styles.cancelPendingStyleUpdates();
  }
}
