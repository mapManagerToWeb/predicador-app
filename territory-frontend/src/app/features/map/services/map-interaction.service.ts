import { Injectable, inject } from '@angular/core';
import { LatLng, Polygon, type LeafletMouseEvent } from 'leaflet';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapLayerRegistry } from './map-layer-registry.service';
import { Toast } from '../../../core/services/toast';
import { TOAST_MESSAGES } from '../utils/map-constants';
import type { ManzanaIndex } from '../types/map.types';
import { pointInPolygon, projectOnSegment } from '../map-geometry';
import { collectLatLngRings } from './map-rings';

export interface MapClickResult {
  action: 'none' | 'toggle_manzana' | 'abrir_lados' | 'remove_partial' | 'select_territory';
  manzana?: ManzanaIndex;
  partialId?: string;
}

@Injectable({ providedIn: 'root' })
export class MapInteractionService {
  private readonly state = inject(MapStateService);
  private readonly rendering = inject(MapRenderingFacade);
  private readonly registry = inject(MapLayerRegistry);
  private readonly toastService = inject(Toast);

  handleMapClick(e: LeafletMouseEvent): MapClickResult {
    const modo = this.state.modoMarcado();

    if (modo === 'none') return this.handleClickModoNone(e);
    if (modo === 'completa') return this.handleClickModoCompleta(e);
    if (modo === 'parcial') return this.handleClickModoParcial(e);
    return { action: 'none' };
  }

  private handleClickModoNone(e: LeafletMouseEvent): MapClickResult {
    const hit = this.findManzanaInside(e.latlng);
    if (!hit) return { action: 'none' };
    if (this.state.manzanasById().has(hit.id)) {
      return { action: 'toggle_manzana', manzana: hit };
    }
    return { action: 'select_territory', manzana: hit };
  }

  private handleClickModoCompleta(e: LeafletMouseEvent): MapClickResult {
    const hit = this.findManzanaInside(e.latlng);
    if (!hit) return { action: 'none' };

    // Territorio no seleccionado: bloquear el cambio de territorio
    if (!this.state.territoriosSeleccionados().includes(hit.territorioNumero)) {
      this.toastService.show(TOAST_MESSAGES.territoryLock);
      return { action: 'none' };
    }
    // En modo marcar-completo solo se marca, nunca se desmarca.
    if (this.state.manzanasById().has(hit.id)) {
      return { action: 'none' };
    }
    return { action: 'toggle_manzana', manzana: hit };
  }

  /**
   * Modo parcial: tocar una manzana (o cerca de ella, en la calle) la abre
   * para elegir sus lados. Las zonas antiguas de trazo libre, que no tienen
   * manzana, se quitan tocándolas.
   */
  private handleClickModoParcial(e: LeafletMouseEvent): MapClickResult {
    const hit = this.findManzanaInside(e.latlng);
    if (!hit) {
      const antigua = this.findParcialAtPoint(e.latlng);
      if (antigua) return { action: 'remove_partial', partialId: antigua.id };
    }

    const manzana = hit ?? this.findNearestManzana(e.latlng);
    if (!manzana) {
      this.toastService.show(TOAST_MESSAGES.noNearbyManzana);
      return { action: 'none' };
    }
    if (!this.state.territoriosSeleccionados().includes(manzana.territorioNumero)) {
      this.toastService.show(TOAST_MESSAGES.territoryLock);
      return { action: 'none' };
    }
    if (this.state.manzanasById().has(manzana.id)) {
      this.toastService.show(TOAST_MESSAGES.yaCompleta(manzana.nombreBloque));
      return { action: 'none' };
    }
    return { action: 'abrir_lados', manzana };
  }

  private findParcialAtPoint(latlng: LatLng): { id: string } | null {
    for (const m of this.state.manzanasById().values()) {
      if (!m.id.startsWith('parcial-')) continue;
      if (this.state.zonasParciales().get(m.id)?.manzanaId) continue;
      const layer = this.registry.get(m.id);
      if (!(layer instanceof Polygon)) continue;
      // Leaflet 2.0 comparte Polygon/MultiPolygon: un MultiPolygon deja
      // getLatLngs() con forma [[ring],[ring]]. collectLatLngRings aplana la
      // forma; probamos el punto contra todas las partes.
      const rings = collectLatLngRings(layer.getLatLngs());
      for (const ring of rings) {
        if (pointInPolygon(latlng, ring)) {
          return { id: m.id };
        }
      }
    }
    return null;
  }

  private findManzanaInside(latlng: LatLng): ManzanaIndex | null {
    const { lat, lng } = latlng;
    // El grid espacial acota la búsqueda a la celda del punto (O(1) promedio)
    // en lugar de escanear todas las manzanas.
    for (const mc of this.rendering.queryManzanasAt(latlng)) {
      if (lat < mc.bbox.minLat || lat > mc.bbox.maxLat || lng < mc.bbox.minLng || lng > mc.bbox.maxLng) {
        continue;
      }
      const rings = collectLatLngRings(mc.polygon.getLatLngs());
      for (const ring of rings) {
        if (pointInPolygon(latlng, ring)) {
          return mc;
        }
      }
    }
    return null;
  }

  private findNearestManzana(latlng: LatLng): ManzanaIndex | null {
    const inside = this.findManzanaInside(latlng);
    if (inside) return inside;

    const map = this.rendering.getMap();
    if (!map) return null;

    const clickPt = map.latLngToContainerPoint(latlng);
    let best: ManzanaIndex | null = null;
    let bestDist = Infinity;

    // El grid espacial acota la búsqueda a las celdas vecinas del punto
    // (ventana 3x3 por defecto) en lugar de escanear todas las manzanas.
    for (const mc of this.rendering.queryManzanasNear(latlng)) {
      const { minLat, maxLat, minLng, maxLng } = mc.bbox;
      const clampLat = Math.max(minLat, Math.min(latlng.lat, maxLat));
      const clampLng = Math.max(minLng, Math.min(latlng.lng, maxLng));
      const bboxDx = (latlng.lat - clampLat) * 111000;
      const bboxDy = (latlng.lng - clampLng) * 111000 * Math.cos((latlng.lat * Math.PI) / 180);
      const bboxDist = Math.sqrt(bboxDx * bboxDx + bboxDy * bboxDy);
      if (bboxDist >= bestDist) continue;

      const rings = collectLatLngRings(mc.polygon.getLatLngs());
      if (rings.length === 0) continue;

      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          const proj = projectOnSegment(latlng, a, b, map);
          const projPt = map.latLngToContainerPoint(proj);
          const d = clickPt.distanceTo(projPt);
          if (d < bestDist) {
            bestDist = d;
            best = mc;
          }
        }
      }
    }

    return best;
  }
}
