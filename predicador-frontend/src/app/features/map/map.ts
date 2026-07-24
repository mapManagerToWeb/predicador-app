import { Component, OnDestroy, signal, computed, inject, afterNextRender } from '@angular/core';
import * as L from 'leaflet';
import { TerritorioService } from '../../core/services/territorio';
import { Profile } from '../../core/services/profile';
import { Toast } from '../../core/services/toast';
import { TerritorySearch } from './territory-search/territory-search';

type ModoMarcado = 'none' | 'completa' | 'parcial';

interface ManzanaMarcada {
  id: string;
  nombreBloque: string;
  layer: L.Path;
  territorioNumero: number;
}

interface FeatureLayer {
  territorioPadre: number;
  color: string;
  layer: L.GeoJSON;
  centroidMarkers: L.Marker[];
}

interface ManzanaIndex {
  polygon: L.Polygon;
  id: string;
  nombreBloque: string;
  color: string;
  territorioNumero: number;
}

interface SnappedPoint {
  latlng: L.LatLng;
  edgeIdx: number;
  t: number;
}

interface Edge {
  from: L.LatLng;
  to: L.LatLng;
}

const SNAP_THRESHOLD_PX = 50;
const DEDUP_THRESHOLD_PX = 2;
const CAPTURE_DELAY_MS = 400;
const MAX_PUNTOS_PARCIAL = 6;

@Component({
  selector: 'app-map',
  imports: [TerritorySearch],
  templateUrl: './map.html',
  styleUrl: './map.css'
})
export class MapPage implements OnDestroy {
  private territorioService = inject(TerritorioService);
  private profileService = inject(Profile);
  private toastService = inject(Toast);
  private map!: L.Map;
  private allTerritoriesLayer: FeatureLayer[] = [];
  private manzanaIndex: ManzanaIndex[] = [];
  private currentTerritoryColor = '';

  manzanasMarcadas = signal<ManzanaMarcada[]>([]);
  manzanasCount = computed(() => this.manzanasMarcadas().length);
  totalManzanas = signal(0);
  territorioSeleccionado = signal<number | null>(null);
  tieneTerritorio = computed(() => this.territorioSeleccionado() !== null);

  modoMarcado = signal<ModoMarcado>('none');
  puntosParciales = signal<SnappedPoint[]>([]);
  puntosCount = computed(() => this.puntosParciales().length);
  puedeConfirmar = computed(() => this.puntosCount() >= 3);

  private poligonoParcial: L.Polygon | null = null;
  private markersParciales: L.Layer[] = [];
  private extraLayers: L.Layer[] = [];
  private datosParcialesGuardados: { puntos: SnappedPoint[]; geometria: string } | null = null;
  private manzanaSeleccionada: L.Polygon | null = null;
  private manzanaSeleccionadaColor = '';
  private manzanaSeleccionadaNombre = '';
  private manzanaEdges: Edge[] = [];

  constructor() {
    afterNextRender(() => {
      this.initMap();
    });
  }

  private initMap(): void {
    this.map = L.map('map', {
      preferCanvas: true,
      zoomControl: false
    }).setView([-37.4779, -73.345], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap'
    }).addTo(this.map);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    this.map.on('click', (e: L.LeafletMouseEvent) => this.onMapClick(e));

