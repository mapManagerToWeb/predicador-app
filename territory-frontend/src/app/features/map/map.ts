import {
  Component,
  OnDestroy,
  inject,
  afterNextRender,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import type { MapGeoJSONFeature, MapLayerMouseEvent, MapLayerTouchEvent } from 'maplibre-gl';
import { Toast } from '../../core/services/toast';
import { TerritorySearch } from './territory-search/territory-search';
import { MapStateService } from './services/map-state.service';
import { MapRenderingFacade } from './services/map-rendering.facade';
import { MapSelectionService } from './services/map-selection.service';
import { MapPickingService } from './services/map-picking.service';
import { MapVectorTileService } from './services/map-vector-tile.service';
import { MapLabelLayerService } from './services/map-label-layer.service';
import { TileVersionService } from './services/tile-version.service';
import { MapInitializationService } from './services/map-initialization.service';
import { MapLocationService } from './services/map-location.service';
import { MapMarkedOverlayService } from './services/map-marked-overlay.service';
import { MapPartialMarkService } from './services/map-partial-mark.service';
import { MapDataPersistenceService } from './services/map-data-persistence.service';
import { MAP_DEFAULTS, TOAST_MESSAGES } from './utils/map-constants';
import type { ModoMarcado } from './types/map.types';
import type { MapEngine } from './services/map-engine.interface';
import type { LatLng } from './map-geometry';
import { snapToContour } from './map-geometry';
import { createMapLibreProjectionAdapter } from './services/map-libre-projection-adapter';

@Component({
  selector: 'app-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TerritorySearch],
  templateUrl: './map.html',
  styleUrl: './map.css',
})
export class MapPage implements OnDestroy {
  private readonly state = inject(MapStateService);
  private readonly rendering = inject(MapRenderingFacade);
  private readonly selection = inject(MapSelectionService);
  private readonly initialization = inject(MapInitializationService);
  private readonly partialMark = inject(MapPartialMarkService);
  private readonly dataPersistence = inject(MapDataPersistenceService);
  private readonly location = inject(MapLocationService);
  private readonly picking = inject(MapPickingService);
  private readonly vectorTile = inject(MapVectorTileService);
  private readonly labelLayer = inject(MapLabelLayerService);
  private readonly markedOverlay = inject(MapMarkedOverlayService);
  private readonly tileVersion = inject(TileVersionService);
  private readonly toastService = inject(Toast);

  /** Active MapLibre engine instance. */
  private readonly maplibreEngine = signal<MapEngine | null>(null);

  /** Bound handler references for cleanup on destroy. */
  private maplibreClickHandler: ((e: MapLayerMouseEvent | MapLayerTouchEvent) => void) | null = null;
  private maplibreMoveHandler: ((e: MapLayerMouseEvent | MapLayerTouchEvent) => void) | null = null;
  private maplibreErrorHandler: (() => void) | null = null;

  manzanasCount = this.state.manzanasCount;
  totalManzanas = this.state.totalManzanas;
  territorioSeleccionado = this.state.territorioSeleccionado;
  territoriosSeleccionados = this.state.territoriosSeleccionados;
  tieneTerritorio = this.state.tieneTerritorio;
  modoMarcado = this.state.modoMarcado;
  puntosParciales = this.state.puntosParciales;
  puntosCount = this.state.puntosCount;
  puedeConfirmar = this.state.puedeConfirmar;
  enviando = this.state.enviando;
  isLoading = this.state.isLoading;
  isSatellite = this.state.isSatellite;
  predicacion = this.state.predicacion;
  screenshotPreview = this.state.screenshotPreview;
  locationStatus = this.location.status;

  constructor() {
    afterNextRender(() => this.initMap());
  }

  private initMap(): void {
    const el = document.getElementById('map');
    if (!el) return;
    void this.initMaplibre(el);
  }

  private async initMaplibre(el: HTMLElement): Promise<void> {
    const { MaplibreEngineService } = await import('./services/maplibre-engine.service');
    const engine = new MaplibreEngineService();

    const tileUrl = '/api/v1/territories/tiles/{z}/{x}/{y}.pbf';
    await engine.init(el, {
      center: [MAP_DEFAULTS.initialView.lng, MAP_DEFAULTS.initialView.lat],
      zoom: MAP_DEFAULTS.initialZoom,
      maxZoom: MAP_DEFAULTS.maxZoom,
      tileUrl,
    });

    this.maplibreEngine.set(engine);

    // Initialize vector tile layers (fill, line)
    this.vectorTile.initLayers(engine);
    this.rendering.attachEngine(engine);

    // Start version-aware refresh polling
    this.tileVersion.startPolling(engine);

    // Load territory metadata (colors, GeoJSON snapshot) and restore marks,
    // then initialize the marked overlay and labels from the snapshot
    // (Leaflet parity: marked manzanas get a distinct fill + 3px stroke
    // under the territory-number labels, which are filtered to selection).
    await this.initialization.loadAllTerritoriesPublic();
    this.rendering.initMarkedOverlay(engine);
    this.labelLayer.initLabels(engine);
    this.labelLayer.updateLabels(engine, this.state.territoriosSeleccionados());
    // Apply completion opacity (0.6 complete / 0.05 incomplete) and the
    // marked overlay from the restored marks.
    this.rendering.refreshMarksVisual();

    // ─── F3.3: GPU Picking — register MapLibre event handlers ────
    this.maplibreClickHandler = (e: MapLayerMouseEvent | MapLayerTouchEvent) =>
      this.handleMaplibreClick(e);
    this.maplibreMoveHandler = (e: MapLayerMouseEvent | MapLayerTouchEvent) =>
      this.handleMaplibreHover(e);
    engine.on('click', this.maplibreClickHandler);
    engine.on('mousemove', this.maplibreMoveHandler);
    // Tile resilience (F7 parity): recover from 500/503 tile bursts by
    // forcing a cache-busted tile refresh (throttled inside TileVersionService).
    this.maplibreErrorHandler = () => this.tileVersion.handleTileError();
    engine.on('error', this.maplibreErrorHandler);
  }


  async onTerritorioSeleccionado(numeros: number[]): Promise<void> {
    // Bloquear cambio de territorio mientras un modo de marcado está activo
    if (numeros.length > 0 && this.modoMarcado() !== 'none') {
      this.toastService.show(TOAST_MESSAGES.territoryLock);
      return;
    }

    // Si se recibe un array vacío, limpiar selección y restaurar visibilidad
    if (numeros.length === 0) {
      this.selection.limpiarMarcas();
      this.syncLabels();
      return;
    }

    const numsAConsiderar = this.selection.prepareTerritorioSeleccionado(numeros);

    // Parallel DB restoration — avoids sequential awaits for multi-territory selection
    await Promise.all(
      numsAConsiderar.map(numero => {
        const featureLayer = this.rendering.getFeatureLayerByTerritorio(numero);
        if (!featureLayer) return Promise.resolve();
        return this.selection.restaurarMarcadoDesdeDB(numero, featureLayer.color, { actualizarEstadoMarcado: true });
      })
    );

    this.syncLabels();
  }

  /** Reflect the current selection on the label layer (territory numbers). */
  private syncLabels(): void {
    const engine = this.maplibreEngine();
    if (!engine) return;
    this.labelLayer.updateLabels(engine, this.state.territoriosSeleccionados());
  }


  // ─── F3.3: MapLibre picking handlers ───────────────────────────

  private handleMaplibreClick(e: MapLayerMouseEvent | MapLayerTouchEvent): void {
    const engine = this.maplibreEngine();
    if (!engine) return;

    const point: [number, number] = 'point' in e
      ? [e.point.x, e.point.y]
      : this.getTouchPoint(e as MapLayerTouchEvent);
    const feature = this.picking.queryAt(point, engine);
    if (!feature) return;

    const modo = this.state.modoMarcado();
    const territorioNumero = this.extractTerritorioNumero(feature);
    const manzanaId = this.extractManzanaId(feature);
    const nombreBloque = this.extractNombreBloque(feature);

    if (modo === 'none') {
      this.handleMaplibreModoNone(feature, territorioNumero, manzanaId, nombreBloque);
    } else if (modo === 'completa') {
      this.handleMaplibreModoCompleta(feature, territorioNumero, manzanaId, nombreBloque);
    } else if (modo === 'parcial') {
      this.handleMaplibreModoParcial(
        e.lngLat as LatLng,
        feature,
        territorioNumero,
        manzanaId,
        nombreBloque,
      );
    }
  }

  private handleMaplibreModoNone(
    feature: MapGeoJSONFeature,
    territorioNumero: number,
    manzanaId: string,
    nombreBloque: string,
  ): void {
    // Extract color from tile feature properties
    const featureColor = (feature.properties?.['color'] as string) ?? '';

    if (this.state.manzanasById().has(manzanaId)) {
      // Leaflet parity (F8): clicking an already-marked manzana in default
      // mode TOGGLES it off instead of just selecting it.
      this.selection.toggleManzanaById(manzanaId, nombreBloque, featureColor, territorioNumero);
      this.syncLabels();
    } else {
      // Set the territory color from the tile feature for marking mode
      this.rendering.setCurrentTerritoryColor(featureColor);
      void this.handleTerritorySelection(territorioNumero);
    }
  }

  private handleMaplibreModoCompleta(
    feature: MapGeoJSONFeature,
    territorioNumero: number,
    manzanaId: string,
    nombreBloque: string,
  ): void {
    if (!this.state.territoriosSeleccionados().includes(territorioNumero)) {
      this.toastService.show(TOAST_MESSAGES.territoryLock);
      return;
    }
    if (this.state.manzanasById().has(manzanaId)) return;
    const color = this.state.currentTerritoryColor();
    this.selection.marcarManzanaById(manzanaId, nombreBloque, color, territorioNumero);
  }

  private handleMaplibreModoParcial(
    latlng: LatLng,
    feature: MapGeoJSONFeature,
    territorioNumero: number,
    manzanaId: string,
    nombreBloque: string,
  ): void {
    if (!this.state.territoriosSeleccionados().includes(territorioNumero)) {
      this.toastService.show(TOAST_MESSAGES.territoryLock);
      return;
    }
    if (this.state.manzanasById().has(manzanaId)) return;

    const engine = this.maplibreEngine();
    if (!engine) return;

    if (!this.state.manzanaSeleccionadaTerritorio()) {
      // First tap: anchor the draw on this manzana (load its territory
      // geometry for contour snapping — Leaflet parity F6).
      const featureColor = (feature.properties?.['color'] as string) ?? this.state.currentTerritoryColor();
      void this.partialMark.iniciarDibujo(manzanaId, nombreBloque, featureColor, territorioNumero, engine);
    } else {
      // Subsequent taps: snap to the active manzana contour and add a
      // partial-draw point (max 6, with live preview).
      const adapter = createMapLibreProjectionAdapter(engine);
      const snapped = snapToContour(latlng, this.state.manzanaEdges(), adapter);
      this.partialMark.agregarPunto(snapped);
    }
  }

  private handleMaplibreHover(e: MapLayerMouseEvent | MapLayerTouchEvent): void {
    const engine = this.maplibreEngine();
    if (!engine) return;

    const point: [number, number] = 'point' in e
      ? [e.point.x, e.point.y]
      : this.getTouchPoint(e as MapLayerTouchEvent);
    const feature = this.picking.queryAt(point, engine);

    // Change cursor to pointer when hovering over a feature
    const container = engine as unknown as { getContainer?: () => HTMLElement };
    const mapContainer = container.getContainer?.();
    if (mapContainer) {
      mapContainer.style.cursor = feature ? 'pointer' : '';
    }
  }

  private extractTerritorioNumero(feature: MapGeoJSONFeature): number {
    const val = feature.properties?.['tid'] ?? feature.properties?.['territorio'];
    const n = typeof val === 'number' ? val : Number(val);
    return Number.isFinite(n) ? n : 0;
  }

  private extractManzanaFid(feature: MapGeoJSONFeature): number | null {
    const val = feature.properties?.['fid'] ?? feature.id;
    const n = typeof val === 'number' ? val : Number(val);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  private extractManzanaId(feature: MapGeoJSONFeature): string {
    const fid = this.extractManzanaFid(feature);
    return fid !== null ? String(fid) : '';
  }

  private extractNombreBloque(feature: MapGeoJSONFeature): string {
    const val = feature.properties?.['bloque'] ?? feature.properties?.['nombre'] ?? feature.properties?.['nombreBloque'];
    return typeof val === 'string' ? val : '';
  }

  private getTouchPoint(e: MapLayerTouchEvent): [number, number] {
    const touch = (e.originalEvent as TouchEvent).changedTouches?.[0];
    return touch ? [touch.clientX, touch.clientY] : [0, 0];
  }

  private async handleTerritorySelection(territorioNumero: number): Promise<void> {
    const current = this.state.territoriosSeleccionados();
    let numeros: number[];

    if (current.includes(territorioNumero)) {
      numeros = current.filter(n => n !== territorioNumero);
    } else if (current.length > 0) {
      numeros = [...current, territorioNumero];
    } else {
      numeros = [territorioNumero];
    }

    await this.onTerritorioSeleccionado(numeros);
  }


  toggleSatellite(): void {
    const engine = this.maplibreEngine();
    if (!engine) return;

    const newSatellite = !this.isSatellite();
    this.state.isSatellite.set(newSatellite);

    // Switch the basemap between OSM light and ArcGIS satellite
    const basemapTiles = newSatellite
      ? ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}']
      : [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ];
    const basemapAttribution = newSatellite
      ? '© Esri, Maxar, Earthstar Geographics'
      : '© OpenStreetMap contributors';

    // Remove old basemap, add new one
    engine.removeLayer('basemap-layer');
    engine.removeSource('basemap');
    engine.addSource('basemap', basemapTiles, basemapAttribution);

    // Insert basemap BELOW the first territory layer so territories render on top
    engine.addLayer({ id: 'basemap-layer', type: 'raster', source: 'basemap' }, 'territory-fill');
  }

  toggleUbicacion(): void {
    this.location.toggle();
  }

  onPredicacionChange(event: Event): void {
    this.state.predicacion.set((event.target as HTMLSelectElement).value);
  }

  setModoMarcado(modo: ModoMarcado): void {
    this.selection.setModoMarcado(modo);
  }

  toggleModoCompleto(): void {
    this.setModoMarcado(this.modoMarcado() === 'completa' ? 'none' : 'completa');
  }

  deshacerPunto(): void {
    this.partialMark.deshacerPunto();
  }

  finalizarParcial(): void {
    this.partialMark.finalizarParcial();
  }

  cancelarParcial(): void {
    this.partialMark.cancelarParcial();
  }

  async guardarEnBaseDeDatos(): Promise<void> {
    await this.dataPersistence.guardarEnBaseDeDatos();
  }

  limpiarMarcas(): void {
    this.selection.limpiarMarcas();
    this.syncLabels();
  }

  async guardarYEnviar(): Promise<void> {
    await this.dataPersistence.guardarYEnviar();
  }

  limpiarTodo(): void {
    const hasData = this.state.manzanasById().size > 0 || this.state.territoriosSeleccionados().length > 0;
    this.limpiarMarcas();

    const mlEngine = this.maplibreEngine();
    if (mlEngine) {
      this.picking.clearHighlight(mlEngine);
      mlEngine.setCenter([MAP_DEFAULTS.initialView.lng, MAP_DEFAULTS.initialView.lat]);
      mlEngine.setZoom(MAP_DEFAULTS.initialZoom);
    }

    if (hasData) {
      void this.initialization.reloadAllTerritories();
    }
  }

  ngOnDestroy(): void {
    this.location.destroy();
    this.tileVersion.stopPolling();
    const mlEngine = this.maplibreEngine();
    if (mlEngine) {
      this.labelLayer.destroy(mlEngine);
      this.vectorTile.destroy(mlEngine);
      // Per-engine resources must be torn down so the overlay re-initializes
      // on the next map visit (root singleton, idempotent init otherwise
      // skips the fresh engine and marks silently vanish).
      this.markedOverlay.destroy(mlEngine);
      if (this.maplibreClickHandler) {
        mlEngine.off('click', this.maplibreClickHandler);
        this.maplibreClickHandler = null;
      }
      if (this.maplibreMoveHandler) {
        mlEngine.off('mousemove', this.maplibreMoveHandler);
        this.maplibreMoveHandler = null;
      }
      if (this.maplibreErrorHandler) {
        mlEngine.off('error', this.maplibreErrorHandler);
        this.maplibreErrorHandler = null;
      }
      mlEngine.destroy();
      this.maplibreEngine.set(null);
    }
  }
}
