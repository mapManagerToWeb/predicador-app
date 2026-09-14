import { Injectable, inject } from '@angular/core';
import { Polygon, Marker, DivIcon, LatLng, type Map as LeafletMap, type LatLngExpression } from 'leaflet';
import { STYLE_DEFAULTS } from '../utils/map-constants';
import { latLngDist, traceContourBetween } from '../map-geometry';
import polygonClipping from 'polygon-clipping';
import { MapEngineService } from './map-engine.service';
import { getPartialPolygonStyle } from './map-style.service';
import type { SnappedPoint, Edge } from '../map-geometry';

/**
 * Manages partial polygon drawing: points, markers, contour tracing,
 * and clipping within the parent manzana.
 */
@Injectable({ providedIn: 'root' })
export class MapPartialDrawService {
  private engine = inject(MapEngineService);
  private poligonoParcial: Polygon | null = null;
  private markersParciales: Marker[] = [];
  private dragRaf = 0;
  private pendingDrag: { index: number; marker: Marker } | null = null;

  getPoligonoParcial(): Polygon | null {
    return this.poligonoParcial;
  }

  clearPoligonoParcialRef(): void {
    this.poligonoParcial = null;
  }

  limpiarCapasParciales(): void {
    this.cancelPendingDrag();
    const map = this.engine.getMap();
    this.removePartialPolygon(map);
    this.removePartialMarkers(map);
  }

  private removePartialPolygon(map: LeafletMap | null): void {
    if (this.poligonoParcial && map) {
      map.removeLayer(this.poligonoParcial);
      this.poligonoParcial = null;
    }
  }

  private removePartialMarkers(map: LeafletMap | null): void {
    for (const m of this.markersParciales) {
      map?.removeLayer(m);
    }
    this.markersParciales = [];
  }

  redibujarParcial(
    puntos: SnappedPoint[],
    currentTerritoryColor: string,
    manzanaEdges: Edge[],
    onMarkerDrag: (index: number, marker: Marker) => void
  ): void {
    this.limpiarCapasParciales();

    const latlngs = this.buildContourPolygon(puntos, manzanaEdges);
    this.createPartialPolygonIfValid(latlngs, currentTerritoryColor);
    this.agregarMarkersParciales(puntos, onMarkerDrag);
  }

  /**
   * Actualiza el dibujo parcial durante el arrastre de un marker SIN destruir ni
   * recrear ninguna capa. Recorre el contorno de nuevo y mueve el polígono con
   * setLatLngs y el marker arrastrado con setLatLng. Esto elimina el churn de
   * teardown/recreate por frame que era la principal fuente de jank en móvil.
   *
   * <p>La llamada llega ya throttled por rAF desde el handler de drag, así que
   * nunca se ejecuta más de una vez por frame.</p>
   */
  actualizarParcialEnDrag(
    puntos: SnappedPoint[],
    currentTerritoryColor: string,
    manzanaEdges: Edge[],
    index: number,
    marker: Marker
  ): void {
    const map = this.engine.getMap();
    if (!map) return;

    const snapped = puntos[index];
    if (snapped) marker.setLatLng(snapped.latlng);

    const latlngs = this.buildContourPolygon(puntos, manzanaEdges);
    this.updatePartialPolygonLatLngs(latlngs, currentTerritoryColor);
  }

  private scheduleMarkerDrag(
    index: number,
    marker: Marker,
    onMarkerDrag: (index: number, marker: Marker) => void
  ): void {
    this.pendingDrag = { index, marker };
    if (this.dragRaf === 0) {
      this.dragRaf = requestAnimationFrame(() => {
        this.dragRaf = 0;
        const pending = this.pendingDrag;
        this.pendingDrag = null;
        if (pending) onMarkerDrag(pending.index, pending.marker);
      });
    }
  }

  private cancelPendingDrag(): void {
    if (this.dragRaf !== 0) {
      cancelAnimationFrame(this.dragRaf);
      this.dragRaf = 0;
    }
    this.pendingDrag = null;
  }

  private createPartialPolygonIfValid(latlngs: LatLng[], color: string): void {
    const map = this.engine.getMap();
    if (!map) return;
    this.createPolygonFromLatLngs(latlngs, color, map);
  }

