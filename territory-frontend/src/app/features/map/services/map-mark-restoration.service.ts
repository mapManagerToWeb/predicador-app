import { Injectable, inject } from '@angular/core';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import { TOAST_MESSAGES, nextParcialId } from '../utils/map-constants';
import { elegirUltimoReporte } from '../utils/report-utils';
import type { Reporte } from '../../../core/models/models';
import type { ManzanaMarcada } from '../types/map.types';
import type { SnappedPoint } from '../map-geometry';

@Injectable({ providedIn: 'root' })
export class MapMarkRestorationService {
  private readonly state = inject(MapStateService);
  private readonly rendering = inject(MapRenderingFacade);
  private readonly territorioService = inject(TerritorioService);
  private readonly toastService = inject(Toast);

  async restaurarDesdeDB(
    territorioNumero: number,
    colorOverride?: string,
    options: { actualizarEstadoMarcado?: boolean } = {}
  ): Promise<void> {
    try {
      const reportes = await this.territorioService.getReportesPorTerritorio(territorioNumero);
      this.restaurarConReportes(territorioNumero, reportes, colorOverride, options);
    } catch {
      this.toastService.show(TOAST_MESSAGES.restoreError);
    }
  }

  restaurarConReportes(
    territorioNumero: number,
    reportes: Reporte[],
    colorOverride?: string,
    options: { actualizarEstadoMarcado?: boolean } = {}
  ): void {
    try {
      const color = this.resolveColor(territorioNumero, colorOverride);
      const { actualizarEstadoMarcado = true } = options;

      const ultimo = elegirUltimoReporte(reportes);
      const ids = ultimo?.manzanasIds ? ultimo.manzanasIds.split(',').filter(Boolean) : [];
      const manzanaId = ultimo?.manzanaId ? String(ultimo.manzanaId) : null;

      if (actualizarEstadoMarcado) {
        if (!reportes.length || !ultimo) return;

        this.limpiarMarcasParcialesPrevias(territorioNumero);
        // The territory's marks are promoted to editable state: drop the
        // display-only copies so toggling one off cannot resurrect it.
        this.state.setRestoredMarksForTerritorio(territorioNumero, []);

        this.aplicarMarcas(territorioNumero, color, manzanaId, ids, true);
      } else {
        // Display-only restore (load time / background revalidation). Always
        // called — even without a report — so a territory whose report was
        // deleted server-side stops rendering its cached marks.
        this.aplicarMarcas(territorioNumero, color, manzanaId, ids, false);
      }

      // A previously reported partial zone repaints from its SAVED geometry
      // in BOTH modes — the restored mark needs the stored polygon and the
      // marked overlay paints it directly (bug fix "modo parcial").
      if (ultimo?.geometriaParcial) {
        this.restaurarGeometriaParcial(
          ultimo.geometriaParcial,
          ultimo.puntosParciales,
          color,
          territorioNumero,
          actualizarEstadoMarcado,
        );
      }

      // Re-apply completion opacity + marked overlay with the restored marks.
      this.rendering.refreshMarksVisual();
    } catch {
      this.toastService.show(TOAST_MESSAGES.restoreError);
    }
  }

  private resolveColor(territorioNumero: number, colorOverride?: string): string {
    const featureLayerColor = this.rendering.getFeatureLayerByTerritorio(territorioNumero)?.color;
    return colorOverride ?? featureLayerColor ?? this.rendering.getCurrentTerritoryColor();
  }

  private limpiarMarcasParcialesPrevias(territorioNumero: number): void {
    const previosParciales = this.state.manzanasByTerritorio().get(territorioNumero)?.filter(m => m.id.startsWith('parcial-')) ?? [];
    if (previosParciales.length === 0) return;
    const newMap = new Map(this.state.manzanasById());
    for (const p of previosParciales) newMap.delete(p.id);
    this.state.manzanasById.set(newMap);
  }

