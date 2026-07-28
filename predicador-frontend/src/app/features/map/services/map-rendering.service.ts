import { Injectable, signal, effect } from '@angular/core';
import * as L from 'leaflet';
import * as GeoJSON from 'geojson';
import { MAP_DEFAULTS, STYLE_DEFAULTS, TILE_LAYERS, ATTRIBUTIONS } from '../utils/map-constants';
import { getColorForTerritorio, getTerritoryFillOpacity } from '../utils/territory-colors';
import { latLngDist, traceContourBetween } from '../map-geometry';
import polygonClipping from 'polygon-clipping';
import type {
  ManzanaIndex,
  FeatureLayer,
  TerritorioCacheData,
  ManzanaMarcada,
  SnappedPoint,
  Edge,
} from '../types/map.types';

export type ManzanaClickHandler = (
  id: string,
  nombreBloque: string,
  polygon: L.Polygon,
  color: string,
  territorioNumero: number,
  event: L.LeafletMouseEvent
) => void;

@Injectable({ providedIn: 'root' })
export class MapRenderingService {
  private map = signal<L.Map | null>(null);
  private tileLayer = signal<L.TileLayer | null>(null);
  private satelliteLayer = signal<L.TileLayer | null>(null);
  private themeObserver: MutationObserver | null = null;
  private manzanaClickHandler: ManzanaClickHandler | null = null;

  private allTerritoriesLayer = signal<FeatureLayer[]>([]);
  private manzanaIndex = signal<ManzanaIndex[]>([]);
  private territoryLabels = signal<L.Marker[]>([]);
  private territoryDataCache = signal<Map<number, TerritorioCacheData>>(new Map());
  private currentTerritoryColor = signal<string>('');

  private extraLayers = signal<L.Layer[]>([]);
  private poligonoParcial = signal<L.Polygon | null>(null);
  private markersParciales = signal<L.Layer[]>([]);

  private pendingStyleFrame: number | null = null;
  private pendingStyleQueue: Array<() => void> = [];

  private isSatelliteView = false;

  constructor() {
    effect(() => {
      const m = this.map();
      if (m) {
        this.initLayers(m);
        this.observeThemeChanges(m);
      }
    });
  }

  getMap(): L.Map | null {
    return this.map();
  }

  isSatellite(): boolean {
    return this.isSatelliteView;
  }

  setManzanaClickHandler(handler: ManzanaClickHandler | null): void {
    this.manzanaClickHandler = handler;
  }

  initializeMap(mapElement: HTMLElement): void {
    const map = L.map(mapElement, {
      preferCanvas: true,
      zoomControl: false,
    }).setView(MAP_DEFAULTS.initialView, MAP_DEFAULTS.initialZoom);

    this.map.set(map);
  }

