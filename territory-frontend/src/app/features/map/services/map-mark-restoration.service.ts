import { Injectable, inject } from '@angular/core';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapLayerRegistry } from './map-layer-registry.service';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import { TOAST_MESSAGES, nextParcialId } from '../utils/map-constants';
import { elegirUltimoReporte } from '../utils/report-utils';
import { getMarkedManzanaStyle } from './map-style.service';
import { MapLadosService } from './map-lados.service';
import { leerZonas } from '../utils/lados';
import type { Reporte } from '../../../core/models/models';

@Injectable({ providedIn: 'root' })
export class MapMarkRestorationService {
  private readonly state = inject(MapStateService);
  private readonly rendering = inject(MapRenderingFacade);
  private readonly registry = inject(MapLayerRegistry);
  private readonly territorioService = inject(TerritorioService);
  private readonly toastService = inject(Toast);
  private readonly lados = inject(MapLadosService);

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

      if (actualizarEstadoMarcado) {
        this.limpiarMarcasParcialesPrevias(territorioNumero);
      }

      const ultimo = elegirUltimoReporte(reportes);
      const ids = ultimo?.manzanasIds ? ultimo.manzanasIds.split(',').filter(Boolean) : [];
      this.aplicarEstiloBase(territorioNumero, color, ids);

      if (!reportes.length || !ultimo) return;

      this.aplicarMarcas(territorioNumero, color, ultimo, ids, actualizarEstadoMarcado);

      this.restaurarZonasParciales(ultimo, color, territorioNumero, actualizarEstadoMarcado);
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
    for (const p of previosParciales) {
      const layer = this.registry.get(p.id);
      if (layer) this.rendering.removeExtraLayer(layer);
      this.registry.unregister(p.id);
    }
    if (previosParciales.length === 0) return;
    const newMap = new Map(this.state.manzanasById());
    const zonas = new Map(this.state.zonasParciales());
    for (const p of previosParciales) {
      newMap.delete(p.id);
      zonas.delete(p.id);
    }
    this.state.manzanasById.set(newMap);
    this.state.zonasParciales.set(zonas);
  }

  private aplicarEstiloBase(territorioNumero: number, color: string, ids: string[]): void {
    const total = this.rendering.getManzanaCountByTerritorio(territorioNumero);
    const marcadas = ids.length;
    const isComplete = total > 0 && marcadas >= total;
    this.rendering.applyBaseTerritoryStyle(territorioNumero, color, marcadas, { total, isComplete });
  }

  private aplicarMarcas(
    territorioNumero: number,
    color: string,
    ultimo: Reporte,
    ids: string[],
    actualizarEstadoMarcado: boolean
  ): void {
    const manzanaId = ultimo.manzanaId ? String(ultimo.manzanaId) : null;
    const existingIds = new Set(
      this.state.manzanasByTerritorio().get(territorioNumero)?.map(m => m.id) ?? []
    );

    for (const mc of this.rendering.getManzanaIndex()) {
      if (mc.territorioNumero !== territorioNumero) continue;
      const isMarked = ids.includes(mc.id) || (manzanaId !== null && mc.id === manzanaId);
      if (isMarked) {
        mc.polygon.setStyle(getMarkedManzanaStyle(color));
        if (actualizarEstadoMarcado && !existingIds.has(mc.id)) {
          this.registry.register(mc.id, mc.polygon);
          const newMap = new Map(this.state.manzanasById());
          newMap.set(mc.id, { id: mc.id, nombreBloque: mc.nombreBloque, color, territorioNumero });
          this.state.manzanasById.set(newMap);
        }
      }
    }
  }

  /**
   * Dibuja las zonas parciales del reporte. Las del marcado por lados vuelven
   * con su manzana y sus lados (se pueden seguir editando); las de reportes
   * antiguos (trazo libre) vuelven como zonas sin manzana.
   */
  private restaurarZonasParciales(
    ultimo: Reporte,
    color: string,
    territorioNumero: number,
    actualizarEstadoMarcado: boolean
  ): void {
    const map = this.rendering.getMap();
    if (!map) return;

    const zonas = leerZonas(ultimo.geometriaParcial, ultimo.puntosParciales);
    if (zonas.length === 0) return;
    // Solo pintar (sin actualizar estado) un territorio cuyas zonas ya están en
    // el estado duplicaría las capas: esas ya están dibujadas y registradas.
    if (!actualizarEstadoMarcado && this.state.zonasDeTerritorio(territorioNumero).length > 0) return;
    const marcadas = new Map(this.state.manzanasById());
    const guardadas = new Map(this.state.zonasParciales());
    for (const zona of zonas) {
      const id = nextParcialId();
      const capa = this.lados.crearCapaZona(zona.geometria, color).addTo(map);
      this.rendering.addExtraLayer(capa);
      if (!actualizarEstadoMarcado) continue;
      this.registry.register(id, capa);
      marcadas.set(id, {
        id,
        nombreBloque: zona.manzanaId ? `Parcial: ${zona.manzanaNombre}` : 'Zona parcial',
        color,
        territorioNumero,
      });
      guardadas.set(id, { ...zona, id, territorio: territorioNumero });
    }
    if (actualizarEstadoMarcado) {
      this.state.manzanasById.set(marcadas);
      this.state.zonasParciales.set(guardadas);
    }
  }
}
