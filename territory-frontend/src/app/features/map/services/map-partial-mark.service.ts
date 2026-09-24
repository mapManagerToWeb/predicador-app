import { Injectable, inject } from '@angular/core';
import { Toast } from '../../../core/services/toast';
import { TerritorioService } from '../../../core/services/territorio';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { MapEditOverlayService } from './map-edit-overlay.service';
import type { MapEngine } from './map-engine.interface';
import type { Edge, LatLng, ProjectionMap, SnappedPoint } from '../map-geometry';
import {
  makeLatLng,
  snapToContour,
  traceContourBetween,
  latLngDist,
} from '../map-geometry';
import { createMapLibreProjectionAdapter } from './map-libre-projection-adapter';
import { TOAST_MESSAGES, MAX_PUNTOS_PARCIAL, nextParcialId } from '../utils/map-constants';
import type * as GeoJSON from 'geojson';

/** Empty preview pushed while a draw has no points yet. */
const EMPTY_PREVIEW: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Locates the manzana feature of a territory GeoJSON snapshot that
 * corresponds to the tapped MVT manzana.
 *
 * <p>MVT clicks yield a numeric `manzanaId` (the PK `fid`), while the
 * per-territory GeoJSON snapshot (Hibernate serializer) carries
 * `id` ("{t}-{b}") and `nombre_bloque` properties. Matching priority:
 * `fid` → `feature.id` → `id` → `nombre_bloque` (last two gated on the
 * territory number so a repeated block name in another territory cannot
 * match).</p>
 *
 * @returns The matched feature or {@code null} when no manzana matches.
 */
export function findTargetManzana(
  geoJson: GeoJSON.FeatureCollection,
  manzanaId: string,
  nombreBloque: string,
  territorioNumero: number,
): GeoJSON.Feature | null {
  for (const feature of geoJson.features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    if (Number(props['territorio_padre']) !== territorioNumero) continue;

    if (manzanaId !== '' && String(props['fid'] ?? '') === manzanaId) return feature;
    if (manzanaId !== '' && String(feature.id ?? '') === manzanaId) return feature;
    if (manzanaId !== '' && String(props['id'] ?? '') === manzanaId) return feature;
    if (nombreBloque !== '' && String(props['nombre_bloque'] ?? '') === nombreBloque) return feature;
  }
  return null;
}

/**
 * Resolves the manzana identifier of a GeoJSON snapshot feature.
 *
 * <p>Partial marks and {@link findTargetManzana} keys are the MVT `fid`
 * (the numeric PK); the snapshot also carries `id` ("{t}-{b}") and
 * `nombre_bloque`. Priority matches the rest of the codebase:
 * `fid` → `feature.id` → `id`.</p>
 *
 * @returns The feature key, or {@code ''} when none is present.
 */
export function manzanaKeyOf(feature: GeoJSON.Feature): string {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const raw = props['fid'] ?? feature.id ?? props['id'];
  return raw === undefined || raw === null ? '' : String(raw);
}

/**
 * Flattens a GeoJSON manzana feature (Polygon or MultiPolygon) into the
 * projected-edge list consumed by {@link snapToContour}.
 *
 * <p>GeoJSON polygon rings are closed (first === last position), so every
 * consecutive pair is an edge and no manual closing edge is required.</p>
 */
export function featureToEdges(feature: GeoJSON.Feature): Edge[] {
  const geometry = feature.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return ringsToEdges(geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap(ringsToEdges);
  }
  return [];
}

function ringsToEdges(rings: GeoJSON.Position[][]): Edge[] {
  const edges: Edge[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      edges.push({
        from: makeLatLng(ring[i][1], ring[i][0]),
        to: makeLatLng(ring[i + 1][1], ring[i + 1][0]),
      });
    }
  }
  return edges;
}

