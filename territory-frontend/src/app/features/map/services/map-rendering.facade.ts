import { Injectable, inject } from '@angular/core';
import { MapStateService } from './map-state.service';
import { MapVectorTileService } from './map-vector-tile.service';
import { MapMarkedOverlayService, matchMarkedFeature } from './map-marked-overlay.service';
import { MapSelectedManzanaOverlayService } from './map-selected-manzana-overlay.service';
import { TerritorioService, type TerritoryMetadataDto } from '../../../core/services/territorio';
import type { FeatureLayer, TerritorioCacheData, ManzanaMarcada } from '../types/map.types';
import type { MapEngine } from './map-engine.interface';
import type * as GeoJSON from 'geojson';

/** Bounding box expressed as [west, south, east, north] in lng/lat. */
export type GeojsonBounds = [number, number, number, number];

/** Fallback color for a partial-zone feature with no resolvable color. */
const PARTIAL_FALLBACK_COLOR = '#22c55e';

/**
 * Parses a saved partial-zone geometry (JSON string) into a GeoJSON
 * geometry. Only Polygon and LineString shapes are meaningful for the
 * marked overlay — anything else (or malformed JSON) yields null.
 */
function parseSavedGeometry(raw: string): GeoJSON.Geometry | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const geometry = parsed as Record<string, unknown>;
  const type = geometry['type'];
  const coords = geometry['coordinates'];
  if (type === 'Polygon') {
    if (!Array.isArray(coords) || coords.length === 0) return null;
    return { type: 'Polygon', coordinates: coords as GeoJSON.Position[][] };
  }
  if (type === 'LineString') {
    if (!Array.isArray(coords) || coords.length === 0) return null;
    return { type: 'LineString', coordinates: coords as GeoJSON.Position[] };
  }
  return null;
}

/**
 * Per-territory metadata derived from the validated
 * `GET /api/v1/territories/metadata` DTO list: manzana counts, bounds
 * (fitBounds focus) and label centroids (ST_PointOnSurface). Feature
 * geometry is NOT part of this payload — it is fetched on demand per
 * territory (see {@link MapRenderingFacade.getGeoJsonFeaturesByTerritorio}).
 */
export interface TerritorioMetadata {
  manzanaCounts: Map<number, number>;
  boundsByTerritorio: Map<number, GeojsonBounds>;
  centroidsByTerritorio: Map<number, [number, number]>;
}

/** FitBounds padding for territory focus (Leaflet parity: 30px each side). */
const TERRITORY_FOCUS_PADDING = 30;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Parses an exact-length finite-number tuple, or null when malformed. */
function parseNumberTuple(value: unknown, length: number): number[] | null {
  if (!Array.isArray(value)) return null;
  const entries: unknown[] = value;
  if (entries.length !== length) return null;
  const tuple: number[] = [];
  for (const entry of entries) {
    if (!isFiniteNumber(entry)) return null;
    tuple.push(entry);
  }
  return tuple;
}

/**
 * Validates one raw `/territories/metadata` item against the
 * {@link TerritoryMetadataDto} contract (trust boundary). Malformed items
 * yield null and are skipped by the caller; `bounds`/`center` may be
 * explicitly null (territory without geometry) but must be well-formed
 * tuples otherwise.
 */
function parseMetadataDto(value: unknown): TerritoryMetadataDto | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;

  const numero = item['numero'];
  const nombre = item['nombre'];
  const color = item['color'];
  const manzanaCount = item['manzanaCount'];
  const fidsRaw = item['fids'];
  const boundsRaw = item['bounds'];
  const centerRaw = item['center'];

  if (!isFiniteNumber(numero)) return null;
  if (typeof nombre !== 'string') return null;
  if (typeof color !== 'string') return null;
  if (!isFiniteNumber(manzanaCount) || manzanaCount < 0) return null;
  if (!Array.isArray(fidsRaw)) return null;
  const fidEntries: unknown[] = fidsRaw;
  const fids: number[] = [];
  for (const fid of fidEntries) {
    if (!isFiniteNumber(fid)) return null;
    fids.push(fid);
  }

  let bounds: GeojsonBounds | null = null;
  if (boundsRaw !== null) {
    const parsed = parseNumberTuple(boundsRaw, 4);
    if (parsed === null) return null;
    bounds = [parsed[0], parsed[1], parsed[2], parsed[3]];
  }

  let center: [number, number] | null = null;
  if (centerRaw !== null) {
    const parsed = parseNumberTuple(centerRaw, 2);
    if (parsed === null) return null;
    center = [parsed[0], parsed[1]];
  }

  return { numero, nombre, color, bounds, center, manzanaCount, fids };
}

