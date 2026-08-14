import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapPage } from './map';
import { elegirUltimoReporte } from './utils/report-utils';
import { getTerritoryFillOpacity } from './utils/territory-colors';
import type { Reporte } from '../../core/models/models';
import { MapStateService } from './services/map-state.service';
import { MapRenderingFacade } from './services/map-rendering.facade';
import { MapInteractionService } from './services/map-interaction.service';
import { MapSelectionService } from './services/map-selection.service';
import { MapInitializationService } from './services/map-initialization.service';
import { MapPartialMarkService } from './services/map-partial-mark.service';
import { MapDataPersistenceService } from './services/map-data-persistence.service';
import { Toast } from '../../core/services/toast';

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
    expect(getTerritoryFillOpacity(true)).toBe(0.85);
  });

  it('should return low opacity for incomplete territories', () => {
    expect(getTerritoryFillOpacity(false)).toBe(0.05);
  });
});

describe('MapPage', () => {
  let component: MapPage;
  let fixture: ComponentFixture<MapPage>;
  let state: MapStateService;
  let rendering: {
    toggleSatellite: ReturnType<typeof vi.fn>;
    isSatellite: ReturnType<typeof vi.fn>;
    getAllTerritoriesLayer: ReturnType<typeof vi.fn>;
    restaurarVisibilidadPoligonos: ReturnType<typeof vi.fn>;
    cancelPendingStyleUpdates: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
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
  };
  let dataPersistence: {
    guardarEnBaseDeDatos: ReturnType<typeof vi.fn>;
    prepararCaptura: ReturnType<typeof vi.fn>;
    restaurarMapaPostCaptura: ReturnType<typeof vi.fn>;
    guardarYEnviar: ReturnType<typeof vi.fn>;
  };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    rendering = {
      toggleSatellite: vi.fn(),
      isSatellite: vi.fn().mockReturnValue(false),
      getAllTerritoriesLayer: vi.fn().mockReturnValue([]),
      getFeatureLayerByTerritorio: vi.fn().mockReturnValue(undefined),
      getManzanaCountByTerritorio: vi.fn().mockReturnValue(0),
      restaurarVisibilidadPoligonos: vi.fn(),
      ocultarPoligonosNoSeleccionados: vi.fn(),
      cancelPendingStyleUpdates: vi.fn(),
      destroy: vi.fn(),
    };
    selection = {
      prepareTerritorioSeleccionado: vi.fn(),
      restaurarMarcadoDesdeDB: vi.fn().mockResolvedValue(undefined),
      limpiarMarcas: vi.fn(),
      setModoMarcado: vi.fn(),
    };
    initialization = { reloadAllTerritories: vi.fn().mockResolvedValue(undefined) };
    partialMark = { deshacerPunto: vi.fn(), finalizarParcial: vi.fn(), cancelarParcial: vi.fn() };
    toast = { show: vi.fn() };
    dataPersistence = {
      guardarEnBaseDeDatos: vi.fn().mockResolvedValue(undefined),
      prepararCaptura: vi.fn().mockResolvedValue(undefined),
      restaurarMapaPostCaptura: vi.fn(),
      guardarYEnviar: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [MapPage],
      providers: [
        MapStateService,
        { provide: MapRenderingFacade, useValue: rendering },
        { provide: MapInteractionService, useValue: {} },
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
    it('clears marks and restores visibility when the selection is emptied', async () => {
      await component.onTerritorioSeleccionado([]);

      expect(selection.limpiarMarcas).toHaveBeenCalled();
      expect(rendering.restaurarVisibilidadPoligonos).toHaveBeenCalledWith([], []);
    });

    it('prepares the territories and restores marks from the database', async () => {
      selection.prepareTerritorioSeleccionado.mockReturnValue([5]);
      rendering.getFeatureLayerByTerritorio.mockReturnValue({ territorioPadre: 5, color: '#ff0000', layer: {} });

      await component.onTerritorioSeleccionado([5]);

      expect(selection.prepareTerritorioSeleccionado).toHaveBeenCalledWith([5]);
      expect(rendering.getFeatureLayerByTerritorio).toHaveBeenCalledWith(5);
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
      rendering.getFeatureLayerByTerritorio.mockReturnValue({ territorioPadre: 5, color: '#ff0000', layer: {} });

      await component.onTerritorioSeleccionado([5]);

      expect(selection.prepareTerritorioSeleccionado).toHaveBeenCalledWith([5]);
      expect(toast.show).not.toHaveBeenCalled();
    });
  });

  describe('modos y acciones', () => {
    it('toggleSatellite delegates to the rendering facade and mirrors the state', () => {
      rendering.isSatellite.mockReturnValue(true);

      component.toggleSatellite();

      expect(rendering.toggleSatellite).toHaveBeenCalled();
      expect(state.isSatellite()).toBe(true);
    });

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

    it('delegates the capture cycle', async () => {
      await component.prepararCaptura();
      component.restaurarMapaPostCaptura();

      expect(dataPersistence.prepararCaptura).toHaveBeenCalled();
      expect(dataPersistence.restaurarMapaPostCaptura).toHaveBeenCalled();
    });

    it('delegates limpiarMarcas and guardarYEnviar', async () => {
      component.limpiarMarcas();
      await component.guardarYEnviar();

      expect(selection.limpiarMarcas).toHaveBeenCalled();
      expect(dataPersistence.guardarYEnviar).toHaveBeenCalled();
    });
  });

  describe('limpiarTodo', () => {
    it('cancels the marking mode first when one is active', () => {
      state.modoMarcado.set('parcial');

      component.limpiarTodo();

      expect(selection.setModoMarcado).toHaveBeenCalledWith('none');
      expect(selection.limpiarMarcas).not.toHaveBeenCalled();
    });

    it('clears marks and reloads territories when there is data', () => {
      state.manzanasById.set(new Map([["{ id: 'a', nombreBloque: 'A', color: '#fff', territorioNumero: 1 }"]]));

      component.limpiarTodo();

      expect(selection.limpiarMarcas).toHaveBeenCalled();
      expect(initialization.reloadAllTerritories).toHaveBeenCalled();
    });

    it('just clears marks when there is no data', () => {
      component.limpiarTodo();

      expect(selection.limpiarMarcas).toHaveBeenCalled();
      expect(initialization.reloadAllTerritories).not.toHaveBeenCalled();
    });
  });

  it('ngOnDestroy cancels pending style updates and destroys the rendering', () => {
    component.ngOnDestroy();

    expect(rendering.cancelPendingStyleUpdates).toHaveBeenCalled();
    expect(rendering.destroy).toHaveBeenCalled();
  });
});