@Injectable({ providedIn: 'root' })
export class MapPartialMarkService {
  private readonly rendering = inject(MapRenderingFacade);
  private readonly selection = inject(MapSelectionService);
  private readonly state = inject(MapStateService);
  private readonly toastService = inject(Toast);
  private readonly overlay = inject(MapEditOverlayService);
  private readonly territorios = inject(TerritorioService);

  /**
   * Engine of the draw currently in progress. Stored so the overlay can be
   * updated (preview) and removed (confirm/cancel) without threading the
   * engine through every UI button handler.
   */
  private engine: MapEngine | null = null;

  /**
   * Contour edges of the owning manzana for each partial-draw point
   * (parallel to `state.puntosParciales()`).
   *
   * <p>Consecutive points whose edges are the SAME array instance lie on
   * the same manzana: the preview (and the saved polygon) traces the real
   * contour between them via {@link traceContourBetween} instead of a
   * straight segment — "los puntos auto-rellenan el polígono".</p>
   */
  private puntosEdges: Edge[][] = [];

  /**
   * Per-session cache of manzana edges keyed by {@link manzanaKeyOf}.
   *
   * <p>Guarantees that points snapped to the same manzana share the same
   * edges array instance (identity is the same-manzana test above) and
   * avoids recomputing `featureToEdges` on every tap.</p>
   */
  private edgesCache = new Map<string, Edge[]>();

  /**
   * Snap the tap to the NEAREST UNMARKED manzana of the active territory
   * (auto-fill by nearest point — bug fix "modo parcial").
   *
   * <p>Every unmarked manzana of the active territory (from the on-demand
   * GeoJSON snapshot) is a snap candidate: the winner is the one whose
   * contour is closest (in container pixels) to the tap. When no candidate
   * is within the snap threshold — or no snapshot is loaded — the snapshot
   * is skipped and the fallback snaps against the anchored manzana, so
   * free-form points remain possible.</p>
   *
   * @param latlng   The tapped geographic point.
   * @param adapter  Projection used for pixel-space distance checks.
   * @returns The snapped point plus the owning manzana's contour edges.
   */
  snapToNearestManzana(latlng: LatLng, adapter: ProjectionMap): { snapped: SnappedPoint; edges: Edge[] } {
    const fallback = this.fallbackSnap(latlng, adapter);
    const fc = this.state.editGeoJson();
    const territorio = this.territorioActivo();
    if (!fc || territorio === null) return fallback;

    const marked = this.markedTerritorioIds(territorio);

    let best: { snapped: SnappedPoint; edges: Edge[] } | null = null;
    let bestDist = Infinity;

    for (const feature of fc.features) {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      if (Number(props['territorio_padre']) !== territorio) continue;

      const key = manzanaKeyOf(feature);
      if (key === '' || marked.has(key)) continue;

      const edges = this.edgesForManzana(key, feature);
      if (edges.length === 0) continue;

      const snapped = snapToContour(latlng, edges, adapter);
      if (snapped.edgeIdx < 0) continue;

      const dist = latLngDist(latlng, snapped.latlng, adapter);
      if (dist < bestDist) {
        bestDist = dist;
        best = { snapped, edges };
      }
    }

    return best ?? fallback;
  }

