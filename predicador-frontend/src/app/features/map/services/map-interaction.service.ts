import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import { MapStateService } from './map-state.service';
import { MapRenderingService } from './map-rendering.service';
import { MAX_PUNTOS_PARCIAL } from '../utils/map-constants';
import type { SnappedPoint, ManzanaIndex } from '../types/map.types';
import { snapToContour, pointInPolygon, projectOnSegment } from '../map-geometry';

export interface MapClickResult {
  action: 'none' | 'select_manzana' | 'toggle_manzana' | 'add_partial_point' | 'remove_partial' | 'select_territory';
  manzana?: ManzanaIndex;
  partialId?: string;
  snappedPoint?: SnappedPoint;
}

@Injectable({ providedIn: 'root' })
export class MapInteractionService {
  private state = inject(MapStateService);
  private rendering = inject(MapRenderingService);

  handleMapClick(e: L.LeafletMouseEvent): MapClickResult {
    const modo = this.state.modoMarcado();

    const hitParcial = this.findParcialAtPoint(e.latlng);
    if (hitParcial) {
      return { action: 'remove_partial', partialId: hitParcial.id };
    }

    if (modo === 'none') {
      const hit = this.findManzanaInside(e.latlng);
      if (hit) {
        const current = this.state.manzanasMarcadas();
        const isMarked = current.some(m => m.id === hit.id);
        if (isMarked) {
          return { action: 'toggle_manzana', manzana: hit };
        }
        return { action: 'select_territory', manzana: hit };
      }
      return { action: 'none' };
    }

    if (modo === 'completa') {
      const hit = this.findManzanaInside(e.latlng);
      if (hit) {
        if (!this.state.territoriosSeleccionados().includes(hit.territorioNumero)) {
          return { action: 'select_territory', manzana: hit };
        }
        return { action: 'toggle_manzana', manzana: hit };
      }
      return { action: 'none' };
    }

    if (modo === 'parcial') {
      const hit = this.findManzanaInside(e.latlng);
      if (hit) {
        const current = this.state.manzanasMarcadas();
        const isMarked = current.some(m => m.id === hit.id);
        if (isMarked) {
          return { action: 'toggle_manzana', manzana: hit };
        }

        if (!this.state.territoriosSeleccionados().includes(hit.territorioNumero)) {
          return { action: 'select_territory', manzana: hit };
        }
      }

      if (!this.state.manzanaSeleccionada) {
        const nearest = hit ?? this.findNearestManzana(e.latlng);
        if (nearest) {
          return { action: 'select_manzana', manzana: nearest };
        }
        return { action: 'none' };
      }

      // Restringir el marcado parcial SOLO a la manzana seleccionada
      const map = this.rendering.getMap();
      if (!map) return { action: 'none' };

      const snapped = snapToContour(e.latlng, this.state.manzanaEdges, map);
      
      // Si el punto no está en los bordes de la manzana seleccionada y tampoco está dentro, ignorar
      if (snapped.edgeIdx === -1) {
        return { action: 'none' };
      }

      if (this.state.puntosCount() >= MAX_PUNTOS_PARCIAL) {
        return { action: 'none' };
      }

      return { action: 'add_partial_point', snappedPoint: snapped };
    }

    return { action: 'none' };
  }

  handleMarkerDrag(marker: L.Marker, index: number): SnappedPoint[] {
    const map = this.rendering.getMap();
    if (!map) return this.state.puntosParciales();

    const actualizados = [...this.state.puntosParciales()];
    const snapped = snapToContour(marker.getLatLng(), this.state.manzanaEdges, map);
    actualizados[index] = snapped;
    return actualizados;
  }

  private findParcialAtPoint(latlng: L.LatLng): { id: string } | null {
    const marcadas = this.state.manzanasMarcadas();
    for (const m of marcadas) {
      if (!m.id.startsWith('parcial-')) continue;
      if (m.layer instanceof L.Polygon) {
        const rings = m.layer.getLatLngs();
        const outer = rings[0] as L.LatLng[];
        if (outer && pointInPolygon(latlng, outer)) {
          return { id: m.id };
        }
      }
    }
    return null;
  }

  private findManzanaInside(latlng: L.LatLng): ManzanaIndex | null {
    const { lat, lng } = latlng;
    for (const mc of this.rendering.getManzanaIndex()) {
      if (lat < mc.bbox.minLat || lat > mc.bbox.maxLat || lng < mc.bbox.minLng || lng > mc.bbox.maxLng) {
        continue;
      }
      const rings = mc.polygon.getLatLngs();
      const outer = rings[0] as L.LatLng[];
      if (outer && pointInPolygon(latlng, outer)) {
        return mc;
      }
    }
    return null;
  }

  private findNearestManzana(latlng: L.LatLng): ManzanaIndex | null {
    const inside = this.findManzanaInside(latlng);
    if (inside) return inside;

    const map = this.rendering.getMap();
    if (!map) return null;

    const clickPt = map.latLngToContainerPoint(latlng);
    let best: ManzanaIndex | null = null;
    let bestDist = Infinity;

    for (const mc of this.rendering.getManzanaIndex()) {
      const { minLat, maxLat, minLng, maxLng } = mc.bbox;
      const clampLat = Math.max(minLat, Math.min(latlng.lat, maxLat));
      const clampLng = Math.max(minLng, Math.min(latlng.lng, maxLng));
      const bboxDx = (latlng.lat - clampLat) * 111000;
      const bboxDy = (latlng.lng - clampLng) * 111000 * Math.cos((latlng.lat * Math.PI) / 180);
      const bboxDist = Math.sqrt(bboxDx * bboxDx + bboxDy * bboxDy);
      if (bboxDist >= bestDist) continue;

      const rings = mc.polygon.getLatLngs();
      const outer = rings[0] as L.LatLng[];
      if (!outer) continue;

      for (let i = 0; i < outer.length; i++) {
        const a = outer[i];
        const b = outer[(i + 1) % outer.length];
        const proj = projectOnSegment(latlng, a, b, map);
        const projPt = map.latLngToContainerPoint(proj);
        const d = clickPt.distanceTo(projPt);
        if (d < bestDist) {
          bestDist = d;
          best = mc;
        }
      }
    }

    return best;
  }
}
