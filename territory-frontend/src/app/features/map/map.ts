import {
  Component,
  OnDestroy,
  inject,
  afterNextRender,
  ChangeDetectionStrategy,
  signal,
  PLATFORM_ID,
} from '@angular/core';
import { type LeafletMouseEvent, Polygon as LeafletPolygon } from 'leaflet';
import type { MapGeoJSONFeature, MapLayerMouseEvent, MapLayerTouchEvent } from 'maplibre-gl';
import { Toast } from '../../core/services/toast';
import { TerritorySearch } from './territory-search/territory-search';
import { MapStateService } from './services/map-state.service';
import { MapRenderingFacade } from './services/map-rendering.facade';
import { MapInteractionService } from './services/map-interaction.service';
import { MapSelectionService } from './services/map-selection.service';
import { MapPickingService } from './services/map-picking.service';
import { MapInitializationService } from './services/map-initialization.service';
import { MapLocationService } from './services/map-location.service';
import { MapPartialMarkService } from './services/map-partial-mark.service';
import { MapDataPersistenceService } from './services/map-data-persistence.service';
import { MAP_DEFAULTS, TOAST_MESSAGES } from './utils/map-constants';
import type { ModoMarcado } from './types/map.types';
import type { MapEngine } from './services/map-engine.interface';
import { shouldUseMapLibre, createMaplibreEngine } from './services/map-engine.factory';

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
  private readonly interaction = inject(MapInteractionService);
  private readonly selection = inject(MapSelectionService);
  private readonly initialization = inject(MapInitializationService);
  private readonly partialMark = inject(MapPartialMarkService);
  private readonly dataPersistence = inject(MapDataPersistenceService);
  private readonly location = inject(MapLocationService);
  private readonly picking = inject(MapPickingService);
  private readonly toastService = inject(Toast);
  private readonly platformId = inject(PLATFORM_ID);

  /** Active MapLibre engine instance (null when using Leaflet). */
  private readonly maplibreEngine = signal<MapEngine | null>(null);

  /** Bound handler references for cleanup on destroy. */
  private maplibreClickHandler: ((e: MapLayerMouseEvent | MapLayerTouchEvent) => void) | null = null;
  private maplibreMoveHandler: ((e: MapLayerMouseEvent | MapLayerTouchEvent) => void) | null = null;

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

    const engineChoice = this.state.mapEngine();

    if (shouldUseMapLibre(engineChoice)) {
      // ─── MapLibre path (F3.1: init only, no rendering yet) ─────
      void this.initMaplibre(el);
    } else {
      // ─── Leaflet path (unchanged — safe rollback) ────────────────
      void this.initialization.initialize(
        el,
        (e: LeafletMouseEvent) => this.onMapClick(e),
      );
    }
  }

  private async initMaplibre(el: HTMLElement): Promise<void> {
    const engine = await createMaplibreEngine(this.platformId);

    const tileUrl = '/api/v1/territories/tiles/{z}/{x}/{y}.pbf';
    await engine.init(el, {
      center: [MAP_DEFAULTS.initialView.lng, MAP_DEFAULTS.initialView.lat],
      zoom: MAP_DEFAULTS.initialZoom,
      maxZoom: MAP_DEFAULTS.maxZoom,
      tileUrl,
    });

    this.maplibreEngine.set(engine);

    // ─── F3.3: GPU Picking — register MapLibre event handlers ────
    this.maplibreClickHandler = (e: MapLayerMouseEvent | MapLayerTouchEvent) =>
      this.handleMaplibreClick(e);
    this.maplibreMoveHandler = (e: MapLayerMouseEvent | MapLayerTouchEvent) =>
      this.handleMaplibreHover(e);
    engine.on('click', this.maplibreClickHandler);
    engine.on('mousemove', this.maplibreMoveHandler);
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
      this.rendering.restaurarVisibilidadPoligonos(this.state.manzanasMarcadaList(), []);
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

    // Ocultar territorios no seleccionados tras la selección
    this.rendering.ocultarPoligonosNoSeleccionados(this.state.territoriosSeleccionados());
  }

  private onMapClick(e: LeafletMouseEvent): void {
    const result = this.interaction.handleMapClick(e);

    switch (result.action) {
      case 'remove_partial':
        if (result.partialId) this.partialMark.eliminarParcial(result.partialId);
        break;
      case 'toggle_manzana':
        if (result.manzana) {
          const m = result.manzana;
          this.selection.toggleManzana(m.id, m.nombreBloque, m.polygon, m.color, m.territorioNumero);
        }
        break;
      case 'select_territory':
        if (result.manzana) {
          void this.handleTerritorySelection(result.manzana.territorioNumero);
        }
        break;
      case 'select_manzana':
        if (result.manzana) {
          this.selection.seleccionarManzana(
            result.manzana.polygon,
            result.manzana.color,
            result.manzana.nombreBloque,
            result.manzana.territorioNumero
          );
          this.toastService.show(TOAST_MESSAGES.selectManzana(result.manzana.nombreBloque));
        } else {
          this.toastService.show(TOAST_MESSAGES.noNearbyManzana);
        }
        break;
      case 'add_partial_point':
        if (result.snappedPoint) this.partialMark.agregarPunto(result.snappedPoint);
        break;
      case 'none':
        if (this.state.modoMarcado() === 'parcial' && this.state.puntosCount() >= 6) {
          this.toastService.show(TOAST_MESSAGES.maxPoints);
        }
        break;
    }
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
      this.handleMaplibreModoParcial(feature, territorioNumero, manzanaId, nombreBloque);
    }
  }

  private handleMaplibreModoNone(
    feature: MapGeoJSONFeature,
    territorioNumero: number,
    manzanaId: string,
    nombreBloque: string,
  ): void {
    if (this.state.manzanasById().has(manzanaId)) {
      this.picking.clearHighlight(this.maplibreEngine()!, manzanaId);
      this.selection.toggleManzana(manzanaId, nombreBloque, new LeafletPolygon([]), '', territorioNumero);
    } else {
      this.picking.highlightFeature(this.maplibreEngine()!, manzanaId);
      void this.handleTerritorySelection(territorioNumero);
    }
  }

  private handleMaplibreModoCompleta(
    _feature: MapGeoJSONFeature,
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
    this.picking.highlightFeature(this.maplibreEngine()!, manzanaId);
    this.selection.marcarManzana(manzanaId, nombreBloque, new LeafletPolygon([]), color, territorioNumero);
  }

  private handleMaplibreModoParcial(
    _feature: MapGeoJSONFeature,
    territorioNumero: number,
    manzanaId: string,
    nombreBloque: string,
  ): void {
    if (!this.state.territoriosSeleccionados().includes(territorioNumero)) {
      this.toastService.show(TOAST_MESSAGES.territoryLock);
      return;
    }
    if (this.state.manzanasById().has(manzanaId)) return;

    if (!this.state.manzanaSeleccionadaTerritorio()) {
      this.picking.highlightFeature(this.maplibreEngine()!, manzanaId);
      this.selection.seleccionarManzana(
        new LeafletPolygon([]), '', nombreBloque, territorioNumero,
      );
    }
    // Partial point snapping for MapLibre is deferred to F3.4 (hybrid edit mode).
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
    const val = feature.properties?.['territorioNumero'] ?? feature.properties?.['territorio'];
    return typeof val === 'number' ? val : 0;
  }

  private extractManzanaId(feature: MapGeoJSONFeature): string {
    const val = feature.properties?.['id'] ?? feature.id;
    return String(val ?? '');
  }

  private extractNombreBloque(feature: MapGeoJSONFeature): string {
    const val = feature.properties?.['nombre'] ?? feature.properties?.['nombreBloque'];
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
    this.rendering.toggleSatellite();
    this.state.isSatellite.set(this.rendering.isSatellite());
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

  prepararCaptura(): Promise<void> {
    return this.dataPersistence.prepararCaptura();
  }

  restaurarMapaPostCaptura(): void {
    this.dataPersistence.restaurarMapaPostCaptura();
  }

  limpiarMarcas(): void {
    this.selection.limpiarMarcas();
  }

  async guardarYEnviar(): Promise<void> {
    await this.dataPersistence.guardarYEnviar();
  }

  limpiarTodo(): void {
    const hasData = this.state.manzanasById().size > 0 || this.state.territoriosSeleccionados().length > 0;
    this.limpiarMarcas();

    // Volver a la vista de territorios (mapa inicial sin selección).
    const mlEngine = this.maplibreEngine();
    if (mlEngine) {
      // F3.3: Clear all GPU feature-state highlights
      this.picking.clearHighlight(mlEngine);
      mlEngine.setCenter([MAP_DEFAULTS.initialView.lng, MAP_DEFAULTS.initialView.lat]);
      mlEngine.setZoom(MAP_DEFAULTS.initialZoom);
    } else {
      this.rendering.getMap()?.setView(MAP_DEFAULTS.initialView, MAP_DEFAULTS.initialZoom);
    }

    if (hasData) {
      void this.initialization.reloadAllTerritories();
    }
  }

  ngOnDestroy(): void {
    this.location.destroy();
    const mlEngine = this.maplibreEngine();
    if (mlEngine) {
      // F3.3: Clean up MapLibre event handlers before destroying the engine
      if (this.maplibreClickHandler) {
        mlEngine.off('click', this.maplibreClickHandler);
        this.maplibreClickHandler = null;
      }
      if (this.maplibreMoveHandler) {
        mlEngine.off('mousemove', this.maplibreMoveHandler);
        this.maplibreMoveHandler = null;
      }
      mlEngine.destroy();
      this.maplibreEngine.set(null);
    } else {
      this.rendering.cancelPendingStyleUpdates();
      this.rendering.destroy();
    }
  }
}