  /**
   * Identifiers (in {@link manzanaKeyOf} form) of the territory's marked
   * manzanas, bridged across the two key spaces:
   *
   * <p>Marks ({@link MapStateService.manzanasVisiblesByTerritorio}) are keyed
   * by the MVT `fid` (numeric PK), while the per-territory snapshot loaded
   * into `editGeoJson` identifies features by `id` ("{t}-{b}") — the keys do
   * NOT overlap. The {@link MapRenderingFacade} metadata (the `/all/geojson`
   * snapshot) carries BOTH `fid` and `id`, so a fid-keyed mark resolves to
   * its "{t}-{b}" id there and the resulting set excludes the matching
   * `editGeoJson` feature. Marks that cannot be bridged (no metadata loaded,
   * or already "{t}-{b}"-shaped — tests) fall back to plain key equality.</p>
   *
   * @returns The marked manzana keys; empty when no marks exist for the
   *          territory (the caller then treats every feature as a candidate).
   */
  private markedTerritorioIds(territorio: number): Set<string> {
    const marks = this.state.manzanasVisiblesByTerritorio().get(territorio) ?? [];
    if (marks.length === 0) return new Set();

    // fid → "{t}-{b}" bridge from the /all/geojson metadata.
    const propsIdByKey = new Map<string, string>();
    for (const feature of this.rendering.getGeoJsonFeaturesByTerritorio(territorio)) {
      const key = manzanaKeyOf(feature);
      const propsId = (feature.properties ?? {})['id'];
      if (key !== '' && propsId !== undefined && propsId !== null) {
        propsIdByKey.set(key, String(propsId));
      }
    }

    const marked = new Set<string>();
    for (const mark of marks) {
      if (mark.id.startsWith('parcial-')) continue;
      marked.add(propsIdByKey.get(mark.id) ?? mark.id);
    }
    return marked;
  }

  /**
   * Starts a partial draw on the tapped manzana (Leaflet parity F6):
   * selects the manzana, loads the full-precision territory geometry,
   * shows it in the edit overlay, and derives the contours to snap to.
   *
   * <p>Point addition is not performed here — the first tap only anchors
   * the draw; subsequent taps add snapped points.</p>
   */
  async iniciarDibujo(
    manzanaId: string,
    nombreBloque: string,
    color: string,
    territorioNumero: number,
    engine: MapEngine,
  ): Promise<void> {
    this.selection.selectManzanaById(manzanaId, nombreBloque, color, territorioNumero);
    this.engine = engine;
    this.state.puntosParciales.set([]);
    this.puntosEdges = [];
    this.edgesCache.clear();
    this.state.partialDrawGeoJson.set(null);

    try {
      const raw = await this.territorios.getGeoJsonByTerritorio(territorioNumero);
      const fc = JSON.parse(raw) as GeoJSON.FeatureCollection;
      const target = findTargetManzana(fc, manzanaId, nombreBloque, territorioNumero);

      this.state.editGeoJson.set(fc);
      this.overlay.addOverlay(fc, engine);
      this.state.manzanaEdges.set(target ? featureToEdges(target) : []);
    } catch {
      // Geometry is only a drawing aid: keep the selection usable with
      // free-form points when the snapshot is unavailable.
      console.warn('[map] no se pudo cargar la geometría del territorio', territorioNumero);
    }
  }

  agregarPunto(punto: SnappedPoint, edges: Edge[] = []): void {
    const actuales = this.state.puntosParciales();
    if (actuales.length >= MAX_PUNTOS_PARCIAL) {
      this.toastService.show(TOAST_MESSAGES.maxPoints);
      return;
    }
    this.state.puntosParciales.set([...actuales, punto]);
    this.puntosEdges = [...this.puntosEdges, edges];
    this.actualizarPreview();
  }

  deshacerPunto(): void {
    const actuales = this.state.puntosParciales();
    if (actuales.length === 0) return;
    this.state.puntosParciales.set(actuales.slice(0, -1));
    this.puntosEdges = this.puntosEdges.slice(0, -1);
    this.actualizarPreview();
  }

