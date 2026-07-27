import { Component, OnDestroy, signal, computed, inject, afterNextRender, ChangeDetectionStrategy } from '@angular/core';
import * as L from 'leaflet';
import { TerritorioService } from '../../core/services/territorio';
import { Profile } from '../../core/services/profile';
import { Toast } from '../../core/services/toast';
import { WhatsAppService } from '../../core/services/whatsapp';
import { TerritorySearch } from './territory-search/territory-search';
import type { Reporte } from '../../core/models/models';
import {
  pointInPolygon,
  projectOnSegment,
  latLngDist,
  snapToContour,
  traceContourBetween,
  DEDUP_THRESHOLD_PX,
  type SnappedPoint,
  type Edge
} from './map-geometry';
import { MapReportService, type ManzanaMarcada, type FeatureLayer, type DatosParciales } from './map-report.service';

export type { ManzanaMarcada, FeatureLayer, DatosParciales };

type ModoMarcado = 'none' | 'completa' | 'parcial';

interface ManzanaIndex {
  polygon: L.Polygon;
  id: string;
  nombreBloque: string;
  color: string;
  territorioNumero: number;
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

const CAPTURE_DELAY_MS = 400;
const MAX_PUNTOS_PARCIAL = 6;
const LABEL_MIN_ZOOM = 14;

export function elegirUltimoReporte(reportes: Reporte[]): Reporte | null {
  if (!reportes.length) return null;

  return reportes.reduce<Reporte | null>((best, r) => {
    if (!best) return r;

    const rTime = new Date(r.sessionTime).getTime();
    const bTime = new Date(best.sessionTime).getTime();

    if (Number.isNaN(rTime) && Number.isNaN(bTime)) return (r.id ?? 0) > (best.id ?? 0) ? r : best;
    if (Number.isNaN(rTime)) return best;
    if (Number.isNaN(bTime)) return r;

    return rTime > bTime ? r : best;
  }, null);
}

export function getTerritoryFillOpacity(isComplete: boolean): number {
  return isComplete ? 0.85 : 0.05;
}

const TERRITORY_COLORS = [
  '#DC143C', '#00A86B', '#FF6600', '#8A2BE2', '#E0115F',
  '#00CED1', '#FF1493', '#32CD32', '#FF4500', '#1E90FF',
  '#DA70D6', '#FFD700', '#00FF7F', '#FF00FF', '#4169E1',
  '#FF69B4', '#7B68EE', '#FF8C00', '#00BFFF', '#FF6347',
  '#9370DB', '#3CB371', '#FF1493', '#4682B4', '#FFA500',
  '#2E8B57', '#CD5C5C', '#6A5ACD', '#20B2AA', '#DAA520'
];

function getColorForTerritorio(territorioNum: number, backendColor: string | null): string {
  if (backendColor && /^#[0-9a-fA-F]{3,8}$/.test(backendColor)) {
    return backendColor;
  }
  return TERRITORY_COLORS[((territorioNum - 1) % TERRITORY_COLORS.length + TERRITORY_COLORS.length) % TERRITORY_COLORS.length];
}

@Component({
  selector: 'app-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TerritorySearch],
  templateUrl: './map.html',
  styleUrl: './map.css'
})
export class MapPage implements OnDestroy {
  private territorioService = inject(TerritorioService);
  private profileService = inject(Profile);
  private toastService = inject(Toast);
  private whatsappService = inject(WhatsAppService);
  private reportService = inject(MapReportService);
  private map!: L.Map;
  private tileLayer!: L.TileLayer;
  private satelliteLayer!: L.TileLayer;
  private themeObserver: MutationObserver | null = null;
  private allTerritoriesLayer: FeatureLayer[] = [];
  private manzanaIndex: ManzanaIndex[] = [];
  private currentTerritoryColor = '';
  private territoryDataCache = new Map<number, { fc: GeoJSON.FeatureCollection; color: string; bounds: L.LatLngBounds }>();

  manzanasMarcadas = signal<ManzanaMarcada[]>([]);
  manzanasCount = computed(() => this.manzanasMarcadas().length);
  totalManzanas = signal(0);
  territorioSeleccionado = signal<number | null>(null);
  territoriosSeleccionados = signal<number[]>([]);
  tieneTerritorio = computed(() => this.territoriosSeleccionados().length > 0);

  modoMarcado = signal<ModoMarcado>('none');
  puntosParciales = signal<SnappedPoint[]>([]);
  puntosCount = computed(() => this.puntosParciales().length);
  puedeConfirmar = computed(() => this.puntosCount() >= 3);

  enviando = signal(false);
  isLoading = signal(false);
  isSatellite = signal(false);
  predicacion = signal<string>('tarde');
  screenshotPreview = signal<string | null>(null);

  private territoryLabels: L.Marker[] = [];
  private poligonoParcial: L.Polygon | null = null;
  private markersParciales: L.Layer[] = [];
  private extraLayers: L.Layer[] = [];
  private datosParcialesGuardados: { puntos: SnappedPoint[]; geometria: string } | null = null;
  private manzanaSeleccionada: L.Polygon | null = null;
  private manzanaSeleccionadaColor = '';
  private manzanaSeleccionadaNombre = '';
  private manzanaEdges: Edge[] = [];
  private pendingStyleFrame: number | null = null;
  private pendingStyleQueue: Array<() => void> = [];

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

