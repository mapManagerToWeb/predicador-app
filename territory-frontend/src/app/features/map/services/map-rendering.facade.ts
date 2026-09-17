import { Injectable, inject } from '@angular/core';
import { MapStyleService } from './map-style.service';
import { MapStateService } from './map-state.service';
import type { TerritorioService } from '../../../core/services/territorio';
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
 * <p>In MapLibre mode, territory rendering is handled by vector tiles and
 * GPU picking. This facade stores FeatureLayer metadata (territory number,
 * color) populated from the backend colors API — required by selection,
 * marking, restoration, and save flows.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapRenderingFacade {
  private readonly styles = inject(MapStyleService);
  private readonly state = inject(MapStateService);

  /**
   * FeatureLayer metadata indexed by territory number.
   * Populated by {@link fetchAndBuildFeatureLayers} during map initialization.
   * Each entry carries the territory number and its assigned color — the
   * `layer` property is a null placeholder (MapLibre uses tiles, not layers).
   */
  private readonly featureLayers = new Map<number, FeatureLayer>();

  /**
   * Manzana count per territory, populated alongside featureLayers.
   * In MapLibre mode this is 0 until we query tile data — used as a
   * fallback for the progress display.
   */
  private readonly manzanaCounts = new Map<number, number>();

  // ─── Tile / satellite ────────────────────────────────────────────

  isSatellite(): boolean {
    return this.state.isSatellite();
  }

  toggleSatellite(): void {
    this.state.isSatellite.update(v => !v);
  }

  // ─── Click handler ───────────────────────────────────────────────

  setManzanaClickHandler(_handler: unknown): void {
    // No-op: MapLibre uses GPU picking via MapPickingService
  }

  // ─── Territory data ──────────────────────────────────────────────

  /**
   * Fetch territory colors from the backend and build FeatureLayer entries.
   *
   * <p>In MapLibre mode, polygon rendering is handled by vector tiles —
   * this method only populates the metadata (territory number + color)
   * needed by selection, marking, restoration, and save flows.</p>
   */
  async fetchAndBuildFeatureLayers(territorioService: TerritorioService): Promise<void> {
    try {
      const colors = await territorioService.getColores();
      this.featureLayers.clear();
      for (const [num, color] of Object.entries(colors)) {
        const territorioNumero = Number(num);
        this.featureLayers.set(territorioNumero, {
          territorioPadre: territorioNumero,
          color,
          layer: null as unknown as FeatureLayer['layer'],
        });
      }
    } catch {
      // Backend unavailable: feature layers remain empty — tiles still
      // render with fallback colors, but selection/marking won't work.
    }
  }

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
    return Array.from(this.featureLayers.values());
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

  getFeatureLayerByTerritorio(territorioNum: number): FeatureLayer | undefined {
    return this.featureLayers.get(territorioNum);
  }

  getManzanaCountByTerritorio(territorioNum: number): number {
    return this.manzanaCounts.get(territorioNum) ?? 0;
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
