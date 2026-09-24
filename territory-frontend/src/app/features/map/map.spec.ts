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
import { Toast } from '../../core/services/toast';
import type { MapEngine } from './services/map-engine.interface';

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
