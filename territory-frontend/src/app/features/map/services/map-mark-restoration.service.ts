import { Injectable, inject } from '@angular/core';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import { TOAST_MESSAGES, nextParcialId } from '../utils/map-constants';
import { elegirUltimoReporte } from '../utils/report-utils';
import type { Reporte } from '../../../core/models/models';
import type { ManzanaMarcada } from '../types/map.types';

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

        if (ultimo.geometriaParcial) {
          this.restaurarGeometriaParcial(ultimo.geometriaParcial, color, territorioNumero, true);
        }
      } else {
        // Display-only restore (load time / background revalidation). Always
        // called — even without a report — so a territory whose report was
        // deleted server-side stops rendering its cached marks.
        this.aplicarMarcas(territorioNumero, color, manzanaId, ids, false);
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

  private restaurarGeometriaParcial(
    _geometriaParcial: string,
    _color: string,
    _territorioNumero: number,
    actualizarEstadoMarcado: boolean
  ): void {
    if (!actualizarEstadoMarcado) return;
    // In MapLibre mode, partial geometry is restored via the edit overlay
    const parcialId = nextParcialId();
    const newMap = new Map(this.state.manzanasById());
    newMap.set(parcialId, { id: parcialId, nombreBloque: 'Zona parcial', color: '', territorioNumero: _territorioNumero });
    this.state.manzanasById.set(newMap);
  }
}
