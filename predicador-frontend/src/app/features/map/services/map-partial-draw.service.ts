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
    this.removePartialPolygon(map);
    this.removePartialMarkers(map);
  }

  private removePartialPolygon(map: L.Map | null): void {
    if (this.poligonoParcial && map) {
      map.removeLayer(this.poligonoParcial);
      this.poligonoParcial = null;
    }
  }

  private removePartialMarkers(map: L.Map | null): void {
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
    this.createPartialPolygonIfValid(latlngs, currentTerritoryColor);
    this.agregarMarkersParciales(puntos, onMarkerDrag);
  }

  private createPartialPolygonIfValid(latlngs: L.LatLng[], color: string): void {
    const map = this.engine.getMap();
    if (!map) return;
    this.createPolygonFromLatLngs(latlngs, color, map);
  }

  updatePartialPolygonLatLngs(latlngs: L.LatLngExpression[], currentTerritoryColor: string): void {
    const map = this.engine.getMap();
    if (!map) return;

    if (this.poligonoParcial) {
      this.updateExistingPolygon(latlngs, map);
    } else {
      this.createNewPolygonIfValid(latlngs, currentTerritoryColor, map);
    }
  }

  private updateExistingPolygon(latlngs: L.LatLngExpression[], map: L.Map): void {
    if (latlngs.length >= 2) {
      this.poligonoParcial!.setLatLngs(latlngs);
    } else {
      map.removeLayer(this.poligonoParcial!);
      this.poligonoParcial = null;
    }
  }

  private createNewPolygonIfValid(latlngs: L.LatLngExpression[], color: string, map: L.Map): void {
    this.createPolygonFromLatLngs(latlngs, color, map);
  }

  private createPolygonFromLatLngs(latlngs: L.LatLngExpression[], color: string, map: L.Map): void {
    if (latlngs.length < 2) return;
    const fillColor = color || '#22c55e';
    const polygon = L.polygon(latlngs, {
      color: fillColor,
      fillColor,
      fillOpacity: STYLE_DEFAULTS.partialPolygon.fillOpacity,
      weight: STYLE_DEFAULTS.partialPolygon.weight,
      dashArray: latlngs.length < 3 ? STYLE_DEFAULTS.partialPolygon.dashArray : undefined,
    }).addTo(map);
    this.poligonoParcial = polygon;
  }

  destroy(): void {
    this.limpiarCapasParciales();
  }

  private buildContourPolygon(puntos: SnappedPoint[], manzanaEdges: Edge[]): L.LatLng[] {
    const map = this.engine.getMap();
    if (!map || puntos.length === 0) return [];
    if (puntos.length === 1) return [puntos[0].latlng];

    const result: L.LatLng[] = [];
    this.traceAllSegments(puntos, manzanaEdges, map, result);

    if (result.length >= 3 && manzanaEdges.length >= 3) {
      const clipped = this.clipPolygonToManzana(result, manzanaEdges);
      if (clipped.length >= 3) return clipped;
    }

    return result;
  }

  private traceAllSegments(
    puntos: SnappedPoint[],
    manzanaEdges: Edge[],
    map: L.Map,
    result: L.LatLng[]
  ): void {
    for (let i = 0; i < puntos.length - 1; i++) {
      const segment = traceContourBetween(puntos[i], puntos[i + 1], manzanaEdges, map);
      this.addUniquePoints(segment, map, result);
    }
  }

  private addUniquePoints(segment: L.LatLng[], map: L.Map, result: L.LatLng[]): void {
    for (const point of segment) {
      if (result.length === 0 || latLngDist(result.at(-1)!, point, map) > 1) {
        result.push(point);
      }
    }
  }

  private clipPolygonToManzana(polygon: L.LatLng[], manzanaEdges: Edge[]): L.LatLng[] {
    try {
      const subject = this.buildSubjectRing(polygon);
      const manzanaRing = this.buildManzanaRing(manzanaEdges);

      if (subject.length < 4 || manzanaRing.length < 4) return polygon;

      const intersection = polygonClipping.intersection([subject], [manzanaRing]);
      return this.extractClippedResult(intersection, polygon);
    } catch {
      return polygon;
    }
  }

  private buildSubjectRing(polygon: L.LatLng[]): [number, number][] {
    const subject: [number, number][] = polygon.map(p => [p.lng, p.lat]);
    if (subject.length > 0 && !this.isRingClosed(subject)) {
      subject.push([subject[0][0], subject[0][1]]);
    }
    return subject;
  }

  private buildManzanaRing(manzanaEdges: Edge[]): [number, number][] {
    const manzanaRing: [number, number][] = manzanaEdges.map(e => [e.from.lng, e.from.lat]);
    if (manzanaRing.length > 0) {
      manzanaRing.push([manzanaRing[0][0], manzanaRing[0][1]]);
    }
    return manzanaRing;
  }

  private isRingClosed(ring: [number, number][]): boolean {
    if (ring.length === 0) return false;
    const first = ring[0];
    const last = ring.at(-1)!;
    return first[0] === last[0] && first[1] === last[1];
  }

  private extractClippedResult(intersection: polygonClipping.Polygon[], fallback: L.LatLng[]): L.LatLng[] {
    if (!intersection || intersection.length === 0) return fallback;

    const outerRing = intersection[0][0];
    if (!outerRing || outerRing.length < 3) return fallback;

    return outerRing.map(([lng, lat]) => ({ lat, lng } as L.LatLng));
  }

  private agregarMarkersParciales(puntos: SnappedPoint[], onMarkerDrag: (index: number, marker: L.Marker) => void): void {
    const map = this.engine.getMap();
    if (!map) return;

    const icon = this.createMarkerIcon();
    const markers: L.Layer[] = [];

    for (let i = 0; i < puntos.length; i++) {
      const marker = this.createDraggableMarker(puntos[i].latlng, icon, map, i, onMarkerDrag);
      markers.push(marker);
    }

    this.markersParciales = markers;
  }

  private createMarkerIcon(): L.DivIcon {
    return L.divIcon({
      className: STYLE_DEFAULTS.partialPoint.className,
      html: '<div class="partial-dot"></div>',
      iconSize: [...STYLE_DEFAULTS.partialPoint.iconSize],
      iconAnchor: [...STYLE_DEFAULTS.partialPoint.iconAnchor],
    });
  }

  private createDraggableMarker(
    latlng: L.LatLng,
    icon: L.DivIcon,
    map: L.Map,
    idx: number,
    onMarkerDrag: (index: number, marker: L.Marker) => void
  ): L.Marker {
    const m = L.marker(latlng, { icon, draggable: true }).addTo(map);
    m.on('drag', () => onMarkerDrag(idx, m));
    return m;
  }
}
