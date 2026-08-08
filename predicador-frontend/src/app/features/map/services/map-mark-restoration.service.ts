import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import * as GeoJSON from 'geojson';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapLayerRegistry } from './map-layer-registry.service';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import { TOAST_MESSAGES, nextParcialId } from '../utils/map-constants';
import { elegirUltimoReporte } from '../utils/report-utils';
import { getMarkedManzanaStyle, getPartialPolygonCompleteStyle } from './map-style.service';
import type { Reporte } from '../../../core/models/models';

@Injectable({ providedIn: 'root' })
export class MapMarkRestorationService {
  private readonly state = inject(MapStateService);
  private readonly rendering = inject(MapRenderingFacade);
  private readonly registry = inject(MapLayerRegistry);
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
      const featureLayerColor = this.rendering.getFeatureLayerByTerritorio(territorioNumero)?.color;
      const color = colorOverride ?? featureLayerColor ?? this.rendering.getCurrentTerritoryColor();
      const { actualizarEstadoMarcado = true } = options;

      if (actualizarEstadoMarcado) {
        const previosParciales = this.state.manzanasByTerritorio().get(territorioNumero)?.filter(m => m.id.startsWith('parcial-')) ?? [];
        for (const p of previosParciales) {
          const layer = this.registry.get(p.id);
          if (layer) this.rendering.removeExtraLayer(layer);
          this.registry.unregister(p.id);
        }
        if (previosParciales.length > 0) {
          const newMap = new Map(this.state.manzanasById());
          for (const p of previosParciales) newMap.delete(p.id);
          this.state.manzanasById.set(newMap);
        }
      }

      const ultimo = elegirUltimoReporte(reportes);
      const ids = ultimo?.manzanasIds ? ultimo.manzanasIds.split(',').filter(Boolean) : [];
      const total = this.rendering.getManzanaCountByTerritorio(territorioNumero);
      const marcadas = ids.length;
      const isComplete = total > 0 && marcadas >= total;

      this.rendering.applyBaseTerritoryStyle(territorioNumero, color, marcadas, { total, isComplete });

      if (!reportes.length || !ultimo) return;

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

      if (ultimo.geometriaParcial) {
        this.restaurarGeometriaParcial(ultimo.geometriaParcial, color, territorioNumero, actualizarEstadoMarcado);
      }
    } catch {
      this.toastService.show(TOAST_MESSAGES.restoreError);
    }
  }

  private restaurarGeometriaParcial(
    geometriaParcial: string,
    color: string,
    territorioNumero: number,
    actualizarEstadoMarcado: boolean
  ): void {
    const map = this.rendering.getMap();
    if (!map) return;

    try {
      const geometry = JSON.parse(geometriaParcial) as GeoJSON.Geometry;
      let latlngs: L.LatLngExpression[] = [];

      if (geometry.type === 'Polygon') {
        latlngs = (geometry as GeoJSON.Polygon).coordinates[0].map(c => L.latLng(c[1], c[0]));
      } else if (geometry.type === 'MultiPolygon') {
        latlngs = (geometry as GeoJSON.MultiPolygon).coordinates[0][0].map(c => L.latLng(c[1], c[0]));
      }

      if (latlngs.length === 0) return;

      const parcialId = nextParcialId();
      const polygon = L.polygon(latlngs, getPartialPolygonCompleteStyle(color)).addTo(map);

      this.rendering.addExtraLayer(polygon);

      if (actualizarEstadoMarcado) {
        this.registry.register(parcialId, polygon);
        const newMap = new Map(this.state.manzanasById());
        newMap.set(parcialId, { id: parcialId, nombreBloque: 'Zona parcial', color, territorioNumero });
        this.state.manzanasById.set(newMap);
      }
    } catch {
      /* ignore parse errors */
    }
  }
}