    this.tileLayer = L.tileLayer(this.getTileLayerUrl(), {
      maxZoom: 18,
      attribution: this.getMapAttribution()
    }).addTo(this.map);

    this.satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 18, attribution: '&copy; Esri, Maxar, Earthstar Geographics' }
    );

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    this.observeThemeChanges();

    this.map.on('click', (e: L.LeafletMouseEvent) => this.onMapClick(e));
    this.map.on('zoomend', () => this.updateLabelsVisibility());
    this.map.on('moveend', () => this.updateVisibleTerritories());

    void this.loadAllTerritories();
  }

  private getCurrentTheme(): 'light' | 'dark' {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  private getTileLayerUrl(): string {
    return this.getCurrentTheme() === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  }

  private getMapAttribution(): string {
    return this.getCurrentTheme() === 'dark'
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  }

  private observeThemeChanges(): void {
    if (typeof MutationObserver === 'undefined') return;

    this.themeObserver = new MutationObserver(() => {
      if (!this.tileLayer || this.isSatellite()) return;
      this.tileLayer.setUrl(this.getTileLayerUrl());
    });

    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });
  }

  private async loadAllTerritories(): Promise<void> {
    if (this.isLoading()) return;
    this.isLoading.set(true);

    try {
      for (const fl of this.allTerritoriesLayer) {
        fl.layer.remove();
      }
      for (const lbl of this.territoryLabels) {
        lbl.remove();
      }
      this.allTerritoriesLayer = [];
      this.territoryLabels = [];
      this.manzanaIndex = [];
      this.territoryDataCache.clear();

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
        const rawColor = features[0]?.properties?.['color'] ?? null;
        const color = getColorForTerritorio(territorioNum, rawColor);
        const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };

        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        for (const f of features) {
          const geom = f.geometry;
          if (geom?.type === 'Polygon') {
            for (const ring of (geom as GeoJSON.Polygon).coordinates) {
              for (const [lng, lat] of ring) {
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
              }
            }
          } else if (geom?.type === 'MultiPolygon') {
            for (const poly of (geom as GeoJSON.MultiPolygon).coordinates) {
              for (const ring of poly) {
                for (const [lng, lat] of ring) {
                  if (lat < minLat) minLat = lat;
                  if (lat > maxLat) maxLat = lat;
                  if (lng < minLng) minLng = lng;
                  if (lng > maxLng) maxLng = lng;
                }
              }
            }
          }
        }

        const bounds = L.latLngBounds(L.latLng(minLat, minLng), L.latLng(maxLat, maxLng));
        this.territoryDataCache.set(territorioNum, { fc, color, bounds });
      }

      this.updateVisibleTerritories();
      await this.restoreAllMarks();
    } catch {
      this.toastService.show('Error al cargar los territorios');
    } finally {
      this.isLoading.set(false);
    }
  }

  private updateVisibleTerritories(): void {
    const mapBounds = this.map.getBounds().pad(0.15);
    const loadedNums = new Set(this.allTerritoriesLayer.map(fl => fl.territorioPadre));
    const newlyLoaded: number[] = [];

    for (const [num, data] of this.territoryDataCache) {
      const isVisible = data.bounds.isValid() && data.bounds.intersects(mapBounds);
      const isLoaded = loadedNums.has(num);

      if (isVisible && !isLoaded) {
        this.addTerritoryLayer(num, data);
        newlyLoaded.push(num);
      } else if (!isVisible && isLoaded) {
        this.removeTerritoryLayer(num);
      }
    }

    this.updateLabelsVisibility();

    for (const num of newlyLoaded) {
      const fl = this.allTerritoriesLayer.find(f => f.territorioPadre === num);
      if (fl) void this.restaurarMarcadoDesdeDB(num, fl.color, { actualizarEstadoMarcado: false });
    }

    if (this.modoMarcado() !== 'none' && newlyLoaded.length > 0) {
      this.ocultarPoligonosNoSeleccionados();
    }
  }

  private ensureTerritoryLoaded(territorioNum: number): void {
    if (this.allTerritoriesLayer.some(fl => fl.territorioPadre === territorioNum)) return;
    const data = this.territoryDataCache.get(territorioNum);
    if (data) this.addTerritoryLayer(territorioNum, data);
  }

  private addTerritoryLayer(territorioNum: number, data: { fc: GeoJSON.FeatureCollection; color: string; bounds: L.LatLngBounds }): void {
    const { fc, color, bounds } = data;

    const layer = L.geoJSON(fc, {
      style: () => ({
        fillColor: color,
        fillOpacity: getTerritoryFillOpacity(false),
        opacity: 1,
        color: color,
        weight: 3,
        smoothFactor: 1
      }),
      onEachFeature: (feature, l) => {
        if (l instanceof L.Polygon) {
          const id = String(feature.properties?.['id'] ?? '');
          const nombreBloque = String(feature.properties?.['nombre_bloque'] ?? '');

          const rings = l.getLatLngs();
          const outer = rings[0] as L.LatLng[];
          let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
          if (outer) {
            for (const pt of outer) {
              if (pt.lat < minLat) minLat = pt.lat;
              if (pt.lat > maxLat) maxLat = pt.lat;
              if (pt.lng < minLng) minLng = pt.lng;
              if (pt.lng > maxLng) maxLng = pt.lng;
            }
          }
          const bbox = { minLat, maxLat, minLng, maxLng };

          this.manzanaIndex.push({ polygon: l, id, nombreBloque, color, territorioNumero: territorioNum, bbox });

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

    if (bounds.isValid()) {
      const center = bounds.getCenter();
      const label = L.marker(center, {
        icon: L.divIcon({
          className: 'territory-label',
          html: `<span class="territory-label__text">${territorioNum}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        }),
        interactive: false,
        keyboard: false
      }).addTo(this.map);
      this.territoryLabels.push(label);
    }

    this.allTerritoriesLayer.push({
      territorioPadre: territorioNum,
      color,
      layer
    });
  }

  private removeTerritoryLayer(territorioNum: number): void {
    const idx = this.allTerritoriesLayer.findIndex(fl => fl.territorioPadre === territorioNum);
    if (idx < 0) return;

    const fl = this.allTerritoriesLayer[idx];
    fl.layer.remove();
    this.allTerritoriesLayer.splice(idx, 1);

    const labelIdx = this.territoryLabels.findIndex(lbl => {
      const el = lbl.getElement();
      if (!el) return false;
      const text = el.querySelector('.territory-label__text')?.textContent;
      return text === String(territorioNum);
    });
    if (labelIdx >= 0) {
      this.territoryLabels[labelIdx].remove();
      this.territoryLabels.splice(labelIdx, 1);
    }

    for (let i = this.manzanaIndex.length - 1; i >= 0; i--) {
      if (this.manzanaIndex[i].territorioNumero === territorioNum) {
        this.manzanaIndex.splice(i, 1);
      }
    }
  }

  private async restoreAllMarks(): Promise<void> {
    const BATCH_SIZE = 4;
    const layers = this.allTerritoriesLayer;

    for (let i = 0; i < layers.length; i += BATCH_SIZE) {
      const batch = layers.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(fl =>
          this.restaurarMarcadoDesdeDB(fl.territorioPadre, fl.color, { actualizarEstadoMarcado: false })
        )
      );
    }
  }

  async onTerritorioSeleccionado(numeros: number[]): Promise<void> {
    const estabaEnModoMarcado = this.modoMarcado() !== 'none';

    if (!estabaEnModoMarcado) {
      this.resetUIState();
    } else {
      this.limpiarParcial();
      this.restaurarManzanaAnterior();
      this.extraLayers.forEach(l => this.map.removeLayer(l));
      this.extraLayers = [];
    }

    if (estabaEnModoMarcado) {
      const existentes = new Set(this.territoriosSeleccionados());
      for (const n of numeros) existentes.add(n);
      this.territoriosSeleccionados.set(Array.from(existentes));
    } else {
      this.modoMarcado.set('none');
      this.territoriosSeleccionados.set(numeros);
    }
    this.territorioSeleccionado.set(this.territoriosSeleccionados().length === 1 ? this.territoriosSeleccionados()[0] : null);

    for (const numero of numeros) {
      this.ensureTerritoryLoaded(numero);
    }

    let combinedBounds: L.LatLngBounds | null = null;

    const numsAConsiderar = estabaEnModoMarcado ? this.territoriosSeleccionados() : numeros;

    for (const numero of numsAConsiderar) {
      const featureLayer = this.allTerritoriesLayer.find(f => f.territorioPadre === numero);
      if (!featureLayer) continue;

      this.currentTerritoryColor = featureLayer.color;

      this.reaplicarMarcasTerritorio(numero);

      const bounds = featureLayer.layer.getBounds();
      if (bounds.isValid()) {
        if (!combinedBounds) combinedBounds = bounds;
        else combinedBounds.extend(bounds);
      }

      await this.restaurarMarcadoDesdeDB(numero, featureLayer.color, { actualizarEstadoMarcado: true });
    }

    if (combinedBounds && combinedBounds.isValid()) {
      this.map.fitBounds(combinedBounds, { padding: [30, 30] });
    }

    this.cancelPendingStyleUpdates();
    this.ocultarPoligonosNoSeleccionados();

    if (numsAConsiderar.length === 1) {
      const fl = this.allTerritoriesLayer.find(f => f.territorioPadre === numsAConsiderar[0]);
      if (fl) {
        this.totalManzanas.set(
          Array.from(fl.layer.getLayers()).filter(l => l instanceof L.Path).length
        );
      }
    } else {
      let total = 0;
      for (const numero of numsAConsiderar) {
        const fl = this.allTerritoriesLayer.find(f => f.territorioPadre === numero);
        if (fl) {
          total += Array.from(fl.layer.getLayers()).filter(l => l instanceof L.Path).length;
        }
      }
      this.totalManzanas.set(total);
    }
  }

  private queueStyleUpdate(fn: () => void): void {
    this.pendingStyleQueue.push(fn);
    if (this.pendingStyleFrame === null) {
      this.pendingStyleFrame = requestAnimationFrame(() => {
        this.pendingStyleFrame = null;
        const queue = this.pendingStyleQueue;
        this.pendingStyleQueue = [];
        for (const fn of queue) fn();
      });
    }
  }

  private cancelPendingStyleUpdates(): void {
    if (this.pendingStyleFrame !== null) {
      cancelAnimationFrame(this.pendingStyleFrame);
      this.pendingStyleFrame = null;
    }
    this.pendingStyleQueue = [];
  }

  private aplicarEstiloBaseTerritorio(
    territorioNumero: number,
    color: string,
    options: { total?: number; marcadas?: number; isComplete?: boolean } = {}
  ): void {
    const total = options.total ?? this.manzanaIndex.filter(m => m.territorioNumero === territorioNumero).length;
    const marcadas = options.marcadas ?? this.manzanasMarcadas().filter(m => m.territorioNumero === territorioNumero).length;
    const isComplete = options.isComplete ?? (total > 0 && marcadas >= total);

    for (const mc of this.manzanaIndex) {
      if (mc.territorioNumero !== territorioNumero) continue;
      const fillOpacity = getTerritoryFillOpacity(isComplete);
      mc.polygon.setStyle({ fillColor: color, fillOpacity, opacity: 1, color, weight: 3 });
    }
  }

  private async restaurarMarcadoDesdeDB(
    territorioNumero: number,
    colorOverride?: string,
    options: { actualizarEstadoMarcado?: boolean } = {}
  ): Promise<void> {
    try {
      const reportes = await this.territorioService.getReportesPorTerritorio(territorioNumero);
      const color = colorOverride ?? this.currentTerritoryColor;
      const { actualizarEstadoMarcado = true } = options;

      const ultimo = elegirUltimoReporte(reportes);
      const ids = ultimo?.manzanasIds ? ultimo.manzanasIds.split(',').filter(Boolean) : [];
      const total = this.manzanaIndex.filter(mc => mc.territorioNumero === territorioNumero).length;
      const marcadas = ids.length;
      const isComplete = total > 0 && marcadas >= total;

      this.aplicarEstiloBaseTerritorio(territorioNumero, color, { total, marcadas, isComplete });

      if (!reportes.length || !ultimo) return;
      const manzanaId = ultimo.manzanaId ? String(ultimo.manzanaId) : null;

      const existingIds = new Set(this.manzanasMarcadas().filter(m => m.territorioNumero === territorioNumero).map(m => m.id));

      for (const mc of this.manzanaIndex) {
        if (mc.territorioNumero !== territorioNumero) continue;
        const isMarked = ids.includes(mc.id) || (manzanaId !== null && mc.id === manzanaId);
        if (isMarked) {
          mc.polygon.setStyle({ fillColor: color, fillOpacity: 0.70, color, weight: 3 });
          if (actualizarEstadoMarcado && !existingIds.has(mc.id)) {
            this.manzanasMarcadas.update(current => [
              ...current,
              { id: mc.id, nombreBloque: mc.nombreBloque, layer: mc.polygon as unknown as L.Path, territorioNumero }
            ]);
          }
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
              fillOpacity: 0.35,
              color,
              weight: 3
            }).addTo(this.map);

            this.extraLayers.push(polygon);

            polygon.on('click', (e: L.LeafletMouseEvent) => {
              L.DomEvent.stop(e);
              this.eliminarParcial(parcialId);
            });

            if (actualizarEstadoMarcado) {
              this.manzanasMarcadas.update(current => [
                ...current,
                { id: parcialId, nombreBloque: 'Zona parcial', layer: polygon as unknown as L.Path, territorioNumero }
              ]);
            }
          }
        } catch { /* ignore parse errors */ }
      }
    } catch {
      this.toastService.show('Error al restaurar el marcado anterior');
    }
  }

  // ─── CLICK DISPATCH ───────────────────────────────────

  private onMapClick(e: L.LeafletMouseEvent): void {
    const modo = this.modoMarcado();

    const hitParcial = this.findParcialAtPoint(e.latlng);
    if (hitParcial) {
      this.eliminarParcial(hitParcial.id);
      return;
    }

    if (modo === 'none') {
      const hit = this.findManzanaInside(e.latlng);
      if (hit) {
        const current = this.manzanasMarcadas();
        const isMarked = current.some(m => m.id === hit.id);
        if (isMarked) {
          this.toggleManzana(hit.id, hit.nombreBloque, hit.polygon, hit.color, hit.territorioNumero);
          return;
        }
        if (this.territoriosSeleccionados().includes(hit.territorioNumero)) {
          void this.onTerritorioSeleccionado(this.territoriosSeleccionados().filter(n => n !== hit.territorioNumero));
        } else if (this.territoriosSeleccionados().length > 0) {
          void this.onTerritorioSeleccionado([...this.territoriosSeleccionados(), hit.territorioNumero]);
        } else {
          void this.onTerritorioSeleccionado([hit.territorioNumero]);
        }
      }
      return;
    }

    if (modo === 'completa') {
      const hit = this.findManzanaInside(e.latlng);
      if (hit) {
        if (!this.territoriosSeleccionados().includes(hit.territorioNumero)) {
          void this.onTerritorioSeleccionado([...this.territoriosSeleccionados(), hit.territorioNumero]);
        } else {
          this.toggleManzana(hit.id, hit.nombreBloque, hit.polygon, hit.color, hit.territorioNumero);
        }
      }
      return;
    }

    if (modo === 'parcial') {
      const hit = this.findManzanaInside(e.latlng);
      if (hit) {
        const current = this.manzanasMarcadas();
        const isMarked = current.some(m => m.id === hit.id);
        if (isMarked) {
          this.toggleManzana(hit.id, hit.nombreBloque, hit.polygon, hit.color, hit.territorioNumero);
          return;
        }

        if (!this.territoriosSeleccionados().includes(hit.territorioNumero)) {
          void this.onTerritorioSeleccionado([...this.territoriosSeleccionados(), hit.territorioNumero]);
          return;
        }
      }

      if (!this.manzanaSeleccionada) {
        const nearest = hit ?? this.findNearestManzana(e.latlng);
        if (nearest) {
          this.seleccionarManzana(nearest.polygon, nearest.color, nearest.nombreBloque, nearest.territorioNumero);
        } else {
          this.toastService.show('No se encontró una manzana cerca');
          return;
        }
      }

      if (this.puntosCount() >= MAX_PUNTOS_PARCIAL) {
        this.toastService.show(`Máximo ${MAX_PUNTOS_PARCIAL} puntos`);
        return;
      }

      const snapped = snapToContour(e.latlng, this.manzanaEdges, this.map);
      this.agregarPunto(snapped);
      return;
    }
  }

  private findParcialAtPoint(latlng: L.LatLng): ManzanaMarcada | null {
    const marcadas = this.manzanasMarcadas();
    for (const m of marcadas) {
      if (!m.id.startsWith('parcial-')) continue;
      if (m.layer instanceof L.Polygon) {
        const rings = m.layer.getLatLngs();
        const outer = rings[0] as L.LatLng[];
        if (outer && pointInPolygon(latlng, outer)) {
          return m;
        }
      }
    }
    return null;
  }

  private eliminarParcial(id: string): void {
    const current = [...this.manzanasMarcadas()];
    const idx = current.findIndex(m => m.id === id);
    if (idx < 0) return;

    const marcada = current[idx];
    this.map.removeLayer(marcada.layer);

    const extraIdx = this.extraLayers.indexOf(marcada.layer);
    if (extraIdx >= 0) this.extraLayers.splice(extraIdx, 1);

    current.splice(idx, 1);
    this.manzanasMarcadas.set(current);

    this.datosParcialesGuardados = null;
    this.toastService.show('Zona parcial eliminada');
  }

  // ─── POINT-IN-POLYGON ─────────────────────────────────

  private findManzanaInside(latlng: L.LatLng): ManzanaIndex | null {
    const { lat, lng } = latlng;
    for (const mc of this.manzanaIndex) {
      if (lat < mc.bbox.minLat || lat > mc.bbox.maxLat ||
          lng < mc.bbox.minLng || lng > mc.bbox.maxLng) continue;
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

    const clickPt = this.map.latLngToContainerPoint(latlng);
    let best: ManzanaIndex | null = null;
    let bestDist = Infinity;

    for (const mc of this.manzanaIndex) {
      const { minLat, maxLat, minLng, maxLng } = mc.bbox;
      const clampLat = Math.max(minLat, Math.min(latlng.lat, maxLat));
      const clampLng = Math.max(minLng, Math.min(latlng.lng, maxLng));
      const bboxDx = (latlng.lat - clampLat) * 111000;
      const bboxDy = (latlng.lng - clampLng) * 111000 * Math.cos(latlng.lat * Math.PI / 180);
      const bboxDist = Math.sqrt(bboxDx * bboxDx + bboxDy * bboxDy);
      if (bboxDist >= bestDist) continue;

      const rings = mc.polygon.getLatLngs();
      const outer = rings[0] as L.LatLng[];
      if (!outer) continue;

      for (let i = 0; i < outer.length; i++) {
        const a = outer[i];
        const b = outer[(i + 1) % outer.length];
        const proj = projectOnSegment(latlng, a, b, this.map);
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

  // ─── MODO ─────────────────────────────────────────────

  toggleSatellite(): void {
    const satellite = !this.isSatellite();
    this.isSatellite.set(satellite);

    if (satellite) {
      this.map.removeLayer(this.tileLayer);
      this.satelliteLayer.addTo(this.map);
    } else {
      this.map.removeLayer(this.satelliteLayer);
      this.tileLayer.addTo(this.map);
    }
  }

  setModoMarcado(modo: ModoMarcado): void {
    this.limpiarParcial();
    this.modoMarcado.set(modo);

    if (modo === 'completa' || modo === 'parcial') {
      this.ocultarPoligonosNoSeleccionados();
      this.toastService.show(modo === 'parcial' ? 'Tocá en cualquier parte del mapa' : 'Tocá una manzana para marcarla');
    } else {
      this.restaurarVisibilidadPoligonos();
    }
  }

  private ocultarPoligonosNoSeleccionados(): void {
    const seleccionados = new Set(this.territoriosSeleccionados());

    for (const fl of this.allTerritoriesLayer) {
      if (seleccionados.has(fl.territorioPadre)) continue;

      fl.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          l.setStyle({ opacity: 0, fillOpacity: 0 });
        }
      });
    }

    this.actualizarVisibilidadLabels(seleccionados);
  }

  private restaurarVisibilidadPoligonos(): void {
    this.cancelPendingStyleUpdates();

    this.queueStyleUpdate(() => {
      for (const fl of this.allTerritoriesLayer) {
        const total = this.manzanaIndex.filter(m => m.territorioNumero === fl.territorioPadre).length;
        const marcadas = this.manzanasMarcadas().filter(m => m.territorioNumero === fl.territorioPadre).length;
        const isComplete = total > 0 && marcadas >= total;
        const baseOpacity = getTerritoryFillOpacity(isComplete);

        fl.layer.eachLayer(l => {
          if (l instanceof L.Path) {
            l.setStyle({ opacity: 1, fillOpacity: baseOpacity, color: fl.color, weight: 3 });
          }
        });
      }

      const seleccionados = this.territoriosSeleccionados();
      for (const num of seleccionados) {
        const featureLayer = this.allTerritoriesLayer.find(f => f.territorioPadre === num);
        if (!featureLayer) continue;

        const marcadas = this.manzanasMarcadas().filter(m => m.territorioNumero === num);
        for (const m of marcadas) {
          m.layer.setStyle({ fillColor: featureLayer.color, fillOpacity: 0.95, color: featureLayer.color, weight: 3 });
        }
      }

      this.mostrarTodosLosLabels();
    });
  }

  private mostrarTodosLosLabels(): void {
    const show = this.map.getZoom() >= LABEL_MIN_ZOOM;
    for (const lbl of this.territoryLabels) {
      lbl.setOpacity(show ? 1 : 0);
    }
  }

  private updateLabelsVisibility(): void {
    const show = this.map.getZoom() >= LABEL_MIN_ZOOM;
    for (const lbl of this.territoryLabels) {
      lbl.setOpacity(show ? 1 : 0);
    }
  }

  private actualizarVisibilidadLabels(seleccionados: Set<number>): void {
    const zoomVisible = this.map.getZoom() >= LABEL_MIN_ZOOM;

    if (seleccionados.size === 0 || !zoomVisible) {
      this.mostrarTodosLosLabels();
      return;
    }

    const nums = new Set(seleccionados);
    for (const lbl of this.territoryLabels) {
      const el = lbl.getElement();
      if (!el) continue;
      const text = el.querySelector('.territory-label__text')?.textContent;
      if (text && nums.has(Number(text))) {
        lbl.setOpacity(1);
      } else {
        lbl.setOpacity(0);
      }
    }
  }

  // ─── SELECCIÓN DE MANZANA ─────────────────────────────

  private seleccionarManzana(polygon: L.Polygon, color: string, nombreBloque: string, territorioNumero: number): void {
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

    if (!this.territoriosSeleccionados().includes(territorioNumero)) {
      this.territoriosSeleccionados.update(nums => [...nums, territorioNumero]);
      this.territorioSeleccionado.set(this.territoriosSeleccionados().length === 1 ? territorioNumero : null);

      const featureLayer = this.allTerritoriesLayer.find(f => f.territorioPadre === territorioNumero);
      if (featureLayer) {
        const total = this.manzanaIndex.filter(m => m.territorioNumero === territorioNumero).length;
        const marcadas = this.manzanasMarcadas().filter(m => m.territorioNumero === territorioNumero).length;
        const isComplete = total > 0 && marcadas >= total;
        const baseOpacity = getTerritoryFillOpacity(isComplete);

        featureLayer.layer.eachLayer(l => {
          if (l instanceof L.Path) {
            l.setStyle({ opacity: 1, fillOpacity: baseOpacity, color: featureLayer.color, weight: 3 });
          }
        });
      }

      this.ocultarPoligonosNoSeleccionados();
      this.totalManzanas.set(
        this.manzanaIndex.filter(m => this.territoriosSeleccionados().includes(m.territorioNumero)).length
      );
    }

    this.toastService.show(`Manzana "${nombreBloque}" — tocá para colocar puntos`);
  }

  private restaurarManzanaAnterior(): void {
    if (this.manzanaSeleccionada) {
      const total = this.manzanaIndex.filter(m => m.territorioNumero === this.territoriosSeleccionados()[0]).length;
      const marcadas = this.manzanasMarcadas().filter(m => m.territorioNumero === this.territoriosSeleccionados()[0]).length;
      const isComplete = total > 0 && marcadas >= total;
      const baseOpacity = getTerritoryFillOpacity(isComplete);

      this.manzanaSeleccionada.setStyle({
        color: this.manzanaSeleccionadaColor,
        fillColor: this.manzanaSeleccionadaColor,
        fillOpacity: baseOpacity,
        weight: 3
      });
      this.manzanaSeleccionada = null;
      this.manzanaSeleccionadaNombre = '';
      this.manzanaEdges = [];
    }
  }

  // ─── PUNTOS PARCIALES ─────────────────────────────────

  private agregarPunto(punto: SnappedPoint): void {
    const actuales = this.puntosParciales();

    if (actuales.length > 0) {
      const last = actuales[actuales.length - 1];
      if (latLngDist(last.latlng, punto.latlng, this.map) < DEDUP_THRESHOLD_PX) {
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
        fillOpacity: 0.3,
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
      const segment = traceContourBetween(puntos[i], puntos[i + 1], this.manzanaEdges, this.map);
      for (let j = 0; j < segment.length; j++) {
        if (result.length === 0) {
          result.push(segment[j]);
        } else {
          const last = result[result.length - 1];
          if (latLngDist(last, segment[j], this.map) > 1) {
            result.push(segment[j]);
          }
        }
      }
    }

    if (result.length >= 3) {
      const last = result[result.length - 1];
      const first = result[0];
      if (latLngDist(last, first, this.map) < 1) {
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
        const snapped = snapToContour(newLatLng, this.manzanaEdges, this.map);
        actualizados[idx] = snapped;
        this.puntosParciales.set(actualizados);

        const latlngs = this.buildContourPolygon(actualizados);
        if (this.poligonoParcial) {
          if (latlngs.length >= 2) {
            this.poligonoParcial.setLatLngs(latlngs);
          } else {
            this.map.removeLayer(this.poligonoParcial);
            this.poligonoParcial = null;
          }
        } else if (latlngs.length >= 2) {
          const color = this.currentTerritoryColor || '#22c55e';
          this.poligonoParcial = L.polygon(latlngs, {
            color,
            fillColor: color,
            fillOpacity: 0.3,
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

      this.poligonoParcial.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stop(e);
        this.eliminarParcial(id);
      });

      this.poligonoParcial = null;
    }

    this.markersParciales.forEach(m => this.map.removeLayer(m));
    this.markersParciales = [];
    this.puntosParciales.set([]);

    this.restaurarManzanaAnterior();
    this.modoMarcado.set('none');
    this.restaurarVisibilidadPoligonos();
    this.toastService.show('Zona parcial marcada — tocá para eliminar');
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
      const total = this.manzanaIndex.filter(m => m.territorioNumero === territorioNumero).length;
      const marcadas = current.filter(m => m.territorioNumero === territorioNumero).length;
      const isComplete = total > 0 && marcadas >= total;
      const baseOpacity = getTerritoryFillOpacity(isComplete);
      layer.setStyle({ fillColor: color, fillOpacity: baseOpacity, color: color, weight: 3 });
    } else {
      current.push({ id, nombreBloque, layer, territorioNumero });
      layer.setStyle({ fillColor: color, fillOpacity: 0.95, color, weight: 3 });

      if (!this.territoriosSeleccionados().includes(territorioNumero)) {
        this.territoriosSeleccionados.update(nums => [...nums, territorioNumero]);
        this.territorioSeleccionado.set(this.territoriosSeleccionados().length === 1 ? territorioNumero : null);

        const featureLayer = this.allTerritoriesLayer.find(f => f.territorioPadre === territorioNumero);
        if (featureLayer) {
          const total = this.manzanaIndex.filter(m => m.territorioNumero === territorioNumero).length;
          const marcadas = current.filter(m => m.territorioNumero === territorioNumero).length;
          const isComplete = total > 0 && marcadas >= total;
          const baseOpacity = getTerritoryFillOpacity(isComplete);

          featureLayer.layer.eachLayer(l => {
            if (l instanceof L.Path) {
              l.setStyle({ opacity: 1, fillOpacity: baseOpacity, color: featureLayer.color, weight: 3 });
            }
          });
        }

        this.ocultarPoligonosNoSeleccionados();
      }
    }

    this.manzanasMarcadas.set(current);
    this.totalManzanas.set(
      this.manzanaIndex.filter(m => this.territoriosSeleccionados().includes(m.territorioNumero)).length
    );
  }

  // ─── GUARDAR EN BASE DE DATOS ─────────────────────────

  async guardarEnBaseDeDatos(): Promise<void> {
    const perfil = this.reportService.getProfile();
    if (!perfil) {
      this.toastService.show('No hay perfil configurado');
      return;
    }

    const marcadas = this.manzanasMarcadas();
    if (!marcadas.length) {
      this.toastService.show('No hay manzanas marcadas');
      return;
    }

    if (this.enviando()) return;
    this.enviando.set(true);

    const registros = this.reportService.buildRegistros(
      marcadas, this.allTerritoriesLayer, this.territoriosSeleccionados(), this.datosParcialesGuardados
    );

    const previousMarcadas = [...marcadas];
    const previousDatosParciales = this.datosParcialesGuardados;

    this.toastService.show('Guardando reportes...');
    this.datosParcialesGuardados = null;

    try {
      await this.reportService.saveToDatabase(registros);

      const seleccionados = this.territoriosSeleccionados();
      for (const num of seleccionados) {
        this.territorioService.invalidateReportCache(num);
        await this.restaurarMarcadoDesdeDB(num, undefined, { actualizarEstadoMarcado: true });
      }

      this.reaplicarMarcasTerritorio();
      this.toastService.show('Reportes guardados exitosamente');
    } catch {
      this.manzanasMarcadas.set(previousMarcadas);
      this.datosParcialesGuardados = previousDatosParciales;
      this.toastService.show('Error al guardar los reportes');
    } finally {
      this.enviando.set(false);
    }
  }

  // ─── CAPTURA ──────────────────────────────────────────

  prepararCaptura(): Promise<void> {
    const marcadas = this.manzanasMarcadas();
    if (marcadas.length === 0) return Promise.resolve();

    const seleccionados = new Set(this.territoriosSeleccionados());

    for (const fl of this.allTerritoriesLayer) {
      if (!seleccionados.has(fl.territorioPadre)) {
        fl.layer.eachLayer(l => {
          if (l instanceof L.Path) {
            l.setStyle({ opacity: 0, fillOpacity: 0 });
          }
        });
        continue;
      }

      fl.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          const isMarked = marcadas.some(m => m.layer === l);
          if (!isMarked) {
            l.setStyle({ opacity: 0.3, fillOpacity: 0.02, color: fl.color, weight: 1 });
          }
        }
      });
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

    return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, CAPTURE_DELAY_MS)));
  }

  restaurarMapaPostCaptura(): void {
    const seleccionados = new Set(this.territoriosSeleccionados());

    for (const fl of this.allTerritoriesLayer) {
      const total = this.manzanaIndex.filter(m => m.territorioNumero === fl.territorioPadre).length;
      const marcadas = this.manzanasMarcadas().filter(m => m.territorioNumero === fl.territorioPadre).length;
      const isComplete = total > 0 && marcadas >= total;
      const baseOpacity = getTerritoryFillOpacity(isComplete);

      if (!seleccionados.has(fl.territorioPadre)) {
        const isVisible = this.modoMarcado() === 'none';
        fl.layer.eachLayer(l => {
          if (l instanceof L.Path) {
            l.setStyle({
              opacity: isVisible ? 1 : 0,
              fillOpacity: isVisible ? baseOpacity : 0,
              color: fl.color,
              weight: 3
            });
          }
        });
        continue;
      }

      fl.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          const isMarked = this.manzanasMarcadas().some(m => m.layer === l);
          if (!isMarked) {
            l.setStyle({ opacity: 1, fillOpacity: baseOpacity, color: fl.color, weight: 3 });
          }
        }
      });
    }

    let combined: L.LatLngBounds | null = null;
    for (const num of seleccionados) {
      const fl = this.allTerritoriesLayer.find(f => f.territorioPadre === num);
      if (fl) {
        const bounds = fl.layer.getBounds();
        if (bounds.isValid()) {
          if (!combined) combined = bounds;
          else combined.extend(bounds);
        }
      }
    }

    if (combined && combined.isValid()) {
      this.map.fitBounds(combined, { padding: [30, 30] });
    }
  }

  // ─── LIMPIAR ──────────────────────────────────────────

  private resetUIState(): void {
    this.limpiarParcial();
    this.restaurarManzanaAnterior();
    this.modoMarcado.set('none');

    this.extraLayers.forEach(l => this.map.removeLayer(l));
    this.extraLayers = [];

    this.restaurarVisibilidadPoligonos();
  }

  private reaplicarMarcasTerritorio(territorioNumero?: number): void {
    const numeros = territorioNumero !== undefined
      ? [territorioNumero]
      : this.territoriosSeleccionados();

    for (const num of numeros) {
      const featureLayer = this.allTerritoriesLayer.find(f => f.territorioPadre === num);
      if (!featureLayer) continue;

      const total = this.manzanaIndex.filter(m => m.territorioNumero === num).length;
      const marcadas = this.manzanasMarcadas().filter(m => m.territorioNumero === num).length;
      const isComplete = total > 0 && marcadas >= total;
      const fillOpacity = getTerritoryFillOpacity(isComplete);

      featureLayer.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          l.setStyle({ fillOpacity, opacity: 1, weight: 3, fillColor: featureLayer.color, color: featureLayer.color });
        }
      });

      const marcadasLayers = this.manzanasMarcadas().filter(m => m.territorioNumero === num);
      for (const m of marcadasLayers) {
        m.layer.setStyle({ fillColor: featureLayer.color, fillOpacity: 0.95, color: featureLayer.color, weight: 3 });
      }
    }
  }

  limpiarMarcas(): void {
    this.manzanasMarcadas.set([]);
    this.resetUIState();

    for (const fl of this.allTerritoriesLayer) {
      fl.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          l.setStyle({ fillColor: fl.color, fillOpacity: 0.05, color: fl.color, weight: 3, opacity: 1 });
        }
      });
    }

    this.totalManzanas.set(0);
    this.territorioSeleccionado.set(null);
    this.territoriosSeleccionados.set([]);
    this.currentTerritoryColor = '';
  }

  // ─── ENVIAR TERRITORIO ────────────────────────────────

  async guardarYEnviar(): Promise<void> {
    const perfil = this.reportService.getProfile();
    if (!perfil) {
      this.toastService.show('No hay perfil configurado');
      return;
    }

    const marcadas = this.manzanasMarcadas();
    if (!marcadas.length) {
      this.toastService.show('No hay territorios marcados');
      return;
    }

    if (this.enviando()) return;
    this.enviando.set(true);

    const territorios = this.reportService.buildTerritoriosEnvio(marcadas, this.allTerritoriesLayer);
    const requiereScreenshot = territorios.some(t => !t.finalizado);

    let screenshotBase64: string | null = null;
    if (requiereScreenshot) {
      screenshotBase64 = await this.reportService.captureScreenshot(
        () => this.prepararCaptura(),
        () => this.restaurarMapaPostCaptura()
      );
    }

    const request = this.reportService.buildWhatsAppRequest(perfil, territorios, screenshotBase64, this.predicacion());

    try {
      const registros = this.reportService.buildRegistros(
        this.manzanasMarcadas(), this.allTerritoriesLayer, this.territoriosSeleccionados(), this.datosParcialesGuardados
      );
      await this.reportService.saveToDatabase(registros);

      const seleccionados = this.territoriosSeleccionados();
      for (const num of seleccionados) {
        this.territorioService.invalidateReportCache(num);
        await this.restaurarMarcadoDesdeDB(num, undefined, { actualizarEstadoMarcado: true });
      }

      this.reaplicarMarcasTerritorio();

      const success = await this.reportService.sendWhatsApp(request);

      if (success) {
        const mensajes = territorios.map(t => {
          const estado = t.finalizado ? '*terminado*' : '*faltante*';
          return `Territorio ${t.numero} ${estado}`;
        });
        this.toastService.show(mensajes.join('\n'));
      } else {
        this.toastService.show('Error enviando WhatsApp');
      }
    } catch {
      this.toastService.show('Error al procesar el reporte');
    } finally {
      this.enviando.set(false);
      this.screenshotPreview.set(null);
    }
  }

  limpiarTodo(): void {
    const hasData = this.manzanasMarcadas().length > 0 || this.territoriosSeleccionados().length > 0;
    this.limpiarMarcas();

    if (hasData) {
      this.territorioService.invalidateAll();
      void this.loadAllTerritories();
    }
  }

  ngOnDestroy(): void {
    this.cancelPendingStyleUpdates();
    this.themeObserver?.disconnect();
    this.map?.remove();
  }
}
