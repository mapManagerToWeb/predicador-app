import { Injectable, inject } from '@angular/core';
import { MapStateService } from './map-state.service';
import { MapVectorTileService } from './map-vector-tile.service';
import type { TerritorioService } from '../../../core/services/territorio';
import type { FeatureLayer, TerritorioCacheData } from '../types/map.types';
import type { MapEngine } from './map-engine.interface';

/**
 * Facade that coordinates map sub-services.
 *
 * <p>In MapLibre mode, territory rendering is handled by vector tiles and
 * GPU picking. This facade stores FeatureLayer metadata (territory number,
 * color) populated from the backend colors API — required by selection,
 * marking, restoration, and save flows.</p>
 *
 * <p>The facade is intentionally slim: it holds the active {@link MapEngine}
 * (attached once by {@link attachEngine}) and delegates visibility control
 * to {@link MapVectorTileService} — dimming non-selected territories while a
 * selection is active and restoring full opacity otherwise.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapRenderingFacade {
  private readonly vectorTile = inject(MapVectorTileService);
  private readonly state = inject(MapStateService);

  /** Active map engine, attached once by {@link attachEngine}. */
  private engine: MapEngine | null = null;

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

  /**
   * Attach the active map engine. Called once during map initialization;
   * downstream visibility operations no-op until an engine is attached.
   */
  attachEngine(engine: MapEngine): void {
    this.engine = engine;
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

  // ─── Visibility ──────────────────────────────────────────────────

  /**
   * Dim every territory that is NOT in the selection, keeping the selected
   * ones at full opacity. An empty selection restores full opacity to all.
   */
  ocultarPoligonosNoSeleccionados(seleccionados: number[]): void {
    if (!this.engine) return;
    if (seleccionados.length === 0) {
      this.vectorTile.resetFillOpacity(this.engine);
      return;
    }
    this.vectorTile.setSelectedTerritoriesOpacity(this.engine, seleccionados);
  }

  /** Restore the default fill opacity on all territory layers. */
  restaurarVisibilidadPoligonos(): void {
    if (!this.engine) return;
    this.vectorTile.resetFillOpacity(this.engine);
  }

  // ─── Current territory color (delegated to state) ───────────────

  setCurrentTerritoryColor(color: string): void {
    this.state.currentTerritoryColor.set(color);
  }

  getCurrentTerritoryColor(): string {
    return this.state.currentTerritoryColor();
  }
}