  private initLayers(map: L.Map): void {
    const theme = this.getCurrentTheme();
    const tileLayer = L.tileLayer(this.getTileLayerUrl(theme), {
      maxZoom: MAP_DEFAULTS.maxZoom,
      attribution: this.getMapAttribution(theme),
    }).addTo(map);

    const satelliteLayer = L.tileLayer(TILE_LAYERS.satellite, {
      maxZoom: MAP_DEFAULTS.maxZoom,
      attribution: ATTRIBUTIONS.satellite,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    this.tileLayer.set(tileLayer);
    this.satelliteLayer.set(satelliteLayer);
  }

  private getCurrentTheme(): 'light' | 'dark' {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  private getTileLayerUrl(theme: 'light' | 'dark'): string {
    return theme === 'dark' ? TILE_LAYERS.dark : TILE_LAYERS.light;
  }

  private getMapAttribution(theme: 'light' | 'dark'): string {
    return theme === 'dark' ? ATTRIBUTIONS.dark : ATTRIBUTIONS.light;
  }

  private observeThemeChanges(_map: L.Map): void {
    if (typeof MutationObserver === 'undefined') return;

    this.themeObserver = new MutationObserver(() => {
      if (!this.tileLayer() || this.isSatelliteView) return;
      this.tileLayer()!.setUrl(this.getTileLayerUrl(this.getCurrentTheme()));
    });

    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  async loadAllTerritories(territorioService: { getAllGeoJson(): Promise<string> }): Promise<void> {
    this.clearAllLayers();

    const geoJsonText = await territorioService.getAllGeoJson();
    const geoJson = JSON.parse(geoJsonText) as GeoJSON.FeatureCollection;

    const byTerritorio = new Map<number, GeoJSON.Feature[]>();
    for (const feature of geoJson.features) {
      const num = feature.properties?.['territorio_padre'];
      if (num) {
        if (!byTerritorio.has(num)) byTerritorio.set(num, []);
        byTerritorio.get(num)!.push(feature);
      }
    }

    const cache = new Map<number, TerritorioCacheData>();
    for (const [territorioNum, features] of byTerritorio) {
      const rawColor = features[0]?.properties?.['color'] ?? null;
      const color = getColorForTerritorio(territorioNum, rawColor);
      const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };
      const bounds = this.computeBoundsFromFeatures(features);
      cache.set(territorioNum, { fc, color, bounds });
    }

    this.territoryDataCache.set(cache);
  }

  private computeBoundsFromFeatures(features: GeoJSON.Feature[]): L.LatLngBounds {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    for (const f of features) {
      const extended = this.extendBoundsFromGeometry(f.geometry, minLat, maxLat, minLng, maxLng);
      minLat = extended.minLat;
      maxLat = extended.maxLat;
      minLng = extended.minLng;
      maxLng = extended.maxLng;
    }

    return L.latLngBounds(L.latLng(minLat, minLng), L.latLng(maxLat, maxLng));
  }

  private extendBoundsFromGeometry(
    geom: GeoJSON.Geometry | null,
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number
  ): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
    if (!geom) return { minLat, maxLat, minLng, maxLng };

    if (geom.type === 'Polygon') {
      for (const ring of (geom as GeoJSON.Polygon).coordinates) {
        for (const [lng, lat] of ring) {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        }
      }
    } else if (geom.type === 'MultiPolygon') {
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

    return { minLat, maxLat, minLng, maxLng };
  }

  updateVisibleTerritories(): number[] {
    const map = this.map();
    if (!map) return [];

    const mapBounds = map.getBounds().pad(MAP_DEFAULTS.mapBoundsPadFactor);
    const loadedNums = new Set(this.allTerritoriesLayer().map(fl => fl.territorioPadre));
    const newlyLoaded: number[] = [];

    for (const [num, data] of this.territoryDataCache()) {
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
    return newlyLoaded;
  }

  private addTerritoryLayer(territorioNum: number, data: TerritorioCacheData): void {
    const { fc, color, bounds } = data;
    const map = this.map();
    if (!map) return;

    const layer = L.geoJSON(fc, {
      style: () => ({
        fillColor: color,
        fillOpacity: getTerritoryFillOpacity(false),
        opacity: 1,
        color,
        weight: STYLE_DEFAULTS.polygon.weight,
        smoothFactor: STYLE_DEFAULTS.polygon.smoothFactor,
      }),
      onEachFeature: (feature, l) => {
        if (l instanceof L.Polygon) {
          const id = String(feature.properties?.['id'] ?? '');
          const nombreBloque = String(feature.properties?.['nombre_bloque'] ?? '');

          const rings = l.getLatLngs();
          const outer = rings[0] as L.LatLng[];
          let minLat = Infinity;
          let maxLat = -Infinity;
          let minLng = Infinity;
          let maxLng = -Infinity;
          if (outer) {
            for (const pt of outer) {
              if (pt.lat < minLat) minLat = pt.lat;
              if (pt.lat > maxLat) maxLat = pt.lat;
              if (pt.lng < minLng) minLng = pt.lng;
              if (pt.lng > maxLng) maxLng = pt.lng;
            }
          }
          const bbox = { minLat, maxLat, minLng, maxLng };

          this.manzanaIndex.update(idx => [
            ...idx,
            { polygon: l, id, nombreBloque, color, territorioNumero: territorioNum, bbox },
          ]);

          l.on('click', (e: L.LeafletMouseEvent) => {
            this.manzanaClickHandler?.(id, nombreBloque, l, color, territorioNum, e);
          });
        }
      },
    });

    layer.addTo(map);

    if (bounds.isValid()) {
      const center = bounds.getCenter();
      const label = L.marker(center, {
        icon: L.divIcon({
          className: STYLE_DEFAULTS.label.className,
          html: `<span class="territory-label__text">${territorioNum}</span>`,
          iconSize: [...STYLE_DEFAULTS.label.iconSize],
          iconAnchor: [...STYLE_DEFAULTS.label.iconAnchor],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(map);
      this.territoryLabels.update(labels => [...labels, label]);
    }

    this.allTerritoriesLayer.update(layers => [...layers, { territorioPadre: territorioNum, color, layer }]);
  }

  private removeTerritoryLayer(territorioNum: number): void {
    const idx = this.allTerritoriesLayer().findIndex(fl => fl.territorioPadre === territorioNum);
    if (idx < 0) return;

    const fl = this.allTerritoriesLayer()[idx];
    fl.layer.remove();
    this.allTerritoriesLayer.update(layers => layers.filter((_, i) => i !== idx));

    const labelIdx = this.territoryLabels().findIndex(lbl => {
      const el = lbl.getElement();
      if (!el) return false;
      const text = el.querySelector('.territory-label__text')?.textContent;
      return text === String(territorioNum);
    });
    if (labelIdx >= 0) {
      this.territoryLabels()[labelIdx].remove();
      this.territoryLabels.update(labels => labels.filter((_, i) => i !== labelIdx));
    }

    this.manzanaIndex.update(index => index.filter(m => m.territorioNumero !== territorioNum));
  }

  ensureTerritoryLoaded(territorioNum: number): void {
    if (this.allTerritoriesLayer().some(fl => fl.territorioPadre === territorioNum)) return;
    const data = this.territoryDataCache().get(territorioNum);
    if (data) this.addTerritoryLayer(territorioNum, data);
  }

  clearAllLayers(): void {
    for (const fl of this.allTerritoriesLayer()) fl.layer.remove();
    for (const lbl of this.territoryLabels()) lbl.remove();
    this.allTerritoriesLayer.set([]);
    this.territoryLabels.set([]);
    this.manzanaIndex.set([]);
    this.territoryDataCache.set(new Map());
  }

  applyBaseTerritoryStyle(
    territorioNumero: number,
    color: string,
    marcadasCount: number,
    options: { total?: number; isComplete?: boolean } = {}
  ): void {
    const total = options.total ?? this.manzanaIndex().filter(m => m.territorioNumero === territorioNumero).length;
    const isComplete = options.isComplete ?? (total > 0 && marcadasCount >= total);
    // Solo aplicar fillOpacity alto si el territorio está realmente completo.
    // Si no lo está, restablecer al opacity base (0.05) para que solo las manzanas
    // realmente marcadas se resalten (evita pintar todo el territorio como "marcado").
    const fillOpacity = getTerritoryFillOpacity(isComplete);

    for (const mc of this.manzanaIndex()) {
      if (mc.territorioNumero !== territorioNumero) continue;
      mc.polygon.setStyle({ fillColor: color, fillOpacity, opacity: 1, color, weight: STYLE_DEFAULTS.polygon.weight });
    }
  }

  toggleSatellite(): void {
    const map = this.map();
    if (!map) return;

    this.isSatelliteView = !this.isSatelliteView;

    if (this.isSatelliteView) {
      map.removeLayer(this.tileLayer()!);
      this.satelliteLayer()!.addTo(map);
    } else {
      map.removeLayer(this.satelliteLayer()!);
      this.tileLayer()!.addTo(map);
    }
  }

  updateLabelsVisibility(): void {
    const map = this.map();
    if (!map) return;

    const show = map.getZoom() >= MAP_DEFAULTS.labelMinZoom;
    for (const lbl of this.territoryLabels()) {
      lbl.setOpacity(show ? 1 : 0);
    }
  }

  updateLabelsForSelection(seleccionados: Set<number>): void {
    const map = this.map();
    if (!map) return;

    const zoomVisible = map.getZoom() >= MAP_DEFAULTS.labelMinZoom;

    if (seleccionados.size === 0 || !zoomVisible) {
      this.mostrarTodosLosLabels();
      return;
    }

    for (const lbl of this.territoryLabels()) {
      const el = lbl.getElement();
      if (!el) continue;
      const text = el.querySelector('.territory-label__text')?.textContent;
      if (text && seleccionados.has(Number(text))) {
        lbl.setOpacity(1);
      } else {
        lbl.setOpacity(0);
      }
    }
  }

  private mostrarTodosLosLabels(): void {
    const map = this.map();
    if (!map) return;
    const show = map.getZoom() >= MAP_DEFAULTS.labelMinZoom;
    for (const lbl of this.territoryLabels()) lbl.setOpacity(show ? 1 : 0);
  }

  ocultarPoligonosNoSeleccionados(seleccionados: number[]): void {
    const seleccionadosSet = new Set(seleccionados);

    for (const fl of this.allTerritoriesLayer()) {
      if (seleccionadosSet.has(fl.territorioPadre)) continue;

      fl.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          l.setStyle(STYLE_DEFAULTS.hiddenPolygon);
        }
      });
    }

    this.updateLabelsForSelection(seleccionadosSet);
  }

  restaurarVisibilidadPoligonos(manzanasMarcadas: ManzanaMarcada[], territoriosSeleccionados: number[]): void {
    this.cancelPendingStyleUpdates();

    const seleccionadosSet = new Set(territoriosSeleccionados);
    const hayFiltroActivo = seleccionadosSet.size > 0;

    this.queueStyleUpdate(() => {
      for (const fl of this.allTerritoriesLayer()) {
        // Si hay territorios seleccionados y este no está en la lista, mantenerlo oculto.
        if (hayFiltroActivo && !seleccionadosSet.has(fl.territorioPadre)) {
          fl.layer.eachLayer(l => {
            if (l instanceof L.Path) {
              l.setStyle(STYLE_DEFAULTS.hiddenPolygon);
            }
          });
          continue;
        }

        const total = this.manzanaIndex().filter(m => m.territorioNumero === fl.territorioPadre).length;
        const marcadas = manzanasMarcadas.filter(m => m.territorioNumero === fl.territorioPadre).length;
        const isComplete = total > 0 && marcadas >= total;
        const baseOpacity = getTerritoryFillOpacity(isComplete);

        fl.layer.eachLayer(l => {
          if (l instanceof L.Path) {
            l.setStyle({ opacity: 1, fillOpacity: baseOpacity, color: fl.color, weight: STYLE_DEFAULTS.polygon.weight });
          }
        });
      }

      for (const num of territoriosSeleccionados) {
        const featureLayer = this.allTerritoriesLayer().find(f => f.territorioPadre === num);
        if (!featureLayer) continue;

        const marcadas = manzanasMarcadas.filter(m => m.territorioNumero === num);
        for (const m of marcadas) {
          m.layer.setStyle({
            fillColor: featureLayer.color,
            fillOpacity: STYLE_DEFAULTS.markedPolygon.fillOpacity,
            color: featureLayer.color,
            weight: STYLE_DEFAULTS.polygon.weight,
          });
        }
      }

      // Sólo mostrar todos los labels cuando no haya filtro activo (estado limpio).
      // Con filtro, mantener los labels alineados a la selección.
      if (hayFiltroActivo) {
        this.updateLabelsForSelection(seleccionadosSet);
      } else {
        this.mostrarTodosLosLabels();
      }
    });
  }

  queueStyleUpdate(fn: () => void): void {
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

  cancelPendingStyleUpdates(): void {
    if (this.pendingStyleFrame !== null) {
      cancelAnimationFrame(this.pendingStyleFrame);
      this.pendingStyleFrame = null;
    }
    this.pendingStyleQueue = [];
  }

  reaplicarMarcasTerritorio(manzanasMarcadas: ManzanaMarcada[], territorioNumeros: number[]): void {
    for (const num of territorioNumeros) {
      const featureLayer = this.allTerritoriesLayer().find(f => f.territorioPadre === num);
      if (!featureLayer) continue;

      const total = this.manzanaIndex().filter(m => m.territorioNumero === num).length;
      const marcadas = manzanasMarcadas.filter(m => m.territorioNumero === num).length;
      const isComplete = total > 0 && marcadas >= total;
      const fillOpacity = getTerritoryFillOpacity(isComplete);

      featureLayer.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          l.setStyle({
            fillOpacity,
            opacity: 1,
            weight: STYLE_DEFAULTS.polygon.weight,
            fillColor: featureLayer.color,
            color: featureLayer.color,
          });
        }
      });

      const marcadasLayers = manzanasMarcadas.filter(m => m.territorioNumero === num);
      for (const m of marcadasLayers) {
        m.layer.setStyle({
          fillColor: featureLayer.color,
          fillOpacity: STYLE_DEFAULTS.markedPolygon.fillOpacity,
          color: featureLayer.color,
          weight: STYLE_DEFAULTS.polygon.weight,
        });
      }
    }
  }

  prepararCaptura(manzanasMarcadas: ManzanaMarcada[], territoriosSeleccionados: number[]): Promise<void> {
    const map = this.map();
    if (!map) return Promise.resolve();

    const seleccionados = new Set(territoriosSeleccionados);
    const markedLayers = new Set(manzanasMarcadas.map(m => m.layer));

    for (const fl of this.allTerritoriesLayer()) {
      if (!seleccionados.has(fl.territorioPadre)) {
        // Ocultar completamente polígonos y etiquetas de territorios no seleccionados.
        fl.layer.eachLayer(l => {
          if (l instanceof L.Path) {
            l.setStyle(STYLE_DEFAULTS.hiddenPolygon);
          }
        });
        continue;
      }

      // En territorios seleccionados: re-estilar TODAS sus manzanas para que la foto
      // quede consistente sin importar el estado visual previo.
      fl.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          const isMarked = markedLayers.has(l as unknown as L.Path);
          if (isMarked) {
            // Reforzar el estilo de manzana marcada por si venía con opacidad baja
            // o dashed (p.ej. tras haber estado en modo parcial).
            l.setStyle({
              fillColor: fl.color,
              fillOpacity: STYLE_DEFAULTS.markedPolygon.fillOpacity,
              color: fl.color,
              weight: STYLE_DEFAULTS.polygon.weight,
              opacity: 1,
              dashArray: undefined,
            });
          } else {
            // No marcada dentro de un territorio seleccionado: contorno tenue para
            // dar contexto pero sin competir visualmente.
            l.setStyle({
              opacity: 0.6,
              fillOpacity: 0.05,
              color: fl.color,
              weight: 1.5,
              dashArray: undefined,
            });
          }
        }
      });
    }

    // Los polígonos parciales guardados en extraLayers también deben repintarse
    // con su color y opacidad completa para la foto.
    for (const m of manzanasMarcadas) {
      if (!m.id.startsWith('parcial-')) continue;
      const fl = this.allTerritoriesLayer().find(f => f.territorioPadre === m.territorioNumero);
      if (!fl) continue;
      if (m.layer instanceof L.Path) {
        m.layer.setStyle({
          fillColor: fl.color,
          fillOpacity: STYLE_DEFAULTS.partialPolygonComplete.fillOpacity,
          color: fl.color,
          weight: STYLE_DEFAULTS.partialPolygonComplete.weight,
          opacity: 1,
          dashArray: undefined,
        });
      }
    }

    // Ocultar labels de territorios no seleccionados durante la captura.
    for (const lbl of this.territoryLabels()) {
      const el = lbl.getElement();
      if (!el) continue;
      const text = el.querySelector('.territory-label__text')?.textContent;
      const num = text ? Number(text) : NaN;
      lbl.setOpacity(seleccionados.has(num) ? 1 : 0);
    }

    // Calcular bounds abarcando los TERRITORIOS COMPLETOS seleccionados,
    // no sólo las manzanas marcadas. Esto asegura que la foto muestre el
    // territorio íntegro (con sus manzanas circundantes como contexto).
    let combined: L.LatLngBounds | null = null;
    for (const num of seleccionados) {
      const fl = this.allTerritoriesLayer().find(f => f.territorioPadre === num);
      if (!fl) continue;
      const b = fl.layer.getBounds();
      if (b.isValid()) {
        if (!combined) combined = b;
        else combined.extend(b);
      }
    }

    // Fallback: si por algún motivo no hay featureLayers, usar bounds de las marcadas.
    if (!combined) {
      for (const m of manzanasMarcadas) {
        if (m.layer instanceof L.Polygon) {
          const b = m.layer.getBounds();
          if (b.isValid()) {
            if (!combined) combined = b;
            else combined.extend(b);
          }
        }
      }
    }

    if (combined) {
      map.fitBounds(combined, { padding: MAP_DEFAULTS.capturePadding });
    }

    return new Promise(resolve =>
      requestAnimationFrame(() => setTimeout(resolve, MAP_DEFAULTS.captureDelayMs))
    );
  }

