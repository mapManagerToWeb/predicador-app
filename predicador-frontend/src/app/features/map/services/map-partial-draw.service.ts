import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import { STYLE_DEFAULTS } from '../utils/map-constants';
import { latLngDist, traceContourBetween } from '../map-geometry';
import polygonClipping from 'polygon-clipping';
import { MapEngineService } from './map-engine.service';
import type { SnappedPoint, Edge } from '../map-geometry';

/**
 * Manages partial polygon drawing: points, markers, contour tracing,
 * and clipping within the parent manzana.
 */
@Injectable({ providedIn: 'root' })
export class MapPartialDrawService {
  private engine = inject(MapEngineService);
  private poligonoParcial: L.Polygon | null = null;
  private markersParciales: L.Layer[] = [];

  getPoligonoParcial(): L.Polygon | null {
    return this.poligonoParcial;
  }

  clearPoligonoParcialRef(): void {
    this.poligonoParcial = null;
  }

  limpiarCapasParciales(): void {
    const map = this.engine.getMap();
    if (this.poligonoParcial && map) {
      map.removeLayer(this.poligonoParcial);
      this.poligonoParcial = null;
    }
    for (const m of this.markersParciales) {
      map?.removeLayer(m);
    }
    this.markersParciales = [];
  }

  redibujarParcial(
    puntos: SnappedPoint[],
    currentTerritoryColor: string,
    manzanaEdges: Edge[],
    onMarkerDrag: (index: number, marker: L.Marker) => void
  ): void {
    this.limpiarCapasParciales();

    const latlngs = this.buildContourPolygon(puntos, manzanaEdges);

    if (latlngs.length >= 2) {
      const color = currentTerritoryColor || '#22c55e';
      const polygon = L.polygon(latlngs, {
        color,
        fillColor: color,
        fillOpacity: STYLE_DEFAULTS.partialPolygon.fillOpacity,
        weight: STYLE_DEFAULTS.partialPolygon.weight,
        dashArray: latlngs.length < 3 ? STYLE_DEFAULTS.partialPolygon.dashArray : undefined,
      }).addTo(this.engine.getMap()!);
      this.poligonoParcial = polygon;
    }

    this.agregarMarkersParciales(puntos, onMarkerDrag);
  }

  updatePartialPolygonLatLngs(latlngs: L.LatLngExpression[], currentTerritoryColor: string): void {
    const map = this.engine.getMap();
    if (!map) return;

    if (this.poligonoParcial) {
      if (latlngs.length >= 2) {
        this.poligonoParcial.setLatLngs(latlngs);
      } else {
        map.removeLayer(this.poligonoParcial);
        this.poligonoParcial = null;
      }
    } else if (latlngs.length >= 2) {
      const color = currentTerritoryColor || '#22c55e';
      const polygon = L.polygon(latlngs, {
        color,
        fillColor: color,
        fillOpacity: STYLE_DEFAULTS.partialPolygon.fillOpacity,
        weight: STYLE_DEFAULTS.partialPolygon.weight,
        dashArray: latlngs.length < 3 ? STYLE_DEFAULTS.partialPolygon.dashArray : undefined,
      }).addTo(map);
      this.poligonoParcial = polygon;
    }
  }

  destroy(): void {
    this.limpiarCapasParciales();
  }

  private buildContourPolygon(puntos: SnappedPoint[], manzanaEdges: Edge[]): L.LatLng[] {
    const map = this.engine.getMap();
    if (!map || puntos.length === 0) return [];
    if (puntos.length === 1) return [puntos[0].latlng];

    const result: L.LatLng[] = [];
    for (let i = 0; i < puntos.length - 1; i++) {
      const segment = traceContourBetween(puntos[i], puntos[i + 1], manzanaEdges, map);
      for (let j = 0; j < segment.length; j++) {
        if (result.length === 0) {
          result.push(segment[j]);
        } else {
          const last = result[result.length - 1];
          if (latLngDist(last, segment[j], map) > 1) {
            result.push(segment[j]);
          }
        }
      }
    }

    if (result.length >= 3 && manzanaEdges.length >= 3) {
      const clipped = this.clipPolygonToManzana(result, manzanaEdges);
      if (clipped.length >= 3) {
        return clipped;
      }
    }

    return result;
  }

  private clipPolygonToManzana(polygon: L.LatLng[], manzanaEdges: Edge[]): L.LatLng[] {
    try {
      const subject: [number, number][] = polygon.map(p => [p.lng, p.lat]);
      if (subject.length > 0 && (subject[0][0] !== subject[subject.length - 1][0] ||
          subject[0][1] !== subject[subject.length - 1][1])) {
        subject.push([subject[0][0], subject[0][1]]);
      }

      const manzanaRing: [number, number][] = [];
      for (const edge of manzanaEdges) {
        manzanaRing.push([edge.from.lng, edge.from.lat]);
      }
      if (manzanaRing.length > 0) {
        manzanaRing.push([manzanaRing[0][0], manzanaRing[0][1]]);
      }

      if (subject.length < 4 || manzanaRing.length < 4) return polygon;

      const intersection = polygonClipping.intersection([subject], [manzanaRing]);
      if (!intersection || intersection.length === 0) return polygon;

      const outerRing = intersection[0][0];
      if (!outerRing || outerRing.length < 3) return polygon;

      return outerRing.map(([lng, lat]) => ({ lat, lng } as L.LatLng));
    } catch {
      return polygon;
    }
  }

  private agregarMarkersParciales(puntos: SnappedPoint[], onMarkerDrag: (index: number, marker: L.Marker) => void): void {
    const map = this.engine.getMap();
    if (!map) return;

    const icon = L.divIcon({
      className: STYLE_DEFAULTS.partialPoint.className,
      html: '<div class="partial-dot"></div>',
      iconSize: [...STYLE_DEFAULTS.partialPoint.iconSize],
      iconAnchor: [...STYLE_DEFAULTS.partialPoint.iconAnchor],
    });

    const markers: L.Layer[] = [];
    for (let i = 0; i < puntos.length; i++) {
      const m = L.marker(puntos[i].latlng, { icon, draggable: true }).addTo(map);
      const idx = i;
      m.on('drag', () => onMarkerDrag(idx, m));
      markers.push(m);
    }
    this.markersParciales = markers;
  }
}