    this.loadAllTerritories();
  }

  private async loadAllTerritories(): Promise<void> {
    try {
      for (const fl of this.allTerritoriesLayer) {
        fl.layer.remove();
        fl.centroidMarkers.forEach(m => m.remove());
      }
      this.allTerritoriesLayer = [];
      this.manzanaIndex = [];

      const geoJsonText = await this.territorioService.getAllGeoJson();
      const geoJson = JSON.parse(geoJsonText) as GeoJSON.FeatureCollection;

      const byTerritorio = new Map<number, GeoJSON.Feature[]>();
      for (const feature of geoJson.features) {
        const num = feature.properties?.['territorio_padre'];
        if (num) {
          if (!byTerritorio.has(num)) byTerritorio.set(num, []);
          byTerritorio.get(num)!.push(feature);
        }
      }

      for (const [territorioNum, features] of byTerritorio) {
        const rawColor = features[0]?.properties?.['color'] || '#3b82f6';
        const color = /^#[0-9a-fA-F]{3,8}$/.test(rawColor) ? rawColor : '#3b82f6';

        const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };

        const layer = L.geoJSON(fc, {
          style: () => ({
            fillColor: color,
            fillOpacity: 0,
            color: color,
            weight: 2
          }),
          onEachFeature: (feature, l) => {
            if (l instanceof L.Polygon) {
              const id = String(feature.properties?.['id'] ?? '');
              const nombreBloque = String(feature.properties?.['nombre_bloque'] ?? '');

              this.manzanaIndex.push({ polygon: l, id, nombreBloque, color, territorioNumero: territorioNum });

              l.on('click', (e) => {
                if (this.modoMarcado() === 'completa') {
                  L.DomEvent.stop(e);
                  this.toggleManzana(id, nombreBloque, l, color, territorioNum);
                }
              });
            }
          }
        });

        layer.addTo(this.map);

        const centroidMarkers = this.crearMarcadoresCentroide(fc, color, territorioNum);

        this.allTerritoriesLayer.push({
          territorioPadre: territorioNum,
          color,
          layer,
          centroidMarkers
        });
      }
    } catch (e) {
      console.error('Error al cargar territorios', e);
      this.toastService.show('Error al cargar los territorios');
    }
  }

  async onTerritorioSeleccionado(numero: number): Promise<void> {
    this.limpiarMarcas();
    this.territorioSeleccionado.set(numero);

    const featureLayer = this.allTerritoriesLayer.find(f => f.territorioPadre === numero);
    if (!featureLayer) {
      this.toastService.show('Territorio no encontrado');
      return;
    }

    this.currentTerritoryColor = featureLayer.color;

    let manzanaCount = 0;
    featureLayer.layer.eachLayer(l => {
      if (l instanceof L.Path) {
        l.setStyle({ fillOpacity: 0, weight: 2 });
        manzanaCount++;
      }
    });
    this.totalManzanas.set(manzanaCount);

    const bounds = featureLayer.layer.getBounds();
    if (bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [30, 30] });
    }

    await this.restaurarMarcadoDesdeDB(numero);
  }

  private async restaurarMarcadoDesdeDB(territorioNumero: number): Promise<void> {
    try {
      const reportes = await this.territorioService.getReportesPorTerritorio(territorioNumero);
      if (reportes.length === 0) return;

      const ultimo = reportes[0];
      const color = this.currentTerritoryColor;

      const ids = ultimo.manzanasIds ? ultimo.manzanasIds.split(',').filter(Boolean) : [];

      for (const mc of this.manzanaIndex) {
        if (mc.territorioNumero !== territorioNumero) continue;
        if (ids.includes(mc.id)) {
          mc.polygon.setStyle({ fillColor: color, fillOpacity: 0.4, color, weight: 3 });
          this.manzanasMarcadas.update(current => [
            ...current,
            { id: mc.id, nombreBloque: mc.nombreBloque, layer: mc.polygon as unknown as L.Path, territorioNumero }
          ]);
        }
      }

      if (ultimo.geometriaParcial) {
        try {
          const geometry = JSON.parse(ultimo.geometriaParcial) as GeoJSON.Geometry;
          let latlngs: L.LatLngExpression[] = [];

          if (geometry.type === 'Polygon') {
            latlngs = (geometry as GeoJSON.Polygon).coordinates[0].map(
              c => L.latLng(c[1], c[0])
            );
          } else if (geometry.type === 'MultiPolygon') {
            latlngs = (geometry as GeoJSON.MultiPolygon).coordinates[0][0].map(
              c => L.latLng(c[1], c[0])
            );
          }

          if (latlngs.length > 0) {
            const parcialId = `parcial-${Date.now()}`;
            const polygon = L.polygon(latlngs, {
              fillColor: color,
              fillOpacity: 0.4,
              color,
              weight: 3,
              dashArray: '8, 8'
            }).addTo(this.map);

            this.extraLayers.push(polygon);

            this.manzanasMarcadas.update(current => [
              ...current,
              { id: parcialId, nombreBloque: 'Zona parcial', layer: polygon as unknown as L.Path, territorioNumero }
            ]);

            if (ultimo.puntosParciales) {
              try {
                const puntos = JSON.parse(ultimo.puntosParciales) as Array<{ lat: number; lng: number }>;
                puntos.forEach(p => {
                  const marker = L.circleMarker(L.latLng(p.lat, p.lng), {
                    radius: 5,
                    fillColor: color,
                    fillOpacity: 1,
                    color: '#fff',
                    weight: 2
                  }).addTo(this.map);
                  this.markersParciales.push(marker);
                });
              } catch { /* ignore parse errors */ }
            }
          }
        } catch { /* ignore parse errors */ }
      }
    } catch (e) {
      console.error('Error al restaurar marcado', e);
      this.toastService.show('Error al restaurar el marcado anterior');
    }
  }

  private crearMarcadoresCentroide(geoJson: GeoJSON.FeatureCollection, color: string, territorioNum: number): L.Marker[] {
    const polygonCentroids: L.LatLng[] = [];

    for (const feature of geoJson.features) {
      if (feature.geometry.type === 'Polygon') {
        const coords = feature.geometry.coordinates[0];
        let sumLat = 0;
        let sumLng = 0;
        for (const coord of coords) {
          sumLng += coord[0];
          sumLat += coord[1];
        }
        polygonCentroids.push(L.latLng(sumLat / coords.length, sumLng / coords.length));
      }
    }

    if (polygonCentroids.length === 0) return [];

    const lat = polygonCentroids.reduce((s, c) => s + c.lat, 0) / polygonCentroids.length;
    const lng = polygonCentroids.reduce((s, c) => s + c.lng, 0) / polygonCentroids.length;

    const safeNum = String(territorioNum).replace(/\D/g, '');

    const icon = L.divIcon({
      className: 'centroid-label',
      html: `<div class="centroid-dot" style="background:${color}">${safeNum}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([lat, lng], { icon, interactive: true }).addTo(this.map);

    marker.on('click', () => {
      this.onTerritorioSeleccionado(territorioNum);
    });

    return [marker];
  }

  // ─── CLICK DISPATCH ───────────────────────────────────

  private onMapClick(e: L.LeafletMouseEvent): void {
    const modo = this.modoMarcado();

    if (modo === 'completa') {
      const hit = this.findManzanaInside(e.latlng);
      if (hit) {
        this.toggleManzana(hit.id, hit.nombreBloque, hit.polygon, hit.color, hit.territorioNumero);
      }
      return;
    }

    if (modo === 'parcial') {
      if (!this.manzanaSeleccionada) {
        const hit = this.findNearestManzana(e.latlng);
        if (hit) {
          this.seleccionarManzana(hit.polygon, hit.color, hit.nombreBloque);
        } else {
          this.toastService.show('No se encontró una manzana cerca');
          return;
        }
      }

      if (this.puntosCount() >= MAX_PUNTOS_PARCIAL) {
        this.toastService.show(`Máximo ${MAX_PUNTOS_PARCIAL} puntos`);
        return;
      }

      const snapped = this.snapToContour(e.latlng);
      this.agregarPunto(snapped);
    }
  }

  // ─── POINT-IN-POLYGON ─────────────────────────────────

  private findManzanaInside(latlng: L.LatLng): ManzanaIndex | null {
    for (const mc of this.manzanaIndex) {
      const rings = mc.polygon.getLatLngs();
      const outer = rings[0] as L.LatLng[];
      if (outer && this.pointInPolygon(latlng, outer)) {
        return mc;
      }
    }
    return null;
  }

  private findNearestManzana(latlng: L.LatLng): ManzanaIndex | null {
    const inside = this.findManzanaInside(latlng);
    if (inside) return inside;

    const clickPt = this.map.latLngToContainerPoint(latlng);
    let best: ManzanaIndex | null = null;
    let bestDist = Infinity;

    for (const mc of this.manzanaIndex) {
      const rings = mc.polygon.getLatLngs();
      const outer = rings[0] as L.LatLng[];
      if (!outer) continue;

      for (let i = 0; i < outer.length; i++) {
        const a = outer[i];
        const b = outer[(i + 1) % outer.length];
        const proj = this.projectOnSegment(latlng, a, b);
        const projPt = this.map.latLngToContainerPoint(proj);
        const d = clickPt.distanceTo(projPt);
        if (d < bestDist) {
          bestDist = d;
          best = mc;
        }
      }
    }

    return best;
  }

  private pointInPolygon(point: L.LatLng, polygon: L.LatLng[]): boolean {
    const x = point.lat;
    const y = point.lng;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lat;
      const yi = polygon[i].lng;
      const xj = polygon[j].lat;
      const yj = polygon[j].lng;

      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }

    return inside;
  }

  // ─── MODO ─────────────────────────────────────────────

  setModoMarcado(modo: ModoMarcado): void {
    this.limpiarParcial();
    this.modoMarcado.set(modo);

    if (modo === 'parcial') {
      this.toastService.show('Tocá en cualquier parte del mapa');
    }
  }

  // ─── SELECCIÓN DE MANZANA ─────────────────────────────

  private seleccionarManzana(polygon: L.Polygon, color: string, nombreBloque: string): void {
    this.restaurarManzanaAnterior();

    this.manzanaSeleccionada = polygon;
    this.manzanaSeleccionadaColor = color;
    this.manzanaSeleccionadaNombre = nombreBloque;

    const rings = polygon.getLatLngs();
    const outer = rings[0] as L.LatLng[];
    this.manzanaEdges = [];
    if (outer && outer.length >= 3) {
      for (let i = 0; i < outer.length - 1; i++) {
        this.manzanaEdges.push({ from: outer[i], to: outer[i + 1] });
      }
      this.manzanaEdges.push({ from: outer[outer.length - 1], to: outer[0] });
    }

    polygon.setStyle({
      color: '#facc15',
      fillColor: '#facc15',
      fillOpacity: 0.15,
      weight: 4
    });

    this.toastService.show(`Manzana "${nombreBloque}" — tocá para colocar puntos`);
  }

  private restaurarManzanaAnterior(): void {
    if (this.manzanaSeleccionada) {
      this.manzanaSeleccionada.setStyle({
        color: this.manzanaSeleccionadaColor,
        fillColor: this.manzanaSeleccionadaColor,
        fillOpacity: 0,
        weight: 2
      });
      this.manzanaSeleccionada = null;
      this.manzanaSeleccionadaNombre = '';
      this.manzanaEdges = [];
    }
  }

  // ─── SNAP TO CONTOUR ──────────────────────────────────

  private snapToContour(latlng: L.LatLng): SnappedPoint {
    const fallback: SnappedPoint = { latlng, edgeIdx: -1, t: 0 };
    if (!this.manzanaSeleccionada) return fallback;

    const edges = this.manzanaEdges;
    if (edges.length === 0) return fallback;

    const clickPt = this.map.latLngToContainerPoint(latlng);
    let bestPoint: L.LatLng = latlng;
    let bestEdgeIdx = -1;
    let bestT = 0;
    let bestDist = Infinity;

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const projected = this.projectOnSegment(latlng, edge.from, edge.to);
      const projPt = this.map.latLngToContainerPoint(projected);
      const d = clickPt.distanceTo(projPt);

      if (d < bestDist) {
        bestDist = d;
        bestPoint = projected;
        bestEdgeIdx = i;
        bestT = this.computeT(latlng, edge.from, edge.to);
      }
    }

    if (bestDist <= SNAP_THRESHOLD_PX) {
      return { latlng: bestPoint, edgeIdx: bestEdgeIdx, t: bestT };
    }
    return { latlng, edgeIdx: -1, t: 0 };
  }

  private computeT(point: L.LatLng, a: L.LatLng, b: L.LatLng): number {
    const p = this.map.latLngToContainerPoint(point);
    const pa = this.map.latLngToContainerPoint(a);
    const pb = this.map.latLngToContainerPoint(b);

    const abx = pb.x - pa.x;
    const aby = pb.y - pa.y;
    const apx = p.x - pa.x;
    const apy = p.y - pa.y;

    const ab2 = abx * abx + aby * aby;
    if (ab2 === 0) return 0;

    let t = (apx * abx + apy * aby) / ab2;
    return Math.max(0, Math.min(1, t));
  }

  private projectOnSegment(point: L.LatLng, a: L.LatLng, b: L.LatLng): L.LatLng {
    const t = this.computeT(point, a, b);
    return L.latLng(
      a.lat + t * (b.lat - a.lat),
      a.lng + t * (b.lng - a.lng)
    );
  }

  // ─── CONTOUR PATH BETWEEN TWO SNAPPED POINTS ──────────

  private traceContourBetween(a: SnappedPoint, b: SnappedPoint): L.LatLng[] {
    const edges = this.manzanaEdges;
    if (edges.length === 0 || a.edgeIdx < 0 || b.edgeIdx < 0) {
      return [a.latlng, b.latlng];
    }

    const startEdge = edges[a.edgeIdx];
    const endEdge = edges[b.edgeIdx];

    const startLatLng = L.latLng(
      startEdge.from.lat + a.t * (startEdge.to.lat - startEdge.from.lat),
      startEdge.from.lng + a.t * (startEdge.to.lng - startEdge.from.lng)
    );

    const endLatLng = L.latLng(
      endEdge.from.lat + b.t * (endEdge.to.lat - endEdge.from.lat),
      endEdge.from.lng + b.t * (endEdge.to.lng - endEdge.from.lng)
    );

    if (a.edgeIdx === b.edgeIdx) {
      return [startLatLng, endLatLng];
    }

    const n = edges.length;
    const stepsForward = (b.edgeIdx - a.edgeIdx + n) % n;
    const stepsBackward = (a.edgeIdx - b.edgeIdx + n) % n;

    const result: L.LatLng[] = [startLatLng];

    if (stepsForward <= stepsBackward) {
      const nextVertex = edges[a.edgeIdx].to;
      if (this.latLngDist(startLatLng, nextVertex) > 1) {
        result.push(nextVertex);
      }
      for (let step = 1; step < stepsForward; step++) {
        const idx = (a.edgeIdx + step) % n;
        result.push(edges[idx].to);
      }
      if (this.latLngDist(result[result.length - 1], endLatLng) > 1) {
        result.push(endLatLng);
      }
    } else {
      const prevVertex = edges[a.edgeIdx].from;
      if (this.latLngDist(startLatLng, prevVertex) > 1) {
        result.push(prevVertex);
      }
      for (let step = 1; step < stepsBackward; step++) {
        const idx = (a.edgeIdx - step + n) % n;
        result.push(edges[idx].from);
      }
      if (this.latLngDist(result[result.length - 1], endLatLng) > 1) {
        result.push(endLatLng);
      }
    }

    return result;
  }

  private latLngDist(a: L.LatLng, b: L.LatLng): number {
    const pa = this.map.latLngToContainerPoint(a);
    const pb = this.map.latLngToContainerPoint(b);
    return pa.distanceTo(pb);
  }

  // ─── PUNTOS PARCIALES ─────────────────────────────────

  private agregarPunto(punto: SnappedPoint): void {
    const actuales = this.puntosParciales();

    if (actuales.length > 0) {
      const last = actuales[actuales.length - 1];
      if (this.latLngDist(last.latlng, punto.latlng) < DEDUP_THRESHOLD_PX) {
        return;
      }
    }

    this.puntosParciales.set([...actuales, punto]);
    this.redibujarParcial();
  }

  deshacerPunto(): void {
    const actuales = this.puntosParciales();
    if (actuales.length === 0) return;

    this.puntosParciales.set(actuales.slice(0, -1));
    this.redibujarParcial();
  }

  private redibujarParcial(): void {
    this.limpiarCapasParciales();

    const puntos = this.puntosParciales();
    const latlngs = this.buildContourPolygon(puntos);

    if (latlngs.length >= 2) {
      const color = this.currentTerritoryColor || '#22c55e';
      this.poligonoParcial = L.polygon(latlngs, {
        color,
        fillColor: color,
        fillOpacity: 0.35,
        weight: 3,
        dashArray: latlngs.length < 3 ? '8, 8' : undefined
      }).addTo(this.map);
    }

    this.agregarMarkersParciales(puntos);
  }

  private buildContourPolygon(puntos: SnappedPoint[]): L.LatLng[] {
    if (puntos.length === 0) return [];
    if (puntos.length === 1) return [puntos[0].latlng];

    const result: L.LatLng[] = [];
    for (let i = 0; i < puntos.length - 1; i++) {
      const segment = this.traceContourBetween(puntos[i], puntos[i + 1]);
      for (let j = 0; j < segment.length; j++) {
        if (result.length === 0) {
          result.push(segment[j]);
        } else {
          const last = result[result.length - 1];
          if (this.latLngDist(last, segment[j]) > 1) {
            result.push(segment[j]);
          }
        }
      }
    }

    if (result.length >= 3) {
      const last = result[result.length - 1];
      const first = result[0];
      if (this.latLngDist(last, first) < 1) {
        result.pop();
      }
    }

    return result;
  }

  private agregarMarkersParciales(puntos: SnappedPoint[]): void {
    const icon = L.divIcon({
      className: 'partial-point',
      html: '<div class="partial-dot"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    for (let i = 0; i < puntos.length; i++) {
      const m = L.marker(puntos[i].latlng, { icon, draggable: true }).addTo(this.map);
      const idx = i;

      m.on('drag', () => {
        const actualizados = [...this.puntosParciales()];
        const newLatLng = m.getLatLng();
        const snapped = this.snapToContour(newLatLng);
        actualizados[idx] = snapped;
        this.puntosParciales.set(actualizados);

        const latlngs = this.buildContourPolygon(actualizados);
        if (this.poligonoParcial) {
          this.map.removeLayer(this.poligonoParcial);
        }
        if (latlngs.length >= 2) {
          const color = this.currentTerritoryColor || '#22c55e';
          this.poligonoParcial = L.polygon(latlngs, {
            color,
            fillColor: color,
            fillOpacity: 0.35,
            weight: 3,
            dashArray: latlngs.length < 3 ? '8, 8' : undefined
          }).addTo(this.map);
        }
      });

      this.markersParciales.push(m);
    }
  }

  finalizarParcial(): void {
    if (this.puntosCount() < 3) {
      this.toastService.show('Necesitás al menos 3 puntos');
      return;
    }

    const territorio = this.territorioSeleccionado();
    if (!territorio) return;

    const id = `parcial-${Date.now()}`;
    const nombreBloque = this.manzanaSeleccionadaNombre
      ? `Parcial: ${this.manzanaSeleccionadaNombre}`
      : 'Zona parcial';

    if (this.poligonoParcial) {
      const geoJson = this.poligonoParcial.toGeoJSON();
      this.datosParcialesGuardados = {
        puntos: [...this.puntosParciales()],
        geometria: JSON.stringify(geoJson.geometry)
      };

      this.manzanasMarcadas.update(current => [
        ...current,
        { id, nombreBloque, layer: this.poligonoParcial as unknown as L.Path, territorioNumero: territorio }
      ]);
      this.extraLayers.push(this.poligonoParcial);
      this.poligonoParcial = null;
    }

    this.markersParciales.forEach(m => this.map.removeLayer(m));
    this.markersParciales = [];
    this.puntosParciales.set([]);

    this.restaurarManzanaAnterior();
    this.modoMarcado.set('none');
    this.toastService.show('Zona parcial marcada');
  }

  cancelarParcial(): void {
    this.limpiarParcial();
    this.datosParcialesGuardados = null;
    this.restaurarManzanaAnterior();
    this.modoMarcado.set('none');
  }

  private limpiarParcial(): void {
    this.limpiarCapasParciales();
    this.puntosParciales.set([]);
  }

  private limpiarCapasParciales(): void {
    if (this.poligonoParcial) {
      this.map.removeLayer(this.poligonoParcial);
      this.poligonoParcial = null;
    }
    this.markersParciales.forEach(m => this.map.removeLayer(m));
    this.markersParciales = [];
  }

  // ─── MARCAJE COMPLETO ─────────────────────────────────

  private toggleManzana(id: string, nombreBloque: string, layer: L.Path, color: string, territorioNumero: number): void {
    const current = [...this.manzanasMarcadas()];
    const idx = current.findIndex(m => m.id === id);

    if (idx >= 0) {
      current.splice(idx, 1);
      layer.setStyle({ fillColor: color, fillOpacity: 0, color: color, weight: 2 });
    } else {
      current.push({ id, nombreBloque, layer, territorioNumero });
      layer.setStyle({ fillColor: color, fillOpacity: 0.4, color, weight: 3 });
    }

    this.manzanasMarcadas.set(current);
  }

  // ─── GUARDAR EN BASE DE DATOS ─────────────────────────

  async guardarEnBaseDeDatos(): Promise<void> {
    const territorio = this.territorioSeleccionado();
    if (!territorio) return;

    const marcadas = this.manzanasMarcadas();
    const total = this.totalManzanas();
    const perfil = this.profileService.currentUser();

    if (!perfil) {
      this.toastService.show('No hay perfil configurado');
      return;
    }

    const manzanasIds = marcadas.filter(m => !m.id.startsWith('parcial-')).map(m => m.id).join(',');

    const nonPartial = marcadas.filter(m => !m.id.startsWith('parcial-'));
    const manzanaId = nonPartial.length > 0 ? nonPartial[0].id : null;

    let geometriaParcial: string | null = null;
    let puntosParciales: string | null = null;
    if (this.datosParcialesGuardados) {
      geometriaParcial = this.datosParcialesGuardados.geometria;
      puntosParciales = JSON.stringify(
        this.datosParcialesGuardados.puntos.map(p => ({ lat: p.latlng.lat, lng: p.latlng.lng }))
      );
    }

    const registro = {
      territorioNumero: territorio,
      manzanaId,
      encargadoId: perfil.encargadoId || null,
      encargadoNombre: perfil.name,
      encargadoApellido: perfil.lastName,
      sessionTime: new Date().toISOString(),
      estado: total > 0 && marcadas.length >= total ? 'completed' : 'incomplete',
      totalManzanas: total,
      manzanasMarcadas: marcadas.length,
      tipoSesion: total > 0 && marcadas.length >= total ? 'completa' : 'parcial',
      geometriaParcial,
      puntosParciales,
      manzanasIds
    };

    try {
      await this.territorioService.crearReportes([registro]);
      this.datosParcialesGuardados = null;
      this.toastService.show('Reporte guardado en la base de datos');
    } catch (e) {
      console.error('Error al guardar reporte', e);
      this.toastService.show('Error al guardar el reporte');
    }
  }

  // ─── CAPTURA ──────────────────────────────────────────

  prepararCaptura(): Promise<void> {
    const marcadas = this.manzanasMarcadas();
    if (marcadas.length === 0) return Promise.resolve();

    const todoLayer = this.allTerritoriesLayer.find(f => f.territorioPadre === this.territorioSeleccionado());
    if (todoLayer) {
      todoLayer.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          const isMarked = marcadas.some(m => m.layer === l);
          if (!isMarked) {
            l.setStyle({ opacity: 0, fillOpacity: 0 });
          }
        }
      });
      todoLayer.centroidMarkers.forEach(m => m.setOpacity(0));
    }

    let combined: L.LatLngBounds | null = null;
    for (const m of marcadas) {
      if (m.layer instanceof L.Polygon) {
        const b = m.layer.getBounds();
        if (b.isValid()) {
          if (!combined) combined = b;
          else combined.extend(b);
        }
      }
    }

    if (combined) {
      this.map.fitBounds(combined, { padding: [50, 50] });
    }

    return new Promise(resolve => setTimeout(resolve, CAPTURE_DELAY_MS));
  }

  restaurarMapaPostCaptura(): void {
    const todoLayer = this.allTerritoriesLayer.find(f => f.territorioPadre === this.territorioSeleccionado());
    if (todoLayer) {
      todoLayer.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          const isMarked = this.manzanasMarcadas().some(m => m.layer === l);
          if (!isMarked) {
            l.setStyle({ opacity: 1, fillOpacity: 0, color: todoLayer.color, weight: 2 });
          }
        }
      });
      todoLayer.centroidMarkers.forEach(m => m.setOpacity(1));
    }

    const bounds = todoLayer?.layer.getBounds();
    if (bounds && bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [30, 30] });
    }
  }

  // ─── LIMPIAR ──────────────────────────────────────────

  limpiarMarcas(): void {
    this.manzanasMarcadas.set([]);
    this.limpiarParcial();
    this.restaurarManzanaAnterior();
    this.modoMarcado.set('none');

    this.extraLayers.forEach(l => this.map.removeLayer(l));
    this.extraLayers = [];

    for (const fl of this.allTerritoriesLayer) {
      fl.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          l.setStyle({ fillColor: fl.color, fillOpacity: 0, color: fl.color, weight: 2, opacity: 1 });
        }
      });
      fl.centroidMarkers.forEach(m => m.setOpacity(1));
    }

    this.totalManzanas.set(0);
    this.territorioSeleccionado.set(null);
    this.currentTerritoryColor = '';
  }

  limpiarTodo(): void {
    this.limpiarMarcas();
    this.loadAllTerritories();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