  restaurarMapaPostCaptura(
    manzanasMarcadas: ManzanaMarcada[],
    territoriosSeleccionados: number[],
    modoMarcado: string
  ): void {
    const map = this.map();
    if (!map) return;

    const seleccionados = new Set(territoriosSeleccionados);

    for (const fl of this.allTerritoriesLayer()) {
      const total = this.manzanaIndex().filter(m => m.territorioNumero === fl.territorioPadre).length;
      const marcadas = manzanasMarcadas.filter(m => m.territorioNumero === fl.territorioPadre).length;
      const isComplete = total > 0 && marcadas >= total;
      const baseOpacity = getTerritoryFillOpacity(isComplete);

      if (!seleccionados.has(fl.territorioPadre)) {
        const isVisible = modoMarcado === 'none';
        fl.layer.eachLayer(l => {
          if (l instanceof L.Path) {
            l.setStyle({
              opacity: isVisible ? 1 : 0,
              fillOpacity: isVisible ? baseOpacity : 0,
              color: fl.color,
              weight: STYLE_DEFAULTS.polygon.weight,
            });
          }
        });
        continue;
      }

      fl.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          const isMarked = manzanasMarcadas.some(m => m.layer === l);
          if (!isMarked) {
            l.setStyle({ opacity: 1, fillOpacity: baseOpacity, color: fl.color, weight: STYLE_DEFAULTS.polygon.weight });
          }
        }
      });
    }

    let combined: L.LatLngBounds | null = null;
    for (const num of seleccionados) {
      const fl = this.allTerritoriesLayer().find(f => f.territorioPadre === num);
      if (fl) {
        const bounds = fl.layer.getBounds();
        if (bounds.isValid()) {
          if (!combined) combined = bounds;
          else combined.extend(bounds);
        }
      }
    }

    if (combined && combined.isValid()) {
      map.fitBounds(combined, { padding: MAP_DEFAULTS.boundsPadding });
    }

    // Restablecer los labels según el filtro activo (si hay selección) o mostrarlos
    // todos si no hay selección. Coherente con el flujo post-parcial.
    if (seleccionados.size > 0) {
      this.updateLabelsForSelection(seleccionados);
    } else {
      this.mostrarTodosLosLabels();
    }
  }

  limpiarMarcasVisuales(): void {
    for (const fl of this.allTerritoriesLayer()) {
      fl.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          l.setStyle({
            fillColor: fl.color,
            fillOpacity: STYLE_DEFAULTS.polygon.fillOpacity,
            color: fl.color,
            weight: STYLE_DEFAULTS.polygon.weight,
            opacity: 1,
          });
        }
      });
    }
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
      }).addTo(this.map()!);
      this.poligonoParcial.set(polygon);
    }

    this.agregarMarkersParciales(puntos, onMarkerDrag);
  }

  private buildContourPolygon(puntos: SnappedPoint[], manzanaEdges: Edge[]): L.LatLng[] {
    const map = this.map();
    if (!map || puntos.length === 0) return [];
    if (puntos.length === 1) return [puntos[0].latlng];

    // 1. Trazar el arco de contorno entre puntos consecutivos (recorre el borde de la manzana).
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

    // 2. Cerrar el polígono con LÍNEA RECTA entre el último punto y el primero (cuña).
    //    Esto rellena una porción del interior de la manzana en vez de trazar solo el borde.
    if (puntos.length >= 2 && result.length > 0) {
      const first = result[0];
      const last = result[result.length - 1];
      if (latLngDist(last, first, map) > 1) {
        // El polígono se cerrará automáticamente al pintarlo (Leaflet cierra el ring).
        // No agregamos el primero explícitamente para no duplicarlo.
      }
    }

    // 3. Intersectar el polígono resultante con la manzana seleccionada
    //    para garantizar que nunca se salga del contorno padre.
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
      // Convertir el polígono del usuario a formato polygon-clipping: [ [ [lng,lat], ... ] ]
      const subject: [number, number][] = polygon.map(p => [p.lng, p.lat]);
      // Cerrar el ring
      if (subject.length > 0 && (subject[0][0] !== subject[subject.length - 1][0] ||
          subject[0][1] !== subject[subject.length - 1][1])) {
        subject.push([subject[0][0], subject[0][1]]);
      }

      // Reconstruir el contorno de la manzana desde los edges
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

      // Tomar el ring exterior del primer polígono resultado
      const outerRing = intersection[0][0];
      if (!outerRing || outerRing.length < 3) return polygon;

      return outerRing.map(([lng, lat]) => ({ lat, lng } as L.LatLng));
    } catch {
      return polygon;
    }
  }

  private agregarMarkersParciales(puntos: SnappedPoint[], onMarkerDrag: (index: number, marker: L.Marker) => void): void {
    const map = this.map();
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
    this.markersParciales.set(markers);
  }

  updatePartialPolygonLatLngs(latlngs: L.LatLngExpression[], currentTerritoryColor: string): void {
    const map = this.map();
    if (!map) return;

    if (this.poligonoParcial()) {
      if (latlngs.length >= 2) {
        this.poligonoParcial()!.setLatLngs(latlngs);
      } else {
        map.removeLayer(this.poligonoParcial()!);
        this.poligonoParcial.set(null);
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
      this.poligonoParcial.set(polygon);
    }
  }

  limpiarCapasParciales(): void {
    if (this.poligonoParcial()) {
      this.map()?.removeLayer(this.poligonoParcial()!);
      this.poligonoParcial.set(null);
    }
    for (const m of this.markersParciales()) {
      this.map()?.removeLayer(m);
    }
    this.markersParciales.set([]);
  }

  getPoligonoParcial(): L.Polygon | null {
    return this.poligonoParcial();
  }

  clearPoligonoParcialRef(): void {
    this.poligonoParcial.set(null);
  }

  addExtraLayer(layer: L.Layer): void {
    this.extraLayers.update(layers => [...layers, layer]);
  }

  removeExtraLayer(layer: L.Layer): void {
    this.extraLayers.update(layers => layers.filter(l => l !== layer));
    this.map()?.removeLayer(layer);
  }

  clearExtraLayers(): void {
    for (const l of this.extraLayers()) {
      this.map()?.removeLayer(l);
    }
    this.extraLayers.set([]);
  }

  setCurrentTerritoryColor(color: string): void {
    this.currentTerritoryColor.set(color);
  }

  getManzanaIndex(): ManzanaIndex[] {
    return this.manzanaIndex();
  }

  getAllTerritoriesLayer(): FeatureLayer[] {
    return this.allTerritoriesLayer();
  }

  getTerritoryDataCache(): Map<number, TerritorioCacheData> {
    return this.territoryDataCache();
  }

  getCurrentTerritoryColor(): string {
    return this.currentTerritoryColor();
  }

  destroy(): void {
    this.cancelPendingStyleUpdates();
    this.themeObserver?.disconnect();
    this.clearAllLayers();
    this.clearExtraLayers();
    this.limpiarCapasParciales();
    this.map()?.remove();
    this.map.set(null);
    this.tileLayer.set(null);
    this.satelliteLayer.set(null);
  }
}