  updatePartialPolygonLatLngs(latlngs: LatLngExpression[], currentTerritoryColor: string): void {
    const map = this.engine.getMap();
    if (!map) return;

    if (this.poligonoParcial) {
      this.updateExistingPolygon(latlngs, map);
    } else {
      this.createNewPolygonIfValid(latlngs, currentTerritoryColor, map);
    }
  }

  private updateExistingPolygon(latlngs: LatLngExpression[], map: LeafletMap): void {
    if (latlngs.length >= 2) {
      this.poligonoParcial!.setLatLngs(latlngs);
    } else {
      map.removeLayer(this.poligonoParcial!);
      this.poligonoParcial = null;
    }
  }

  private createNewPolygonIfValid(latlngs: LatLngExpression[], color: string, map: LeafletMap): void {
    this.createPolygonFromLatLngs(latlngs, color, map);
  }

  private createPolygonFromLatLngs(latlngs: LatLngExpression[], color: string, map: LeafletMap): void {
    if (latlngs.length < 2) return;
    const fillColor = color || '#22c55e';
    const polygon = new Polygon(latlngs, getPartialPolygonStyle(fillColor, latlngs.length < 3)).addTo(map);
    this.poligonoParcial = polygon;
  }

  destroy(): void {
    this.limpiarCapasParciales();
  }

  private buildContourPolygon(puntos: SnappedPoint[], manzanaEdges: Edge[]): LatLng[] {
    const map = this.engine.getMap();
    if (!map || puntos.length === 0) return [];
    if (puntos.length === 1) return [puntos[0].latlng];

    const result: LatLng[] = [];
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
    map: LeafletMap,
    result: LatLng[]
  ): void {
    for (let i = 0; i < puntos.length - 1; i++) {
      const segment = traceContourBetween(puntos[i], puntos[i + 1], manzanaEdges, map);
      this.addUniquePoints(segment, map, result);
    }
  }

  private addUniquePoints(segment: LatLng[], map: LeafletMap, result: LatLng[]): void {
    for (const point of segment) {
      if (result.length === 0 || latLngDist(result.at(-1)!, point, map) > 1) {
        result.push(point);
      }
    }
  }

  private clipPolygonToManzana(polygon: LatLng[], manzanaEdges: Edge[]): LatLng[] {
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

  private buildSubjectRing(polygon: LatLng[]): [number, number][] {
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

  private extractClippedResult(intersection: polygonClipping.Polygon[], fallback: LatLng[]): LatLng[] {
    if (!intersection || intersection.length === 0) return fallback;

    const outerRing = intersection[0][0];
    if (!outerRing || outerRing.length < 3) return fallback;

    return outerRing.map(([lng, lat]) => new LatLng(lat, lng));
  }

  private agregarMarkersParciales(puntos: SnappedPoint[], onMarkerDrag: (index: number, marker: Marker) => void): void {
    const map = this.engine.getMap();
    if (!map) return;

    const icon = this.createMarkerIcon();
    const markers: Marker[] = [];

    for (let i = 0; i < puntos.length; i++) {
      const marker = this.createDraggableMarker(puntos[i].latlng, icon, map, i, onMarkerDrag);
      markers.push(marker);
    }

    this.markersParciales = markers;
  }

  private createMarkerIcon(): DivIcon {
    return new DivIcon({
      className: STYLE_DEFAULTS.partialPoint.className,
      html: '<div class="partial-dot"></div>',
      iconSize: [...STYLE_DEFAULTS.partialPoint.iconSize],
      iconAnchor: [...STYLE_DEFAULTS.partialPoint.iconAnchor],
    });
  }

  private createDraggableMarker(
    latlng: LatLng,
    icon: DivIcon,
    map: LeafletMap,
    idx: number,
    onMarkerDrag: (index: number, marker: Marker) => void
  ): Marker {
    const m = new Marker(latlng, { icon, draggable: true }).addTo(map);
    m.on('drag', () => this.scheduleMarkerDrag(idx, m, onMarkerDrag));
    return m;
  }
}