/**
 * Derives per-territory metadata from validated
 * `GET /territories/metadata` DTOs: manzana counts, bounds (fitBounds
 * focus) and label centroids (`center`, ST_PointOnSurface).
 */
export function buildTerritorioMetadata(dtos: TerritoryMetadataDto[]): TerritorioMetadata {
  const manzanaCounts = new Map<number, number>();
  const boundsByTerritorio = new Map<number, GeojsonBounds>();
  const centroidsByTerritorio = new Map<number, [number, number]>();

  for (const dto of dtos) {
    manzanaCounts.set(dto.numero, dto.manzanaCount);
    if (dto.bounds !== null) boundsByTerritorio.set(dto.numero, dto.bounds);
    if (dto.center !== null) centroidsByTerritorio.set(dto.numero, dto.center);
  }

  return { manzanaCounts, boundsByTerritorio, centroidsByTerritorio };
}

/**
 * Validates a raw `/territories/metadata` payload at the trust boundary:
 * anything that is not an array yields null; malformed items are skipped
 * and the well-formed remainder is kept.
 */
export function parseTerritoryMetadata(raw: unknown): TerritorioMetadata | null {
  if (!Array.isArray(raw)) return null;
  const entries: unknown[] = raw;
  const dtos: TerritoryMetadataDto[] = [];
  for (const entry of entries) {
    const dto = parseMetadataDto(entry);
    if (dto !== null) dtos.push(dto);
  }
  return buildTerritorioMetadata(dtos);
}

/**
 * Parses a per-territory `/geojson` payload into its feature list.
 * Anything that is not a FeatureCollection with a features array yields
 * null (the caller then marks the territory as failed for this session).
 */
