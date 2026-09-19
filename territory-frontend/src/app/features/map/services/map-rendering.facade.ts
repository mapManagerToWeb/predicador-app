import { Injectable, inject } from '@angular/core';
import { MapStateService } from './map-state.service';
import { MapVectorTileService } from './map-vector-tile.service';
import { MapMarkedOverlayService, matchMarkedFeature } from './map-marked-overlay.service';
import type { TerritorioService } from '../../../core/services/territorio';
import type { FeatureLayer, TerritorioCacheData, ManzanaMarcada } from '../types/map.types';
import type { MapEngine } from './map-engine.interface';
import type * as GeoJSON from 'geojson';

/** Bounding box expressed as [west, south, east, north] in lng/lat. */
export type GeojsonBounds = [number, number, number, number];

/**
 * Per-territory metadata derived once from the `/all/geojson` snapshot
 * (the source of truth also used by the deployed Leaflet app):
 * manzana counts, bounds (fitBounds focus), label centroids (bounds
 * center) and the raw features (marked overlay / partial draw).
 */
export interface TerritorioMetadata {
  manzanaCounts: Map<number, number>;
  boundsByTerritorio: Map<number, GeojsonBounds>;
  centroidsByTerritorio: Map<number, [number, number]>;
  featuresByTerritorio: Map<number, GeoJSON.Feature[]>;
}

/** FitBounds padding for territory focus (Leaflet parity: 30px each side). */
const TERRITORY_FOCUS_PADDING = 30;

/**
 * Derives per-territory metadata from the GeoJSON FeatureCollection.
 * Feature properties use the snake_case keys served by the backend
 * (`territorio_padre`, `id`, `nombre_bloque`, `color`).
 */