  private aplicarMarcas(
    territorioNumero: number,
    color: string,
    manzanaId: string | null,
    ids: string[],
    actualizarEstadoMarcado: boolean
  ): void {
    // In MapLibre mode, ManzanaIndex is empty — create ManzanaMarcada entries
    // directly from the report IDs. The IDs come from the tile features and
    // are stored in the report's manzanasIds field.
    const marcas = new Map<string, ManzanaMarcada>();
    for (const id of ids) {
      marcas.set(id, { id, nombreBloque: '', color, territorioNumero });
    }
    if (manzanaId) {
      marcas.set(manzanaId, { id: manzanaId, nombreBloque: '', color, territorioNumero });
    }

    if (!actualizarEstadoMarcado) {
      // Display-only: painting is derived from state in MapLibre, so the marks
      // must land somewhere rendering can see — just not in `manzanasById`,
      // which drives the save/send payload.
      this.state.setRestoredMarksForTerritorio(territorioNumero, Array.from(marcas.values()));
      return;
    }

    const existingIds = new Set(
      this.state.manzanasByTerritorio().get(territorioNumero)?.map(m => m.id) ?? []
    );

    const newMap = new Map(this.state.manzanasById());
    let changed = false;

    for (const [id, marca] of marcas) {
      if (existingIds.has(id)) continue;
      newMap.set(id, marca);
      changed = true;
    }

    if (changed) {
      this.state.manzanasById.set(newMap);
    }
  }

  /**
   * Repaints a previously reported (or draft-saved) partial zone from its
   * SAVED geometry in BOTH modes (bug fix "modo parcial").
   *
   * <p>The saved {@code geometriaParcial} is stored in the state's
   * per-territory partial records — the save payload and the marked
   * overlay's synthesized partial feature both read it — and the
   * `parcial-` mark is made visible:
   * <ul>
   *   <li>editable restore: a fresh `parcial-` mark joins {@code manzanasById}
   *       (the draft restore path already carries editable partial marks, so
   *       those are kept instead of adding a duplicate),</li>
   *   <li>display-only restore: the mark is painted through
   *       {@link MapStateService.restoredMarksById} — {@code manzanasById}
   *       stays the save/send payload by design.</li>
   * </ul></p>
   */
  private restaurarGeometriaParcial(
    geometriaParcial: string,
    puntosParciales: string | null | undefined,
    color: string,
    territorioNumero: number,
    actualizarEstadoMarcado: boolean
  ): void {
    this.state.setDatosParciales(territorioNumero, {
      puntos: parsePuntosParciales(puntosParciales),
      geometria: geometriaParcial,
    });

    // An editable `parcial-` mark (draft restore) already renders the zone —
    // adding a second mark in either map would paint a duplicate polygon.
    if (this.yaTieneParcialEditable(territorioNumero)) return;

    if (actualizarEstadoMarcado) {
      const parcialId = nextParcialId();
      const newMap = new Map(this.state.manzanasById());
      newMap.set(parcialId, {
        id: parcialId,
        nombreBloque: 'Zona parcial',
        color,
        territorioNumero,
      });
      this.state.manzanasById.set(newMap);
      return;
    }

    // Display-only: paint through the restored marks, keeping the ones the
    // territory already had (aplicarMarcas just replaced them with the real
    // manzana marks — do not drop them for the partial zone).
    const restored = Array.from(this.state.restoredMarksById().values())
      .filter(m => m.territorioNumero === territorioNumero);
    const parcialId = nextParcialId();
    this.state.setRestoredMarksForTerritorio(territorioNumero, [
      ...restored,
      { id: parcialId, nombreBloque: 'Zona parcial', color, territorioNumero },
    ]);
  }

  private yaTieneParcialEditable(territorioNumero: number): boolean {
    return (this.state.manzanasByTerritorio().get(territorioNumero) ?? [])
      .some(m => m.id.startsWith('parcial-'));
  }
}

/**
 * Parses the report's {@code puntosParciales} JSON (`[{lat,lng}, ...]`) into
 * {@link SnappedPoint}s. Invalid entries are dropped; a malformed payload
 * yields an empty list (the geometry string remains the source of truth for
 * repainting, so bad points must never break the restore).
 */
function parsePuntosParciales(raw: string | null | undefined): SnappedPoint[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const points: SnappedPoint[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    const lat = o['lat'];
    const lng = o['lng'];
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    points.push({ latlng: { lat, lng }, edgeIdx: -1, t: 0 });
  }
  return points;
}