function parseTerritoryFeatures(raw: string): GeoJSON.Feature[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const collection = parsed as Record<string, unknown>;
  const list = collection['features'];
  if (!Array.isArray(list)) return null;
  const entries: unknown[] = list;
  const features: GeoJSON.Feature[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as Record<string, unknown>;
    if (candidate['type'] !== 'Feature') continue;
    if (candidate['geometry'] === undefined || candidate['geometry'] === null) continue;
    features.push(candidate as unknown as GeoJSON.Feature);
  }
  return features;
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
  private readonly selectedOverlay = inject(MapSelectedManzanaOverlayService);
  private readonly state = inject(MapStateService);
  private readonly territorioService = inject(TerritorioService);

  /** Active map engine, attached once by {@link attachEngine}. */
  private engine: MapEngine | null = null;

  /**
   * Currently highlighted manzana (Leaflet's `selectedManzana`). Kept on the
   * facade so the highlight survives metadata (re)loads and engine changes.
   */
  private selectedManzanaId: string | null = null;
  private selectedManzanaNombre = '';
  private selectedManzanaTerritorio: number | null = null;

  /**
   * FeatureLayer metadata indexed by territory number.
   * Populated by {@link fetchAndBuildFeatureLayers} during map initialization.
   * Each entry carries the territory number and its assigned color — the
   * `layer` property is a null placeholder (MapLibre uses tiles, not layers).
   */
  private readonly featureLayers = new Map<number, FeatureLayer>();

  /**
   * Per-territory metadata derived from the `GET /territories/metadata`
   * DTOs. Populated by {@link loadTerritoryMetadata}; absent (null) when the
   * fetch fails — tiles still render, but counters/labels are unavailable
   * (same degradation as the colors-only path).
   */
  private metadata: TerritorioMetadata | null = null;

  /**
   * On-demand per-territory geometry (fetched via `GET /{numero}/geojson`),
   * backing {@link getGeoJsonFeaturesByTerritorio}. Kept separate from
   * {@link metadata} so the initial load stays a single small DTO request.
   */
  private readonly geoJsonFeatures = new Map<number, GeoJSON.Feature[]>();
  /** In-flight geometry fetches, deduplicating concurrent heal requests. */
  private readonly geoJsonInFlight = new Map<number, Promise<void>>();
  /** Territories whose geometry fetch failed this session (no retry). */
  private readonly geoJsonFailed = new Set<number>();
  /** Territories with a heal already registered (avoids duplicate repaints). */
  private readonly healing = new Set<number>();
  /** Bumped on every metadata reload; stale in-flight writes check it. */
  private metadataGeneration = 0;

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

  async loadAllTerritories(): Promise<void> {
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
   * Fetches and validates the one-time `GET /territories/metadata` DTO
   * list, deriving per-territory manzana COUNTS, BOUNDS (fitBounds focus)
   * and label CENTROIDS. Fail-tolerant: on a fetch error or a malformed
   * payload the metadata stays null (with a `console.warn`) and tiles keep
   * rendering normally. Reloading also resets the on-demand geometry cache.
   */
  async loadTerritoryMetadata(): Promise<void> {
    this.metadataGeneration += 1;
    this.geoJsonFeatures.clear();
    this.geoJsonInFlight.clear();
    this.geoJsonFailed.clear();
    this.healing.clear();

    try {
      const raw = await this.territorioService.getTerritoryMetadata();
      const parsed = parseTerritoryMetadata(raw);
      if (parsed === null) {
        this.metadata = null;
        console.warn(
          'MapRenderingFacade: malformed /territories/metadata payload — counters/labels degraded',
        );
        return;
      }
      this.metadata = parsed;
    } catch (error) {
      this.metadata = null;
      console.warn(
        'MapRenderingFacade: /territories/metadata fetch failed — counters/labels degraded',
        error,
      );
    }
  }

  /** Real per-territory manzana count from the metadata DTOs. */
  getManzanaCountByTerritorio(territorioNum: number): number {
    return this.metadata?.manzanaCounts.get(territorioNum) ?? 0;
  }

  /** Territory bounding box from the metadata DTOs, or null if unknown. */
  getBoundsByTerritorio(territorioNum: number): GeojsonBounds | null {
    return this.metadata?.boundsByTerritorio.get(territorioNum) ?? null;
  }

  /** Label centroid (`center`, ST_PointOnSurface) or null if unknown. */
  getCentroidByTerritorio(territorioNum: number): [number, number] | null {
    return this.metadata?.centroidsByTerritorio.get(territorioNum) ?? null;
  }

  /**
   * Per-territory geometry features from the on-demand cache (empty until
   * the territory is fetched — see {@link healGeoJsonGeometry}). Feeds the
   * marked overlay, the highlight and matchMarkedFeature.
   */
  getGeoJsonFeaturesByTerritorio(territorioNum: number): GeoJSON.Feature[] {
    return this.geoJsonFeatures.get(territorioNum) ?? [];
  }

  /** Territory numbers present in the metadata DTOs. */
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
   * 0.05 incomplete) — the Leaflet parity rule. Marks restored from the
   * backend count too: a territory reported in a previous session must render
   * completed the moment the map loads.
   */
  getCompletedTerritorios(): number[] {
    if (!this.metadata) return [];
    const completed: number[] = [];
    for (const [num, total] of this.metadata.manzanaCounts) {
      const marks = this.state.manzanasVisiblesByTerritorio().get(num) ?? [];
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
   * the territory metadata is loaded (and BEFORE the label layer, so marks
   * render below the territory-number labels).
   */
  initMarkedOverlay(engine: MapEngine): void {
    this.markedOverlay.initOverlay(engine);
    this.refreshOverlayMarks();
  }

  /**
   * Initialize the selected-manzana highlight overlay. Must run after
   * {@link initMarkedOverlay} so the yellow highlight renders above the marks.
   */
  initSelectedManzanaOverlay(engine: MapEngine): void {
    this.selectedOverlay.initOverlay(engine);
    this.renderSelectedManzana();
  }

  /**
   * Highlight the tapped manzana (Leaflet parity: `selectedManzana` yellow
   * `#facc15`, fill 0.15, 4px stroke). The geometry comes from the
   * on-demand per-territory cache, matched by fid / "{t}-{b}" / bloque.
   *
   * <p>When the feature cannot be resolved (geometry still loading) the
   * previous highlight is cleared rather than left stale.</p>
   */
  setSelectedManzana(manzanaId: string, nombreBloque: string, territorioNumero: number): void {
    this.selectedManzanaId = manzanaId;
    this.selectedManzanaNombre = nombreBloque;
    this.selectedManzanaTerritorio = territorioNumero;
    this.renderSelectedManzana();
    this.healGeoJsonGeometry();
  }

  /** Remove the manzana highlight (selection cleared / territory deselected). */
  clearSelectedManzana(): void {
    if (this.selectedManzanaId === null && this.selectedManzanaTerritorio === null) return;
    this.selectedManzanaId = null;
    this.selectedManzanaNombre = '';
    this.selectedManzanaTerritorio = null;
    this.renderSelectedManzana();
  }

  /**
   * Per-engine teardown for the tapped-manzana highlight, run from the
   * page's ngOnDestroy. The overlay service is a root singleton with an
   * idempotent init, so without this the next map visit would skip
   * re-creating the source/layers on the fresh engine and the highlight
   * would silently stop rendering (same failure class as the marked
   * overlay — see 82835c1).
   */
  destroySelectedManzanaOverlay(engine: MapEngine): void {
    this.selectedManzanaId = null;
    this.selectedManzanaNombre = '';
    this.selectedManzanaTerritorio = null;
    this.selectedOverlay.destroy(engine);
  }

  private renderSelectedManzana(): void {
    if (!this.engine || !this.selectedOverlay.isInitialized()) return;

    const id = this.selectedManzanaId;
    const territorioNumero = this.selectedManzanaTerritorio;
    let feature: GeoJSON.Feature | null = null;

    // The highlight only makes sense while its territory is part of the
    // selection: deselecting must not leave a stale yellow polygon behind.
    if (
      id !== null &&
      territorioNumero !== null &&
      this.state.territoriosSeleccionados().includes(territorioNumero)
    ) {
      feature = matchMarkedFeature(
        {
          id,
          nombreBloque: this.selectedManzanaNombre,
          color: '',
          territorioNumero,
        },
        this.getGeoJsonFeaturesByTerritorio(territorioNumero),
      );
    }

    this.selectedOverlay.setSelected(this.engine, feature);
  }

  /**
   * Rebuild the marked overlay from the current marks — editable marks plus the
   * display-only ones restored from the backend. Marks are matched against the
   * on-demand per-territory geometry by fid / "{t}-{b}" id / bloque; matched
   * features carry the mark color and a `completo` flag.
   *
   * <p>Bug fix "modo parcial": `parcial-` marks have no manzana feature to
   * match — their zone is synthesized directly from the SAVED geometry
   * ({@link MapStateService.getDatosParciales}), so a restored partial zone
   * repaints its real polygon instead of disappearing.</p>
   *
   * <p>Ends with {@link healGeoJsonGeometry}: a mark whose territory geometry
   * is not cached yet renders as skipped, then repaints once fetched.</p>
   */
  refreshOverlayMarks(): void {
    if (!this.engine || !this.markedOverlay.isInitialized()) return;

    const marks = this.state.manzanasVisiblesList();
    const completed = new Set(this.getCompletedTerritorios());
    // Leaflet parity: `ocultarPoligonosNoSeleccionados` hid the marks of
    // non-selected territories together with their polygons. With an active
    // selection the marked overlay must therefore only render the selected
    // territories' marks — otherwise foreign marks keep glowing above the
    // hidden tiles while the selected territory looks flat.
    const seleccionados = new Set(this.state.territoriosSeleccionados());
    const features: GeoJSON.Feature[] = [];

    for (const mark of marks) {
      if (seleccionados.size > 0 && !seleccionados.has(mark.territorioNumero)) continue;

      if (mark.id.startsWith('parcial-')) {
        const saved = this.state.getDatosParciales(mark.territorioNumero);
        const geometry = saved ? parseSavedGeometry(saved.geometria) : null;
        if (!geometry) continue;
        features.push({
          type: 'Feature',
          geometry,
          properties: {
            color: this.partialMarkColor(mark),
            completo: false,
          },
        });
        continue;
      }

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
    this.healGeoJsonGeometry();
  }

  /**
   * Fetches (once per territory, per session) and caches the geometry
   * behind {@link getGeoJsonFeaturesByTerritorio}. A failed fetch is
   * remembered (single `console.warn`, no retry until the next metadata
   * reload) so callers degrade to "no match" instead of hammering the
   * backend. In-flight fetches are deduplicated; results from a previous
   * metadata generation are discarded.
   */
  private ensureGeoJsonGeometry(territorioNum: number): Promise<void> {
    if (this.geoJsonFeatures.has(territorioNum)) return Promise.resolve();
    if (this.geoJsonFailed.has(territorioNum)) return Promise.resolve();
    const inFlight = this.geoJsonInFlight.get(territorioNum);
    if (inFlight !== undefined) return inFlight;

    const generation = this.metadataGeneration;
    const request: Promise<void> = this.territorioService
      .getGeoJsonByTerritorio(territorioNum)
      .then(raw => {
        const features = parseTerritoryFeatures(raw);
        if (generation !== this.metadataGeneration) return; // stale — metadata reloaded
        if (features === null) {
          this.geoJsonFailed.add(territorioNum);
          console.warn(
            `MapRenderingFacade: invalid geometry for territory ${territorioNum} — overlay degraded`,
          );
          return;
        }
        this.geoJsonFeatures.set(territorioNum, features);
      })
      .catch(() => {
        if (generation !== this.metadataGeneration) return;
        this.geoJsonFailed.add(territorioNum);
        console.warn(
          `MapRenderingFacade: geometry fetch failed for territory ${territorioNum} — overlay degraded`,
        );
      })
      .finally(() => {
        if (this.geoJsonInFlight.get(territorioNum) === request) {
          this.geoJsonInFlight.delete(territorioNum);
        }
      });
    this.geoJsonInFlight.set(territorioNum, request);
    return request;
  }

  /**
   * On-demand geometry healing: collect the territories that still need
   * geometry — marked ones (partial zones synthesize their own shape and
   * are skipped) plus the selected territory while it is selected — fetch
   * each once, then repaint the overlay and the highlight.
   *
   * <p>Never triggered from the fetch itself, so a failure cannot loop;
   * already-cached and already-failed territories are skipped by
   * {@link ensureGeoJsonGeometry}.</p>
   */
  private healGeoJsonGeometry(): void {
    if (!this.engine) return;

    const pending = new Set<number>();
    for (const mark of this.state.manzanasVisiblesList()) {
      if (mark.id.startsWith('parcial-')) continue;
      pending.add(mark.territorioNumero);
    }
    const seleccionados = this.state.territoriosSeleccionados();
    const selected = this.selectedManzanaTerritorio;
    if (selected !== null && seleccionados.includes(selected)) pending.add(selected);

    for (const numero of pending) {
      if (this.healing.has(numero)) continue;
      if (this.geoJsonFeatures.has(numero) || this.geoJsonFailed.has(numero)) continue;
      this.healing.add(numero);
      void this.ensureGeoJsonGeometry(numero).then(() => {
        this.healing.delete(numero);
        this.refreshOverlayMarks();
        this.renderSelectedManzana();
      });
    }
  }

  /**
   * Color of a partial-zone mark: the mark's own color when set, otherwise
   * the territory layer color, the current territory color, and finally the
   * overlay's fallback green (restored marks carry the resolved territory
   * color, so the first hop covers the normal paths).
   */
  private partialMarkColor(mark: ManzanaMarcada): string {
    return (
      mark.color ||
      this.getFeatureLayerByTerritorio(mark.territorioNumero)?.color ||
      this.getCurrentTerritoryColor() ||
      PARTIAL_FALLBACK_COLOR
    );
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
    this.renderSelectedManzana();
  }

  // ─── Current territory color (delegated to state) ───────────────

  setCurrentTerritoryColor(color: string): void {
    this.state.currentTerritoryColor.set(color);
  }

  getCurrentTerritoryColor(): string {
    return this.state.currentTerritoryColor();
  }
}