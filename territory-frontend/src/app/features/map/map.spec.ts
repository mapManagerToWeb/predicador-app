import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapPage } from './map';
import { elegirUltimoReporte } from './utils/report-utils';
import { getTerritoryFillOpacity } from '../../core/models/territory-colors';
import type { Reporte } from '../../core/models/models';
import { MapStateService } from './services/map-state.service';
import { MapRenderingFacade } from './services/map-rendering.facade';
import { MapSelectionService } from './services/map-selection.service';
import { MapInitializationService } from './services/map-initialization.service';
import { MapPartialMarkService } from './services/map-partial-mark.service';
import { MapDataPersistenceService } from './services/map-data-persistence.service';
import { MapMarkedOverlayService } from './services/map-marked-overlay.service';
import { MapGpsFollowService } from './services/map-gps-follow.service';
import { MapPickingService } from './services/map-picking.service';
import { MapVectorTileService } from './services/map-vector-tile.service';
import { MapLabelLayerService } from './services/map-label-layer.service';
import { TileVersionService } from './services/tile-version.service';
import { MapCanvasCaptureService } from './services/map-canvas-capture.service';
import { MapLocationService } from './services/map-location.service';
import { MAP_DEFAULTS, TOAST_MESSAGES } from './utils/map-constants';
import { Toast } from '../../core/services/toast';
import type { MapEngine } from './services/map-engine.interface';
import type { MapGeoJSONFeature, MapLayerMouseEvent, MapLayerTouchEvent } from 'maplibre-gl';

// `map.ts` boots the engine via a dynamic `import('./services/maplibre-engine.service')`
// (WebGL is unavailable in jsdom), so the module is replaced with a shared mock
// instance. Tests reach the registered handlers through `engine.on(...)` calls.
const engineMock = vi.hoisted(() => ({
  engine: {
    init: vi.fn(() => Promise.resolve()),
    addSource: vi.fn(),
    addGeoJsonSource: vi.fn(),
    updateGeoJsonSourceData: vi.fn(),
    project: vi.fn(() => ({ x: 0, y: 0 })),
    removeSource: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    setSourceUrl: vi.fn(),
    queryRenderedFeatures: vi.fn(() => []),
    on: vi.fn(),
    off: vi.fn(),
    fitBounds: vi.fn(),
    getZoom: vi.fn(() => 15),
    setZoom: vi.fn(),
    getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
    setCenter: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    setFeatureState: vi.fn(),
    removeFeatureState: vi.fn(),
    captureCanvas: vi.fn(() => Promise.resolve(null)),
    getContainer: undefined as (() => HTMLElement | undefined) | undefined,
  },
}));

vi.mock('./services/maplibre-engine.service', () => ({
  MaplibreEngineService: function MaplibreEngineService() {
    return engineMock.engine;
  },
}));

describe('elegirUltimoReporte', () => {
  it('should choose the most recent report by session time', () => {
    const reportes: Reporte[] = [
      {
        id: 1,
        manzanaId: null,
        fecha: '2024-01-01',
        encargadoId: 1,
        encargadoNombre: 'Ana',
        encargadoApellido: 'Pérez',
        sessionTime: '2024-01-01T10:00:00.000Z',
        estado: 'incomplete',
        territorioNumero: 1,
        totalManzanas: 10,
        manzanasMarcadas: 2,
        tipoSesion: 'parcial',
        geometriaParcial: null,
        puntosParciales: null,
        manzanasIds: null
      },
      {
        id: 2,
        manzanaId: null,
        fecha: '2024-01-02',
        encargadoId: 1,
        encargadoNombre: 'Ana',
        encargadoApellido: 'Pérez',
        sessionTime: '2024-01-02T12:00:00.000Z',
        estado: 'completed',
        territorioNumero: 1,
        totalManzanas: 10,
        manzanasMarcadas: 10,
        tipoSesion: 'completa',
        geometriaParcial: null,
        puntosParciales: null,
        manzanasIds: '1,2,3'
      }
    ];

    const ultimo = elegirUltimoReporte(reportes);

    expect(ultimo?.id).toBe(2);
    expect(ultimo?.manzanasIds).toBe('1,2,3');
  });

  it('should return null when report list is empty', () => {
    expect(elegirUltimoReporte([])).toBeNull();
  });
});

describe('getTerritoryFillOpacity', () => {
  it('should return slightly reduced opacity for complete territories', () => {
    expect(getTerritoryFillOpacity(true)).toBe(0.6);
  });

  it('should return low opacity for incomplete territories', () => {
    expect(getTerritoryFillOpacity(false)).toBe(0.45);
  });
});

