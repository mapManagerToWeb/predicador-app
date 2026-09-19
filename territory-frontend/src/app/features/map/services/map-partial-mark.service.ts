import { Injectable, inject } from '@angular/core';
import { Toast } from '../../../core/services/toast';
import { TerritorioService } from '../../../core/services/territorio';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { MapEditOverlayService } from './map-edit-overlay.service';
import type { MapEngine } from './map-engine.interface';
import type { Edge, SnappedPoint } from '../map-geometry';
import { makeLatLng } from '../map-geometry';
import { TOAST_MESSAGES, MAX_PUNTOS_PARCIAL, nextParcialId } from '../utils/map-constants';
import type * as GeoJSON from 'geojson';

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

  agregarPunto(punto: SnappedPoint): void {
    const actuales = this.state.puntosParciales();
    if (actuales.length >= MAX_PUNTOS_PARCIAL) {
      this.toastService.show(TOAST_MESSAGES.maxPoints);
      return;
    }
    this.state.puntosParciales.set([...actuales, punto]);
    this.actualizarPreview();
  }

  deshacerPunto(): void {
    const actuales = this.state.puntosParciales();
    if (actuales.length === 0) return;
    this.state.puntosParciales.set(actuales.slice(0, -1));
    this.actualizarPreview();
  }

  /**
   * Rebuilds the partial-draw preview (open path through the added points,
   * in the active territory color) and pushes it through the edit overlay.
   */
  private actualizarPreview(): void {
    const puntos = this.state.puntosParciales();
    if (puntos.length === 0) {
      this.state.partialDrawGeoJson.set(null);
      return;
    }

    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: puntos.map(p => [p.latlng.lng, p.latlng.lat] as [number, number]),
          },
          properties: { color: this.colorTerritorioActivo() },
        },
      ],
    };
    this.state.partialDrawGeoJson.set(fc);
    if (this.engine) this.overlay.updateOverlay(fc, this.engine);
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

    // Store partial geometry for save
    this.state.setDatosParciales(territorio, {
      puntos: [...this.state.puntosParciales()],
      geometria: JSON.stringify({ type: 'Point', coordinates: [] }),
    });

    const newMap = new Map(this.state.manzanasById());
    newMap.set(id, { id, nombreBloque, color, territorioNumero: territorio });
    this.state.manzanasById.set(newMap);

    this.state.puntosParciales.set([]);
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
  private limpiarDibujo(): void {
    if (this.engine) this.overlay.removeOverlay(this.engine);
    this.engine = null;
    this.state.partialDrawGeoJson.set(null);
  }
}