  /**
   * Rebuilds the partial-draw preview and pushes it through the edit overlay.
   *
   * <p>Leaflet parity (`STYLE_DEFAULTS.partialPolygon`): from three points on,
   * the preview is a closed, filled and dashed polygon in the active territory
   * color, so the area being drawn is visible while it is drawn. With fewer
   * points a polygon encloses no area, so the preview stays an open path.</p>
   *
   * <p>Bug fix "modo parcial": consecutive points on the SAME manzana trace
   * the real manzana contour between them (`traceContourBetween`) instead of
   * a straight segment — the polygon auto-fills the nearest space by nearest
   * point.</p>
   */
  private actualizarPreview(): void {
    const puntos = this.state.puntosParciales();
    if (puntos.length === 0) {
      this.state.partialDrawGeoJson.set(null);
      // Keep the preview layers in place but empty — limpiarDibujo() tears
      // them down when the draw session ends.
      if (this.engine) this.overlay.updatePartialPreview(EMPTY_PREVIEW, this.engine);
      return;
    }

    const adapter = this.engine ? createMapLibreProjectionAdapter(this.engine) : null;
    const geometry = this.buildPreviewGeometry(puntos, adapter);

    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry,
          properties: { color: this.colorTerritorioActivo() },
        },
      ],
    };
    this.state.partialDrawGeoJson.set(fc);
    if (this.engine) this.overlay.updatePartialPreview(fc, this.engine);
  }

  /**
   * Build the preview geometry for the current points: a closed traced
   * polygon from 3+ points, an open traced path otherwise.
   */
  private buildPreviewGeometry(puntos: SnappedPoint[], adapter: ProjectionMap | null): GeoJSON.Geometry {
    const coords = this.tracePath(puntos, adapter, false);
    if (puntos.length >= 3) {
      return { type: 'Polygon', coordinates: [this.tracePath(puntos, adapter, true)] };
    }
    return { type: 'LineString', coordinates: coords };
  }

  /**
   * Consecutive points on the same manzana trace the real contour between
   * them. Points on different manzanas (or with no loaded geometry) are
   * joined by a straight segment.
   *
   * <p>With {@code close}, the path is a closed ring (the closing segment
   * traces back from the last point to the first when they share a manzana).
   * Consecutive duplicates from contour tracing are dropped.</p>
   *
   * @returns `[lng, lat]` coordinates; the closed ring is already closed
   *          (first === last).
   */
  private tracePath(puntos: SnappedPoint[], adapter: ProjectionMap | null, close: boolean): [number, number][] {
    const n = puntos.length;
    if (n === 0) return [];
    if (n === 1) return [[puntos[0].latlng.lng, puntos[0].latlng.lat]];

    const latlngs: LatLng[] = [];
    const segments = close ? n : n - 1;
    for (let i = 0; i < segments; i++) {
      const a = puntos[i];
      const b = puntos[(i + 1) % n];
      // The edges parallel array can be shorter than the points when points
      // are injected via state directly (tests) — treat missing entries as
      // "no manzana geometry" (straight segment).
      const edgesA = this.puntosEdges[i] ?? [];
      const edgesB = this.puntosEdges[(i + 1) % n] ?? [];
      const sameManzana = edgesA.length > 0 && edgesB === edgesA;
      const path = sameManzana && adapter
        ? traceContourBetween(a, b, edgesA, adapter)
        : [a.latlng, b.latlng];

      for (const p of path) {
        const last = latlngs[latlngs.length - 1];
        if (!last || last.lat !== p.lat || last.lng !== p.lng) {
          latlngs.push(p);
        }
      }
    }

    return latlngs.map(p => [p.lng, p.lat] as [number, number]);
  }

  /** Fallback snap: the anchored manzana's contour (or a free point). */
  private fallbackSnap(latlng: LatLng, adapter: ProjectionMap): { snapped: SnappedPoint; edges: Edge[] } {
    const edges = this.state.manzanaEdges();
    return { snapped: snapToContour(latlng, edges, adapter), edges };
  }

  /** Cached per-manzana edges (same array instance per manzana per session). */
  private edgesForManzana(key: string, feature: GeoJSON.Feature): Edge[] {
    if (key === '') return featureToEdges(feature);
    let edges = this.edgesCache.get(key);
    if (!edges) {
      edges = featureToEdges(feature);
      this.edgesCache.set(key, edges);
    }
    return edges;
  }

  private colorTerritorioActivo(): string {
    const territorioManzana = this.state.manzanaSeleccionadaTerritorio();
    const seleccionados = this.state.territoriosSeleccionados();
    const territorio = territorioManzana ?? seleccionados[seleccionados.length - 1];
    if (territorio !== undefined && territorio !== null) {
      const fl = this.rendering.getAllTerritoriesLayer().find(f => f.territorioPadre === territorio);
      if (fl?.color) return fl.color;
    }
    return this.rendering.getCurrentTerritoryColor() || '#22c55e';
  }

  private territorioActivo(): number | null {
    const territorioManzana = this.state.manzanaSeleccionadaTerritorio();
    if (territorioManzana !== null) return territorioManzana;
    const seleccionados = this.state.territoriosSeleccionados();
    return seleccionados.length > 0 ? seleccionados[seleccionados.length - 1] : null;
  }

  finalizarParcial(): void {
    if (this.state.puntosCount() < 3) {
      this.toastService.show(TOAST_MESSAGES.minPoints);
      return;
    }

    const territorio = this.territorioActivo();
    if (territorio === null) {
      this.toastService.show(TOAST_MESSAGES.noTerritories);
      return;
    }

    const id = nextParcialId();
    const nombreBloque = this.state.manzanaSeleccionadaNombre()
      ? `Parcial: ${this.state.manzanaSeleccionadaNombre()}`
      : 'Zona parcial';

    const color = this.colorTerritorioActivo();

    // Persist the REAL traced polygon (closed ring with the contour vertices
    // between same-manzana points). Replaces the dummy Point — bug fix
    // "modo parcial": the backend receives valid GeoJSON and restore can
    // repaint the zone.
    const adapter = this.engine ? createMapLibreProjectionAdapter(this.engine) : null;
    const ring = this.tracePath([...this.state.puntosParciales()], adapter, true);
    const esPoligonoValido = ring.length >= 4; // closed ring: ≥ 3 distinct points
    const geometria = JSON.stringify(
      esPoligonoValido
        ? { type: 'Polygon', coordinates: [ring] }
        : { type: 'LineString', coordinates: ring },
    );

    // Store partial geometry for save
    this.state.setDatosParciales(territorio, {
      puntos: [...this.state.puntosParciales()],
      geometria,
    });

    const newMap = new Map(this.state.manzanasById());
    newMap.set(id, { id, nombreBloque, color, territorioNumero: territorio });
    this.state.manzanasById.set(newMap);

    this.state.puntosParciales.set([]);
    this.puntosEdges = [];
    this.selection.restaurarManzanaAnterior();
    this.state.modoMarcado.set('none');
    this.rendering.refreshMarksVisual();
    this.limpiarDibujo();
    this.toastService.show(TOAST_MESSAGES.partialMarked);
  }

  cancelarParcial(): void {
    this.selection.limpiarParcial();
    this.selection.restaurarManzanaAnterior();
    this.state.modoMarcado.set('none');
    this.puntosEdges = [];
    this.limpiarDibujo();
  }

  eliminarParcial(id: string): void {
    const current = this.state.manzanasById();
    const removed = current.get(id);
    if (!removed) return;

    const newMap = new Map(current);
    newMap.delete(id);
    this.state.manzanasById.set(newMap);
    this.state.clearDatosParciales(removed.territorioNumero);
    this.rendering.refreshMarksVisual();
    this.toastService.show(TOAST_MESSAGES.partialDeleted);
  }

  /** Tears down the draw overlay and preview after confirm/cancel. */
  /**
   * End the draw session: remove the edit/preview overlay from the engine
   * and drop the engine reference. Public so the page can tear an in-flight
   * draw down when the map is destroyed mid-draw (keeps the preview from
   * leaking into a fresh engine on the next visit). Unlike
   * `cancelarParcial()` it does not touch the draft or selection state.
   */
  limpiarDibujo(): void {
    if (this.engine) this.overlay.removeOverlay(this.engine);
    this.engine = null;
    this.state.partialDrawGeoJson.set(null);
    // Keep the per-point edges parallel array aligned with whatever points
    // remain (teardown can run mid-draw, e.g. on map destroy).
    this.puntosEdges = this.puntosEdges.slice(0, this.state.puntosParciales().length);
  }
}