describe('MapPage', () => {
  let component: MapPage;
  let fixture: ComponentFixture<MapPage>;
  let state: MapStateService;
  let selection: {
    prepareTerritorioSeleccionado: ReturnType<typeof vi.fn>;
    restaurarMarcadoDesdeDB: ReturnType<typeof vi.fn>;
    limpiarMarcas: ReturnType<typeof vi.fn>;
    setModoMarcado: ReturnType<typeof vi.fn>;
  };
  let initialization: { reloadAllTerritories: ReturnType<typeof vi.fn> };
  let partialMark: {
    deshacerPunto: ReturnType<typeof vi.fn>;
    finalizarParcial: ReturnType<typeof vi.fn>;
    cancelarParcial: ReturnType<typeof vi.fn>;
    limpiarDibujo: ReturnType<typeof vi.fn>;
  };
  let dataPersistence: {
    guardarEnBaseDeDatos: ReturnType<typeof vi.fn>;
    guardarYEnviar: ReturnType<typeof vi.fn>;
  };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    selection = {
      prepareTerritorioSeleccionado: vi.fn(),
      restaurarMarcadoDesdeDB: vi.fn().mockResolvedValue(undefined),
      limpiarMarcas: vi.fn(),
      setModoMarcado: vi.fn(),
    };
    initialization = { reloadAllTerritories: vi.fn().mockResolvedValue(undefined) };
    partialMark = { deshacerPunto: vi.fn(), finalizarParcial: vi.fn(), cancelarParcial: vi.fn(), limpiarDibujo: vi.fn() };
    toast = { show: vi.fn() };
    dataPersistence = {
      guardarEnBaseDeDatos: vi.fn().mockResolvedValue(undefined),
      guardarYEnviar: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [MapPage],
      providers: [
        MapStateService,
        { provide: MapRenderingFacade, useValue: { attachEngine: vi.fn(), destroySelectedManzanaOverlay: vi.fn() } },
        { provide: MapSelectionService, useValue: selection },
        { provide: MapInitializationService, useValue: initialization },
        { provide: MapPartialMarkService, useValue: partialMark },
        { provide: MapDataPersistenceService, useValue: dataPersistence },
        { provide: Toast, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MapPage);
    component = fixture.componentInstance;
    state = TestBed.inject(MapStateService);
  });

  describe('onTerritorioSeleccionado', () => {
    it('clears marks when the selection is emptied', async () => {
      await component.onTerritorioSeleccionado([]);

      // The search-clear must abandon an in-flight partial draw first:
      // limpiarMarcas owns selection state, not the edit/preview overlay.
      expect(partialMark.cancelarParcial).toHaveBeenCalled();
      expect(selection.limpiarMarcas).toHaveBeenCalled();
    });

    it('abandons the in-flight draw before clearing marks on search-clear', () => {
      const order: string[] = [];
      partialMark.cancelarParcial.mockImplementation(() => order.push('draw'));
      selection.limpiarMarcas.mockImplementation(() => order.push('marks'));

      void component.onTerritorioSeleccionado([]);

      expect(order).toEqual(['draw', 'marks']);
    });

    it('prepares the territories and restores marks from the database', async () => {
      selection.prepareTerritorioSeleccionado.mockReturnValue([5]);
      const rendering = TestBed.inject(MapRenderingFacade) as unknown as { getFeatureLayerByTerritorio: ReturnType<typeof vi.fn> };
      rendering.getFeatureLayerByTerritorio = vi.fn().mockReturnValue({ territorioPadre: 5, color: '#ff0000', layer: {} });

      await component.onTerritorioSeleccionado([5]);

      expect(selection.prepareTerritorioSeleccionado).toHaveBeenCalledWith([5]);
      expect(selection.restaurarMarcadoDesdeDB).toHaveBeenCalledWith(5, '#ff0000', { actualizarEstadoMarcado: true });
    });

    it('blocks selection via the search widget while a marking mode is active', async () => {
      state.modoMarcado.set('completa');

      await component.onTerritorioSeleccionado([5]);

      expect(selection.prepareTerritorioSeleccionado).not.toHaveBeenCalled();
      expect(toast.show).toHaveBeenCalled();
    });

    it('allows selection via the search widget in mode none', async () => {
      selection.prepareTerritorioSeleccionado.mockReturnValue([5]);
      const rendering = TestBed.inject(MapRenderingFacade) as unknown as { getFeatureLayerByTerritorio: ReturnType<typeof vi.fn> };
      rendering.getFeatureLayerByTerritorio = vi.fn().mockReturnValue({ territorioPadre: 5, color: '#ff0000', layer: {} });

      await component.onTerritorioSeleccionado([5]);

      expect(selection.prepareTerritorioSeleccionado).toHaveBeenCalledWith([5]);
      expect(toast.show).not.toHaveBeenCalled();
    });
  });

  describe('modos y acciones', () => {
    it('setModoMarcado delegates to the selection service', () => {
      component.setModoMarcado('parcial');

      expect(selection.setModoMarcado).toHaveBeenCalledWith('parcial');
    });

    it('toggleModoCompleto activates completa mode when it is off', () => {
      state.modoMarcado.set('none');
      component.toggleModoCompleto();

      expect(selection.setModoMarcado).toHaveBeenCalledWith('completa');
    });

    it('toggleModoCompleto deactivates the mode when it is already active', () => {
      state.modoMarcado.set('completa');
      component.toggleModoCompleto();

      expect(selection.setModoMarcado).toHaveBeenCalledWith('none');
    });

    it('setModoMarcado leaving parcial tears the in-flight draw down first', () => {
      state.modoMarcado.set('parcial');

      component.setModoMarcado('completa');

      expect(partialMark.limpiarDibujo).toHaveBeenCalled();
      expect(selection.setModoMarcado).toHaveBeenCalledWith('completa');
    });

    it('setModoMarcado into parcial does not tear the draw down', () => {
      state.modoMarcado.set('none');

      component.setModoMarcado('parcial');

      expect(partialMark.limpiarDibujo).not.toHaveBeenCalled();
      expect(selection.setModoMarcado).toHaveBeenCalledWith('parcial');
    });

    it('toggleModoCompleto while drawing activates completa and tears the draw down', () => {
      state.modoMarcado.set('parcial');

      component.toggleModoCompleto();

      expect(partialMark.limpiarDibujo).toHaveBeenCalled();
      expect(selection.setModoMarcado).toHaveBeenCalledWith('completa');
    });

    it('orders draw teardown before the mode switch', () => {
      const order: string[] = [];
      partialMark.limpiarDibujo.mockImplementation(() => order.push('draw'));
      selection.setModoMarcado.mockImplementation(() => order.push('mode'));
      state.modoMarcado.set('parcial');

      component.setModoMarcado('completa');

      expect(order).toEqual(['draw', 'mode']);
    });

    it('delegates partial drawing actions', () => {
      component.deshacerPunto();
      component.finalizarParcial();
      component.cancelarParcial();

      expect(partialMark.deshacerPunto).toHaveBeenCalled();
      expect(partialMark.finalizarParcial).toHaveBeenCalled();
      expect(partialMark.cancelarParcial).toHaveBeenCalled();
    });
  });

  describe('persistencia y envío', () => {
    it('delegates guardarEnBaseDeDatos', async () => {
      await component.guardarEnBaseDeDatos();

      expect(dataPersistence.guardarEnBaseDeDatos).toHaveBeenCalled();
    });

    it('delegates limpiarMarcas and guardarYEnviar', async () => {
      component.limpiarMarcas();
      await component.guardarYEnviar();

      expect(selection.limpiarMarcas).toHaveBeenCalled();
      expect(dataPersistence.guardarYEnviar).toHaveBeenCalled();
    });
  });

  describe('limpiarTodo', () => {
    it('clears marks and reloads territories when there is data', () => {
      state.manzanasById.set(new Map([["a", { id: 'a', nombreBloque: 'A', color: '#fff', territorioNumero: 1 }]]));

      component.limpiarTodo();

      expect(selection.limpiarMarcas).toHaveBeenCalled();
      expect(initialization.reloadAllTerritories).toHaveBeenCalled();
    });

    it('just clears marks when there is no data', () => {
      component.limpiarTodo();

      expect(selection.limpiarMarcas).toHaveBeenCalled();
      expect(initialization.reloadAllTerritories).not.toHaveBeenCalled();
    });

    it('tears down an in-flight partial draw so the preview cannot be left painted', () => {
      // The button doubles as "Cancelar" while drawing; `limpiarMarcas()`
      // does not own the edit/preview overlay.
      component.limpiarTodo();

      expect(partialMark.cancelarParcial).toHaveBeenCalled();
    });

    it('tears the draw down before clearing the marks', () => {
      const order: string[] = [];
      partialMark.cancelarParcial.mockImplementation(() => order.push('draw'));
      selection.limpiarMarcas.mockImplementation(() => order.push('marks'));

      component.limpiarTodo();

      expect(order).toEqual(['draw', 'marks']);
    });
  });

  it('ngOnDestroy does not throw', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  it('tears down the marked overlay with the engine so a 2nd map visit re-initializes it', () => {
    const markedOverlay = TestBed.inject(MapMarkedOverlayService);
    const engine = createMockMapEngine();

    // Visit 1: the rendering facade initialized the overlay on this engine.
    markedOverlay.initOverlay(engine);
    expect(markedOverlay.isInitialized()).toBe(true);

    // Simulate the mounted engine so ngOnDestroy tears it down with the page.
    (component as unknown as { maplibreEngine: { set: (e: MapEngine) => void } }).maplibreEngine.set(engine);

    fixture.destroy();

    // Without the teardown the root-singleton flag stays true and the next
    // visit's initOverlay early-returns — the overlay silently never renders.
    expect(markedOverlay.isInitialized()).toBe(false);
    expect(engine.removeSource).toHaveBeenCalledWith('marked');
  });

  it('tears down the tapped-manzana highlight with the engine so a 2nd map visit re-initializes it', () => {
    const engine = createMockMapEngine();
    (component as unknown as { maplibreEngine: { set: (e: MapEngine) => void } }).maplibreEngine.set(engine);
    const rendering = TestBed.inject(MapRenderingFacade) as unknown as {
      destroySelectedManzanaOverlay: ReturnType<typeof vi.fn>;
    };

    fixture.destroy();

    expect(rendering.destroySelectedManzanaOverlay).toHaveBeenCalledWith(engine);
  });

  it('tears down an in-flight partial draw when the page is destroyed', () => {
    const engine = createMockMapEngine();
    (component as unknown as { maplibreEngine: { set: (e: MapEngine) => void } }).maplibreEngine.set(engine);

    fixture.destroy();

    expect(partialMark.limpiarDibujo).toHaveBeenCalled();
  });

  describe('GPS follow controls (5.4 / 5.5)', () => {
    const geo = { watchPosition: vi.fn(), clearWatch: vi.fn() };
    let watchCb: (pos: GeolocationPosition) => void;
    let errorCb: (err: GeolocationPositionError) => void;
    let originalGeo: PropertyDescriptor | undefined;
    let originalSecure: PropertyDescriptor | undefined;

    function positionAt(lat: number, lng: number, accuracy = 20): GeolocationPosition {
      return {
        coords: {
          latitude: lat,
          longitude: lng,
          accuracy,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition;
    }

    function denialError(): GeolocationPositionError {
      return { code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
    }

    function panelText(): string {
      return (fixture.nativeElement.querySelector('.follow-panel') as HTMLElement | null)?.textContent ?? '';
    }

    function followToggle(): HTMLButtonElement {
      return fixture.nativeElement.querySelector('.follow-toggle') as HTMLButtonElement;
    }

    function actionButton(label: string): HTMLButtonElement | undefined {
      return Array.from(fixture.nativeElement.querySelectorAll('.follow-action') as ArrayLike<HTMLButtonElement>).find(
        (b) => (b.textContent ?? '').includes(label),
      );
    }

    beforeEach(() => {
      // `detectChanges()` flushes afterNextRender → initMap() would import and
      // boot MapLibre (WebGL) inside jsdom; block it for every rendering test.
      vi.spyOn(component as unknown as { initMap: () => void }, 'initMap').mockImplementation(() => {});

      originalGeo = Object.getOwnPropertyDescriptor(globalThis.navigator, 'geolocation');
      originalSecure = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
      Object.defineProperty(globalThis.navigator, 'geolocation', { value: geo, configurable: true, writable: true });
      Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

      geo.watchPosition.mockReset();
      geo.clearWatch.mockReset();
      geo.watchPosition.mockImplementation((ok: (pos: GeolocationPosition) => void, ko: (err: GeolocationPositionError) => void) => {
        watchCb = ok;
        errorCb = ko;
        return 42;
      });
    });

    afterEach(() => {
      if (originalGeo) Object.defineProperty(globalThis.navigator, 'geolocation', originalGeo);
      else Object.defineProperty(globalThis.navigator, 'geolocation', { value: undefined, configurable: true });
      if (originalSecure) Object.defineProperty(window, 'isSecureContext', originalSecure);
    });

    it('renders the follow toggle off by default with no status panel', () => {
      fixture.detectChanges();

      expect(followToggle()).toBeTruthy();
      expect(followToggle().getAttribute('aria-pressed')).toBe('false');
      expect(followToggle().classList.contains('active')).toBe(false);
      expect(fixture.nativeElement.querySelector('.follow-panel')).toBeNull();
    });

    it('activate renders the active indicator and Spanish following status', () => {
      component.toggleGpsFollow();
      fixture.detectChanges();

      expect(component.gpsState()).toBe('active');
      expect(followToggle().getAttribute('aria-pressed')).toBe('true');
      expect(followToggle().classList.contains('active')).toBe(true);
      expect(panelText()).toContain('Siguiendo tu ubicación');
      // No trail yet → clear action exists but is disabled.
      expect(actionButton('Limpiar ruta')?.disabled).toBe(true);
    });

    // Regression: the page used to render TWO geolocation buttons. The legacy
    // `.map-toggle-location` acquired a real navigator.geolocation.watchPosition
    // and flipped its own status signals, but nothing ever read its
    // lat/lng/accuracy — so the camera never moved and no marker was drawn while
    // the watch drained the battery. It was removed in favour of the working
    // follow button. Exactly one geolocation control must remain.
    it('renders exactly one geolocation control (no legacy toggle)', () => {
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.map-toggle-location')).toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.follow-toggle')).toHaveLength(1);
    });

    it('hides the whole control cluster while edit mode owns the camera (D4)', () => {
      state.modoMarcado.set('parcial');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.follow-controls')).toBeNull();
    });

    it('edit-mode entry auto-pauses and leaving edit mode does not auto-resume', () => {
      component.toggleGpsFollow();
      expect(component.gpsState()).toBe('active');

      state.modoMarcado.set('parcial');
      TestBed.flushEffects();
      fixture.detectChanges();
      expect(component.gpsState()).toBe('paused');
      // While edit mode owns the camera the whole cluster is hidden (D4).
      expect(fixture.nativeElement.querySelector('.follow-controls')).toBeNull();

      state.modoMarcado.set('none');
      TestBed.flushEffects();
      fixture.detectChanges();
      // Explicit user action only (D4): still paused, cluster visible again.
      expect(component.gpsState()).toBe('paused');
      expect(fixture.nativeElement.querySelector('.follow-controls')).toBeTruthy();
      expect(panelText()).toContain('Seguimiento en pausa');
      expect(panelText()).toContain('Recentrar');
    });

    it('the Recentrar action resumes following from paused', () => {
      component.toggleGpsFollow();
      state.modoMarcado.set('parcial');
      TestBed.flushEffects();
      state.modoMarcado.set('none');
      TestBed.flushEffects();
      fixture.detectChanges();

      actionButton('Recentrar')?.click();
      fixture.detectChanges();

      expect(component.gpsState()).toBe('active');
      expect(panelText()).toContain('Siguiendo tu ubicación');
    });

    it('permission denial shows the Spanish message, clears the indicator and releases the watch', () => {
      component.toggleGpsFollow();
      expect(component.gpsState()).toBe('active');

      errorCb(denialError());
      fixture.detectChanges();

      expect(component.gpsState()).toBe('off');
      expect(panelText()).toContain(TOAST_MESSAGES.locationDenied);
      expect(followToggle().classList.contains('active')).toBe(false);
      expect(followToggle().getAttribute('aria-pressed')).toBe('false');
      expect(geo.clearWatch).toHaveBeenCalledWith(42);
    });

    it('records the trail, enables Limpiar ruta, and clears it on click', () => {
      component.toggleGpsFollow();
      watchCb(positionAt(-33.4489, -70.6693));
      fixture.detectChanges();

      expect(actionButton('Limpiar ruta')?.disabled).toBe(false);

      actionButton('Limpiar ruta')?.click();

      expect(TestBed.inject(MapGpsFollowService).trail()).toEqual([]);
    });

    it('renders and activates without touching geolocation when it is unavailable (SSR/insecure)', () => {
      Object.defineProperty(globalThis.navigator, 'geolocation', { value: undefined, configurable: true });

      expect(() => fixture.detectChanges()).not.toThrow();
      expect(geo.watchPosition).not.toHaveBeenCalled();

      component.toggleGpsFollow();
      fixture.detectChanges();

      expect(geo.watchPosition).not.toHaveBeenCalled();
      expect(component.gpsState()).toBe('off');
      expect(component.gpsError()).toBe('unsupported');
      expect(panelText()).toContain(TOAST_MESSAGES.locationUnsupported);
    });

    it('deactivation stops re-centering and clears the OS watch (5.5)', () => {
      component.toggleGpsFollow();
      expect(geo.watchPosition).toHaveBeenCalledTimes(1);
      watchCb(positionAt(-33.4489, -70.6693));

      component.toggleGpsFollow(); // deactivate

      expect(component.gpsState()).toBe('off');
      expect(geo.clearWatch).toHaveBeenCalledWith(42);
      // A late fix after release must not re-engage follow mode.
      watchCb(positionAt(-33.45, -70.67));
      expect(component.gpsState()).toBe('off');
    });

    it('route exit (fixture.destroy) while active clears the OS watch (5.5)', () => {
      component.toggleGpsFollow();
      expect(geo.watchPosition).toHaveBeenCalledTimes(1);

      fixture.destroy();

      expect(geo.clearWatch).toHaveBeenCalledWith(42);
    });
  });
});

function createMockMapEngine(): MapEngine {
  return {
    init: vi.fn(),
    addSource: vi.fn(),
    addGeoJsonSource: vi.fn(),
    updateGeoJsonSourceData: vi.fn(),
    project: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    removeSource: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    setSourceUrl: vi.fn(),
    queryRenderedFeatures: vi.fn().mockReturnValue([]),
    on: vi.fn(),
    off: vi.fn(),
    fitBounds: vi.fn(),
    getZoom: vi.fn().mockReturnValue(15),
    setZoom: vi.fn(),
    getCenter: vi.fn().mockReturnValue({ lng: 0, lat: 0 }),
    setCenter: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    setFeatureState: vi.fn(),
    removeFeatureState: vi.fn(),
    captureCanvas: vi.fn().mockResolvedValue(null),
  };
}

describe('MapPage — boot del motor MapLibre y picking', () => {
  let component: MapPage;
  let fixture: ComponentFixture<MapPage>;
  let state: MapStateService;
  let picking: { queryAt: ReturnType<typeof vi.fn>; clearHighlight: ReturnType<typeof vi.fn> };
  let rendering: Record<string, ReturnType<typeof vi.fn>>;
  let selection: Record<string, ReturnType<typeof vi.fn>>;
  let initialization: Record<string, ReturnType<typeof vi.fn>>;
  let partialMark: Record<string, ReturnType<typeof vi.fn>>;
  let labelLayer: Record<string, ReturnType<typeof vi.fn>>;
  let vectorTile: Record<string, ReturnType<typeof vi.fn>>;
  let tileVersion: Record<string, ReturnType<typeof vi.fn>>;
  let canvasCapture: { setEngine: ReturnType<typeof vi.fn> };
  let gpsFollow: Record<string, ReturnType<typeof vi.fn>>;
  let toast: { show: ReturnType<typeof vi.fn> };

  function clearEngineMocks(): void {
    for (const value of Object.values(engineMock.engine)) {
      if (typeof value === 'function' && 'mockClear' in value) {
        (value as { mockClear: () => void }).mockClear();
      }
    }
  }

  function mountEngine(): void {
    (component as unknown as { maplibreEngine: { set: (e: unknown) => void } })
      .maplibreEngine.set(engineMock.engine);
  }

  function unmountEngine(): void {
    (component as unknown as { maplibreEngine: { set: (e: unknown) => void } })
      .maplibreEngine.set(null);
  }

  /** Flush afterNextRender → initMap → initMaplibre and wait until wired. */
  async function bootEngine(): Promise<void> {
    fixture.detectChanges();
    await vi.waitFor(() => {
      expect(engineMock.engine.on).toHaveBeenCalledWith('click', expect.any(Function));
    });
  }

  function registeredHandler(type: string): (e: unknown) => void {
    const call = engineMock.engine.on.mock.calls.find(c => c[0] === type);
    if (!call) throw new Error(`no '${type}' handler registered`);
    return call[1] as (e: unknown) => void;
  }

  function feature(properties?: Record<string, unknown>, id?: number): MapGeoJSONFeature {
    return { id, properties } as unknown as MapGeoJSONFeature;
  }

  function mouseEvent(): MapLayerMouseEvent {
    return { point: { x: 10, y: 20 }, lngLat: { lng: -70.1, lat: -33.4 } } as unknown as MapLayerMouseEvent;
  }

  function touchEvent(touches?: Array<{ clientX: number; clientY: number }>): MapLayerTouchEvent {
    const originalEvent = touches === undefined ? {} : { changedTouches: touches };
    return { originalEvent, lngLat: { lng: -70.1, lat: -33.4 } } as unknown as MapLayerTouchEvent;
  }

  beforeEach(async () => {
    clearEngineMocks();
    engineMock.engine.getContainer = undefined;

    picking = { queryAt: vi.fn(() => null), clearHighlight: vi.fn() };
    rendering = {
      attachEngine: vi.fn(),
      initMarkedOverlay: vi.fn(),
      initSelectedManzanaOverlay: vi.fn(),
      refreshMarksVisual: vi.fn(),
      destroySelectedManzanaOverlay: vi.fn(),
      getFeatureLayerByTerritorio: vi.fn(() => null),
      setCurrentTerritoryColor: vi.fn(),
      setSelectedManzana: vi.fn(),
    };
    selection = {
      prepareTerritorioSeleccionado: vi.fn((nums: number[]) => nums),
      restaurarMarcadoDesdeDB: vi.fn(() => Promise.resolve()),
      limpiarMarcas: vi.fn(),
      setModoMarcado: vi.fn(),
      toggleManzanaById: vi.fn(),
      marcarManzanaById: vi.fn(),
    };
    initialization = {
      loadAllTerritoriesPublic: vi.fn(() => Promise.resolve()),
      reloadAllTerritories: vi.fn(() => Promise.resolve()),
    };
    partialMark = {
      deshacerPunto: vi.fn(),
      finalizarParcial: vi.fn(),
      cancelarParcial: vi.fn(),
      limpiarDibujo: vi.fn(),
      iniciarDibujo: vi.fn(() => Promise.resolve()),
      snapToNearestManzana: vi.fn(() => ({ snapped: { lat: -33.4, lng: -70.1, manzanaId: '99' }, edges: [] })),
      agregarPunto: vi.fn(),
    };
    labelLayer = { initLabels: vi.fn(), updateLabels: vi.fn(), destroy: vi.fn() };
    vectorTile = { initLayers: vi.fn(), destroy: vi.fn() };
    tileVersion = { startPolling: vi.fn(), stopPolling: vi.fn(), handleTileError: vi.fn() };
    canvasCapture = { setEngine: vi.fn() };
    gpsFollow = {
      state: vi.fn(() => 'off'),
      error: vi.fn(() => null),
      errorMessage: vi.fn(() => ''),
      hasTrail: vi.fn(() => false),
      editing: vi.fn(() => false),
      activate: vi.fn(),
      deactivate: vi.fn(),
      recenter: vi.fn(),
      clearTrail: vi.fn(),
      attachEngine: vi.fn(),
      destroy: vi.fn(),
    };
    toast = { show: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [MapPage],
      providers: [
        MapStateService,
        { provide: MapRenderingFacade, useValue: rendering },
        { provide: MapSelectionService, useValue: selection },
        { provide: MapInitializationService, useValue: initialization },
        { provide: MapPartialMarkService, useValue: partialMark },
        { provide: MapDataPersistenceService, useValue: { guardarEnBaseDeDatos: vi.fn(), guardarYEnviar: vi.fn() } },
        { provide: MapPickingService, useValue: picking },
        { provide: MapVectorTileService, useValue: vectorTile },
        { provide: MapLabelLayerService, useValue: labelLayer },
        { provide: TileVersionService, useValue: tileVersion },
        { provide: MapCanvasCaptureService, useValue: canvasCapture },
        { provide: MapGpsFollowService, useValue: gpsFollow },
        { provide: MapLocationService, useValue: { destroy: vi.fn() } },
        { provide: MapMarkedOverlayService, useValue: { destroy: vi.fn(), initOverlay: vi.fn(), isInitialized: vi.fn(() => false) } },
        { provide: Toast, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MapPage);
    component = fixture.componentInstance;
    state = TestBed.inject(MapStateService);
  });

  describe('initMap / initMaplibre', () => {
    it('sale sin arrancar el motor si el contenedor #map no existe', () => {
      document.getElementById('map')?.remove();

      (component as unknown as { initMap: () => void }).initMap();

      expect(engineMock.engine.init).not.toHaveBeenCalled();
      expect(engineMock.engine.on).not.toHaveBeenCalled();
    });

    it('arranca el motor e inicializa capas, overlays, labels, GPS y handlers', async () => {
      await bootEngine();

      const el = document.getElementById('map');
      expect(el).toBeTruthy();
      expect(engineMock.engine.init).toHaveBeenCalledWith(el, expect.objectContaining({
        tileUrl: '/api/v1/territories/tiles/{z}/{x}/{y}.pbf',
        zoom: MAP_DEFAULTS.initialZoom,
        maxZoom: MAP_DEFAULTS.maxZoom,
        center: [MAP_DEFAULTS.initialView.lng, MAP_DEFAULTS.initialView.lat],
      }));
      expect(canvasCapture.setEngine).toHaveBeenCalledWith(engineMock.engine);
      expect(vectorTile.initLayers).toHaveBeenCalledWith(engineMock.engine);
      expect(rendering.attachEngine).toHaveBeenCalledWith(engineMock.engine);
      expect(tileVersion.startPolling).toHaveBeenCalledWith(engineMock.engine);
      expect(initialization.loadAllTerritoriesPublic).toHaveBeenCalled();
      expect(rendering.initMarkedOverlay).toHaveBeenCalledWith(engineMock.engine);
      expect(rendering.initSelectedManzanaOverlay).toHaveBeenCalledWith(engineMock.engine);
      expect(labelLayer.initLabels).toHaveBeenCalledWith(engineMock.engine);
      expect(labelLayer.updateLabels).toHaveBeenCalledWith(engineMock.engine, []);
      expect(gpsFollow.attachEngine).toHaveBeenCalledWith(engineMock.engine);
      expect(rendering.refreshMarksVisual).toHaveBeenCalled();
      expect(engineMock.engine.on).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(engineMock.engine.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('el handler de error del motor fuerza el refresco de tiles', async () => {
      await bootEngine();

      registeredHandler('error')();

      expect(tileVersion.handleTileError).toHaveBeenCalled();
    });

    it('ignora clicks y hovers cuando el motor ya no está montado', async () => {
      await bootEngine();
      unmountEngine();

      registeredHandler('click')(mouseEvent());
      registeredHandler('mousemove')(mouseEvent());

      expect(picking.queryAt).not.toHaveBeenCalled();
    });

    it('ngOnDestroy desuscribe los handlers y libera el motor', async () => {
      await bootEngine();
      const clickHandler = registeredHandler('click');

      fixture.destroy();

      expect(engineMock.engine.off).toHaveBeenCalledWith('click', clickHandler);
      expect(engineMock.engine.off).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(engineMock.engine.off).toHaveBeenCalledWith('error', expect.any(Function));
      expect(engineMock.engine.destroy).toHaveBeenCalled();
      expect(canvasCapture.setEngine).toHaveBeenLastCalledWith(null);
    });
  });

  describe('handleMaplibreClick — modo none', () => {
    it('selecciona el territorio de la manzana clicada y la resalta al asentarse', async () => {
      await bootEngine();
      state.modoMarcado.set('none');
      picking.queryAt.mockReturnValue(feature({ tid: 12, color: '#abc123', bloque: 'Norte', fid: 9 }));
      selection.prepareTerritorioSeleccionado.mockImplementation((nums: number[]) => {
        state.territoriosSeleccionados.set(nums);
        return nums;
      });
      rendering.getFeatureLayerByTerritorio.mockReturnValue({ territorioPadre: 12, color: '#abc123', layer: {} });

      registeredHandler('click')(mouseEvent());

      await vi.waitFor(() => {
        expect(rendering.setCurrentTerritoryColor).toHaveBeenCalledWith('#abc123');
        expect(selection.restaurarMarcadoDesdeDB).toHaveBeenCalledWith(12, '#abc123', { actualizarEstadoMarcado: true });
        expect(rendering.setSelectedManzana).toHaveBeenCalledWith('9', 'Norte', 12);
      });
      expect(labelLayer.updateLabels).toHaveBeenCalled();
    });

    it('no resalta la manzana si el territorio no quedó seleccionado', async () => {
      await bootEngine();
      state.modoMarcado.set('none');
      picking.queryAt.mockReturnValue(feature({ tid: 12, color: '#abc123', bloque: 'Norte', fid: 9 }));
      rendering.getFeatureLayerByTerritorio.mockReturnValue({ territorioPadre: 12, color: '#abc123', layer: {} });

      registeredHandler('click')(mouseEvent());

      await vi.waitFor(() => expect(labelLayer.updateLabels).toHaveBeenCalled());
      expect(rendering.setSelectedManzana).not.toHaveBeenCalled();
    });

    it('alterna la manzana ya marcada en lugar de volver a seleccionarla', async () => {
      await bootEngine();
      state.modoMarcado.set('none');
      state.manzanasById.set(new Map([['9', { id: '9', nombreBloque: 'Norte', color: '#abc123', territorioNumero: 12 }]]));
      picking.queryAt.mockReturnValue(feature({ tid: 12, color: '#abc123', bloque: 'Norte', fid: 9 }));

      registeredHandler('click')(mouseEvent());

      expect(selection.toggleManzanaById).toHaveBeenCalledWith('9', 'Norte', '#abc123', 12);
      expect(labelLayer.updateLabels).toHaveBeenCalled();
      expect(selection.prepareTerritorioSeleccionado).not.toHaveBeenCalled();
    });

    it('un clic sobre el territorio activo lo remueve y limpia las marcas', async () => {
      await bootEngine();
      state.modoMarcado.set('none');
      state.territoriosSeleccionados.set([12]);
      picking.queryAt.mockReturnValue(feature({ tid: 12, color: '#abc123', bloque: 'Norte', fid: 9 }));

      registeredHandler('click')(mouseEvent());

      await vi.waitFor(() => expect(partialMark.cancelarParcial).toHaveBeenCalled());
      expect(selection.limpiarMarcas).toHaveBeenCalled();
    });

    it('agrega a la selección un clic sobre otro territorio', async () => {
      await bootEngine();
      state.modoMarcado.set('none');
      state.territoriosSeleccionados.set([5]);
      picking.queryAt.mockReturnValue(feature({ tid: 12, color: '#abc123', bloque: 'Norte', fid: 9 }));

      registeredHandler('click')(mouseEvent());

      await vi.waitFor(() =>
        expect(selection.prepareTerritorioSeleccionado).toHaveBeenCalledWith([5, 12]),
      );
    });
  });

  describe('handleMaplibreClick — modo completa', () => {
    beforeEach(() => {
      state.modoMarcado.set('completa');
    });

    it('bloquea marcar fuera del territorio seleccionado', async () => {
      await bootEngine();
      picking.queryAt.mockReturnValue(feature({ tid: 12, color: '#abc123', bloque: 'Norte', fid: 9 }));

      registeredHandler('click')(mouseEvent());

      expect(toast.show).toHaveBeenCalledWith(TOAST_MESSAGES.territoryLock);
      expect(selection.marcarManzanaById).not.toHaveBeenCalled();
    });

    it('no repite una manzana ya marcada', async () => {
      await bootEngine();
      state.territoriosSeleccionados.set([12]);
      state.manzanasById.set(new Map([['9', { id: '9', nombreBloque: 'Norte', color: '#abc123', territorioNumero: 12 }]]));
      picking.queryAt.mockReturnValue(feature({ tid: 12, color: '#abc123', bloque: 'Norte', fid: 9 }));

      registeredHandler('click')(mouseEvent());

      expect(selection.marcarManzanaById).not.toHaveBeenCalled();
      expect(toast.show).not.toHaveBeenCalled();
    });

    it('marca la manzana con el color vigente del territorio', async () => {
      await bootEngine();
      state.territoriosSeleccionados.set([12]);
      state.currentTerritoryColor.set('#00aaff');
      picking.queryAt.mockReturnValue(feature({ tid: 12, color: '#abc123', bloque: 'Norte', fid: 9 }));

      registeredHandler('click')(mouseEvent());

      expect(selection.marcarManzanaById).toHaveBeenCalledWith('9', 'Norte', '#00aaff', 12);
    });
  });

  describe('handleMaplibreClick — modo parcial', () => {
    beforeEach(() => {
      state.modoMarcado.set('parcial');
    });

    it('bloquea el trazado fuera del territorio seleccionado', async () => {
      await bootEngine();
      picking.queryAt.mockReturnValue(feature({ tid: 12, color: '#abc123', bloque: 'Norte', fid: 9 }));

      registeredHandler('click')(mouseEvent());

      expect(toast.show).toHaveBeenCalledWith(TOAST_MESSAGES.territoryLock);
      expect(partialMark.iniciarDibujo).not.toHaveBeenCalled();
    });

    it('ignora una manzana ya marcada', async () => {
      await bootEngine();
      state.territoriosSeleccionados.set([12]);
      state.manzanasById.set(new Map([['9', { id: '9', nombreBloque: 'Norte', color: '#abc123', territorioNumero: 12 }]]));
      picking.queryAt.mockReturnValue(feature({ tid: 12, color: '#abc123', bloque: 'Norte', fid: 9 }));

      registeredHandler('click')(mouseEvent());

      expect(partialMark.iniciarDibujo).not.toHaveBeenCalled();
      expect(partialMark.snapToNearestManzana).not.toHaveBeenCalled();
    });

    it('el primer toque ancla el trazado en la manzana con su color', async () => {
      await bootEngine();
      state.territoriosSeleccionados.set([12]);
      picking.queryAt.mockReturnValue(feature({ tid: 12, color: '#abc123', bloque: 'Norte', fid: 9 }));

      registeredHandler('click')(mouseEvent());

      await vi.waitFor(() =>
        expect(partialMark.iniciarDibujo).toHaveBeenCalledWith('9', 'Norte', '#abc123', 12, engineMock.engine),
      );
      expect(partialMark.snapToNearestManzana).not.toHaveBeenCalled();
    });

    it('los toques siguientes recalcan a la manzana más cercana y agregan el punto', async () => {
      await bootEngine();
      state.territoriosSeleccionados.set([12]);
      state.manzanaSeleccionadaTerritorio.set(12);
      picking.queryAt.mockReturnValue(feature({ tid: 12, color: '#abc123', bloque: 'Norte', fid: 9 }));
      const snapped = { lat: -33.45, lng: -70.67, manzanaId: '99' };
      const edges = [{ a: 1, b: 2 }];
      partialMark.snapToNearestManzana.mockReturnValue({ snapped, edges });

      registeredHandler('click')(mouseEvent());

      expect(partialMark.snapToNearestManzana).toHaveBeenCalledWith(
        { lng: -70.1, lat: -33.4 },
        expect.any(Object),
      );
      expect(partialMark.agregarPunto).toHaveBeenCalledWith(snapped, edges);
      expect(partialMark.iniciarDibujo).not.toHaveBeenCalled();
    });

    it('no inicia trazado si el motor se desmonta durante la consulta (carrera)', async () => {
      await bootEngine();
      state.territoriosSeleccionados.set([12]);
      picking.queryAt.mockImplementation(() => {
        unmountEngine();
        return feature({ tid: 12, color: '#abc123', bloque: 'Norte', fid: 9 });
      });

      registeredHandler('click')(mouseEvent());

      expect(partialMark.iniciarDibujo).not.toHaveBeenCalled();
      expect(partialMark.snapToNearestManzana).not.toHaveBeenCalled();
      expect(toast.show).not.toHaveBeenCalled();
    });
  });

  describe('picking: punto del evento', () => {
    it('usa point del evento de ratón', async () => {
      await bootEngine();
      picking.queryAt.mockReturnValue(null);

      registeredHandler('click')(mouseEvent());

      expect(picking.queryAt).toHaveBeenCalledWith([10, 20], engineMock.engine);
    });

    it('usa changedTouches[0] en táctil y [0,0] si no hay toques', async () => {
      await bootEngine();
      picking.queryAt.mockReturnValue(null);

      registeredHandler('click')(touchEvent([{ clientX: 30, clientY: 40 }]));
      expect(picking.queryAt).toHaveBeenLastCalledWith([30, 40], engineMock.engine);

      registeredHandler('click')(touchEvent([]));
      expect(picking.queryAt).toHaveBeenLastCalledWith([0, 0], engineMock.engine);

      registeredHandler('click')(touchEvent(undefined));
      expect(picking.queryAt).toHaveBeenLastCalledWith([0, 0], engineMock.engine);
    });

    it('sale sin procesar si no hay feature bajo el punto', async () => {
      await bootEngine();
      picking.queryAt.mockReturnValue(null);

      registeredHandler('click')(mouseEvent());

      expect(toast.show).not.toHaveBeenCalled();
      expect(selection.prepareTerritorioSeleccionado).not.toHaveBeenCalled();
    });
  });

  describe('handleMaplibreHover', () => {
    it('pone el cursor en pointer sobre una feature', async () => {
      await bootEngine();
      const container = document.createElement('div');
      engineMock.engine.getContainer = () => container;
      picking.queryAt.mockReturnValue(feature({ tid: 12 }));

      registeredHandler('mousemove')(mouseEvent());

      expect(container.style.cursor).toBe('pointer');
    });

    it('limpia el cursor cuando no hay feature', async () => {
      await bootEngine();
      const container = document.createElement('div');
      container.style.cursor = 'pointer';
      engineMock.engine.getContainer = () => container;
      picking.queryAt.mockReturnValue(null);

      registeredHandler('mousemove')(mouseEvent());

      expect(container.style.cursor).toBe('');
    });

    it('tolera eventos táctiles y un motor sin contenedor', async () => {
      await bootEngine();
      engineMock.engine.getContainer = undefined;

      registeredHandler('mousemove')(touchEvent([{ clientX: 1, clientY: 2 }]));

      expect(picking.queryAt).toHaveBeenCalledWith([1, 2], engineMock.engine);
    });
  });

  describe('extracción de datos de la feature', () => {
    const helpers = () =>
      component as unknown as {
        extractTerritorioNumero: (f: MapGeoJSONFeature) => number;
        extractManzanaId: (f: MapGeoJSONFeature) => string;
        extractNombreBloque: (f: MapGeoJSONFeature) => string;
        getTouchPoint: (e: MapLayerTouchEvent) => [number, number];
      };

    it('lee tid/territorio numéricos o texto y devuelve 0 si no hay número válido', () => {
      expect(helpers().extractTerritorioNumero(feature({ tid: 7 }))).toBe(7);
      expect(helpers().extractTerritorioNumero(feature({ tid: '7' }))).toBe(7);
      expect(helpers().extractTerritorioNumero(feature({ territorio: 7 }))).toBe(7);
      expect(helpers().extractTerritorioNumero(feature({ tid: 'x' }))).toBe(0);
      expect(helpers().extractTerritorioNumero(feature(undefined))).toBe(0);
    });

    it('deriva el id de manzana desde fid o feature.id y descarta inválidos', () => {
      expect(helpers().extractManzanaId(feature({ fid: 12 }, 99))).toBe('12');
      expect(helpers().extractManzanaId(feature({ fid: '8' }))).toBe('8');
      expect(helpers().extractManzanaId(feature({}, 42))).toBe('42');
      expect(helpers().extractManzanaId(feature({ fid: 0 }))).toBe('');
      expect(helpers().extractManzanaId(feature({ fid: 2.5 }))).toBe('');
      expect(helpers().extractManzanaId(feature({ fid: 'zz' }))).toBe('');
      expect(helpers().extractManzanaId(feature(undefined))).toBe('');
    });

    it('lee el nombre del bloque con fallbacks y devuelve vacío si no es texto', () => {
      expect(helpers().extractNombreBloque(feature({ bloque: 'A' }))).toBe('A');
      expect(helpers().extractNombreBloque(feature({ nombre: 'B' }))).toBe('B');
      expect(helpers().extractNombreBloque(feature({ nombreBloque: 'C' }))).toBe('C');
      expect(helpers().extractNombreBloque(feature({ bloque: 7 }))).toBe('');
      expect(helpers().extractNombreBloque(feature(undefined))).toBe('');
    });
  });

  describe('acciones de la barra', () => {
    it('toggleSatellite con motor alterna entre ArcGIS satélite y OSM', () => {
      mountEngine();
      state.isSatellite.set(false);

      component.toggleSatellite();

      expect(engineMock.engine.removeLayer).toHaveBeenCalledWith('basemap-layer');
      expect(engineMock.engine.removeSource).toHaveBeenCalledWith('basemap');
      expect(engineMock.engine.addSource).toHaveBeenCalledWith(
        'basemap',
        ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        '© Esri, Maxar, Earthstar Geographics',
      );
      expect(engineMock.engine.addLayer).toHaveBeenLastCalledWith(
        { id: 'basemap-layer', type: 'raster', source: 'basemap' },
        'territory-fill',
      );
      expect(state.isSatellite()).toBe(true);

      component.toggleSatellite();

      expect(engineMock.engine.addSource).toHaveBeenLastCalledWith(
        'basemap',
        [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        '© OpenStreetMap contributors',
      );
      expect(state.isSatellite()).toBe(false);
    });

    it('toggleSatellite sin motor montado no toca el basemap', () => {
      state.isSatellite.set(false);

      component.toggleSatellite();

      expect(engineMock.engine.addSource).not.toHaveBeenCalled();
      expect(state.isSatellite()).toBe(false);
    });

    it('onPredicacionChange actualiza el momento del día', () => {
      const select = document.createElement('select');
      const option = document.createElement('option');
      option.value = 'mañana';
      select.appendChild(option);

      component.onPredicacionChange({ target: select } as unknown as Event);

      expect(state.predicacion()).toBe('mañana');
    });

    it('limpiarTodo con motor reinicia la cámara y borra el resaltado', () => {
      mountEngine();
      state.manzanasById.set(new Map([['a', { id: 'a', nombreBloque: 'A', color: '#fff', territorioNumero: 1 }]]));

      component.limpiarTodo();

      expect(picking.clearHighlight).toHaveBeenCalledWith(engineMock.engine);
      expect(engineMock.engine.setCenter).toHaveBeenCalledWith([
        MAP_DEFAULTS.initialView.lng,
        MAP_DEFAULTS.initialView.lat,
      ]);
      expect(engineMock.engine.setZoom).toHaveBeenCalledWith(MAP_DEFAULTS.initialZoom);
    });
  });
});