export function buildTerritorioMetadata(fc: GeoJSON.FeatureCollection): TerritorioMetadata {
  const manzanaCounts = new Map<number, number>();
  const boundsByTerritorio = new Map<number, GeojsonBounds>();
  const centroidsByTerritorio = new Map<number, [number, number]>();
  const featuresByTerritorio = new Map<number, GeoJSON.Feature[]>();

  for (const feature of fc.features) {
    const num = Number(feature.properties?.['territorio_padre']);
    if (!Number.isFinite(num)) continue;

    manzanaCounts.set(num, (manzanaCounts.get(num) ?? 0) + 1);

    const list = featuresByTerritorio.get(num) ?? [];
    list.push(feature);
    featuresByTerritorio.set(num, list);

    const bbox = featureBBox(feature.geometry);
    if (!bbox) continue;
    const current = boundsByTerritorio.get(num);
    boundsByTerritorio.set(
      num,
      current
        ? [
            Math.min(current[0], bbox[0]),
            Math.min(current[1], bbox[1]),
            Math.max(current[2], bbox[2]),
            Math.max(current[3], bbox[3]),
          ]
        : bbox,
    );
  }

  for (const [num, b] of boundsByTerritorio) {
    centroidsByTerritorio.set(num, [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
  }

  return { manzanaCounts, boundsByTerritorio, centroidsByTerritorio, featuresByTerritorio };
}

/** Bounding box of a feature geometry (polygons and points only — the app's data). */
function featureBBox(geometry: GeoJSON.Geometry | null): GeojsonBounds | null {
  if (!geometry) return null;
  switch (geometry.type) {
    case 'Polygon':
      return coordinatesBBox(geometry.coordinates);
    case 'MultiPolygon':
      return coordinatesBBox(geometry.coordinates.flat());
    case 'Point':
      return [
        geometry.coordinates[0],
        geometry.coordinates[1],
        geometry.coordinates[0],
        geometry.coordinates[1],
      ];
    default:
      return null;
  }
}

function coordinatesBBox(rings: GeoJSON.Position[][]): GeojsonBounds | null {
  let bbox: GeojsonBounds | null = null;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (!bbox) {
        bbox = [x, y, x, y];
      } else {
        if (x < bbox[0]) bbox[0] = x;
        if (y < bbox[1]) bbox[1] = y;
        if (x > bbox[2]) bbox[2] = x;
        if (y > bbox[3]) bbox[3] = y;
      }
    }
  }
  return bbox;
}

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
  private readonly markedOverlay = inject(MapMarkedOverlayService);
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
   * Per-territory metadata derived from the `/all/geojson` snapshot.
   * Populated by {@link loadGeoJsonMetadata}; absent (null) when the
   * fetch fails — tiles still render, but counters/labels/overlay are
   * unavailable (same degradation as the colors-only path).
   */
  private metadata: TerritorioMetadata | null = null;

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

  // ─── GeoJSON metadata (counts, bounds, centroids, features) ─────────

  /**
   * Fetches and parses the one-time `/all/geojson` snapshot, deriving
   * per-territory manzana COUNTS, BOUNDS (fitBounds focus), label
   * CENTROIDS and the raw FEATURES (marked overlay / partial draw).
   * Fail-tolerant: on error the metadata stays null and tiles keep
   * rendering normally.
   */
  async loadGeoJsonMetadata(territorioService: TerritorioService): Promise<void> {
    try {
      const raw = await territorioService.getAllGeoJson();
      this.metadata = buildTerritorioMetadata(JSON.parse(raw) as GeoJSON.FeatureCollection);
    } catch {
      this.metadata = null;
    }
  }

  /** Real per-territory manzana count from the GeoJSON snapshot. */
  getManzanaCountByTerritorio(territorioNum: number): number {
    return this.metadata?.manzanaCounts.get(territorioNum) ?? 0;
  }

  /** Territory bounding box from the GeoJSON snapshot, or null if unknown. */
  getBoundsByTerritorio(territorioNum: number): GeojsonBounds | null {
    return this.metadata?.boundsByTerritorio.get(territorioNum) ?? null;
  }

  /** Label centroid (bounds center) for a territory, or null if unknown. */
  getCentroidByTerritorio(territorioNum: number): [number, number] | null {
    return this.metadata?.centroidsByTerritorio.get(territorioNum) ?? null;
  }

  /** Raw GeoJSON features of a territory (marked overlay / partial draw). */
  getGeoJsonFeaturesByTerritorio(territorioNum: number): GeoJSON.Feature[] {
    return this.metadata?.featuresByTerritorio.get(territorioNum) ?? [];
  }

  /** Territory numbers present in the GeoJSON metadata. */
  getTerritoriosConMetadata(): number[] {
    return this.metadata ? Array.from(this.metadata.manzanaCounts.keys()) : [];
  }

  hasGeoJsonMetadata(): boolean {
    return this.metadata !== null;
  }

  /**
   * Focus the map on the union of the given territories (Leaflet parity:
   * fitBounds with [30, 30] padding). No-op when the engine is not
   * attached or the bounds are unknown (metadata not loaded yet).
   */
  fitBoundsToTerritorios(numeros: number[]): void {
    if (!this.engine || numeros.length === 0) return;

    let union: GeojsonBounds | null = null;
    for (const n of numeros) {
      const b = this.getBoundsByTerritorio(n);
      if (!b) continue;
      union = union
        ? [
            Math.min(union[0], b[0]),
            Math.min(union[1], b[1]),
            Math.max(union[2], b[2]),
            Math.max(union[3], b[3]),
          ]
        : b;
    }
    if (!union) return;

    this.engine.fitBounds(
      [
        [union[0], union[1]],
        [union[2], union[3]],
      ],
      { padding: TERRITORY_FOCUS_PADDING },
    );
  }

  // ─── Visibility ──────────────────────────────────────────────────

  /**
   * Territory numbers whose manzanas are ALL marked (partial marks
   * excluded). Completion drives the base opacity (0.6 complete vs
   * 0.05 incomplete) — the Leaflet parity rule.
   */
  getCompletedTerritorios(): number[] {
    if (!this.metadata) return [];
    const completed: number[] = [];
    for (const [num, total] of this.metadata.manzanaCounts) {
      const marks = this.state.manzanasByTerritorio().get(num) ?? [];
      const real = marks.filter((m: ManzanaMarcada) => !m.id.startsWith('parcial-')).length;
      if (total > 0 && real >= total) completed.push(num);
    }
    return completed;
  }

  /**
   * Hide every territory that is NOT in the selection (opacity 0 + line 0)
   * and render selected ones by completeness (0.6 complete / 0.05
   * incomplete). An empty selection restores the base completion opacity.
   */
  ocultarPoligonosNoSeleccionados(seleccionados: number[]): void {
    if (!this.engine) return;
    const completed = this.getCompletedTerritorios();
    if (seleccionados.length === 0) {
      this.vectorTile.resetFillOpacity(this.engine, completed);
      return;
    }
    this.vectorTile.setSelectedTerritoriesOpacity(this.engine, seleccionados, completed);
  }

  /** Restore the base completion-driven fill opacity on all territory layers. */
  restaurarVisibilidadPoligonos(): void {
    if (!this.engine) return;
    this.vectorTile.resetFillOpacity(this.engine, this.getCompletedTerritorios());
  }

  // ─── Marked overlay & visual refresh ─────────────────────────────

  /**
   * Initialize the marked-manzana GeoJSON overlay and populate it with the
   * current marks. Must be called once after the engine is attached and
   * the GeoJSON metadata is loaded (and BEFORE the label layer, so marks
   * render below the territory-number labels).
   */
  initMarkedOverlay(engine: MapEngine): void {
    this.markedOverlay.initOverlay(engine);
    this.refreshOverlayMarks();
  }

  /**
   * Rebuild the marked overlay from the current marks. Marks are matched
   * against the `/all/geojson` snapshot by fid / "{t}-{b}" id / bloque;
   * matched features carry the mark color and a `completo` flag.
   */
  refreshOverlayMarks(): void {
    if (!this.engine || !this.markedOverlay.isInitialized()) return;

    const marks = Array.from(this.state.manzanasById().values());
    const completed = new Set(this.getCompletedTerritorios());
    const features: GeoJSON.Feature[] = [];

    for (const mark of marks) {
      const matched = matchMarkedFeature(mark, this.getGeoJsonFeaturesByTerritorio(mark.territorioNumero));
      if (!matched) continue;
      features.push({
        ...matched,
        properties: {
          ...(matched.properties ?? {}),
          color: mark.color,
          completo: completed.has(mark.territorioNumero),
        },
      });
    }

    this.markedOverlay.updateOverlay(this.engine, features);
  }

  /**
   * Re-apply the full visual state after marks change: the base
   * completion opacity (or the selection-aware opacity when a selection is
   * active) AND the marked overlay. Call this after every mark/unmark/
   * restore mutation.
   */
  refreshMarksVisual(): void {
    if (!this.engine) return;
    const seleccionados = this.state.territoriosSeleccionados();
    if (seleccionados.length > 0) {
      this.ocultarPoligonosNoSeleccionados(seleccionados);
    } else {
      this.restaurarVisibilidadPoligonos();
    }
    this.refreshOverlayMarks();
  }

  // ─── Current territory color (delegated to state) ───────────────

  setCurrentTerritoryColor(color: string): void {
    this.state.currentTerritoryColor.set(color);
  }

  getCurrentTerritoryColor(): string {
    return this.state.currentTerritoryColor();
  }
}