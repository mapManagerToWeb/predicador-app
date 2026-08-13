import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as L from 'leaflet';
import { MapInitializationService } from './map-initialization.service';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { TerritorioService } from '../../../core/services/territorio';
import { DraftMarksService } from '../../../core/services/map-draft';
import { Toast } from '../../../core/services/toast';

describe('MapInitializationService', () => {
  let service: MapInitializationService;
  let state: MapStateService;
  let drafts: DraftMarksService;
  let rendering: {
    initializeMap: ReturnType<typeof vi.fn>;
    getMap: ReturnType<typeof vi.fn>;
    setManzanaClickHandler: ReturnType<typeof vi.fn>;
    loadAllTerritories: ReturnType<typeof vi.fn>;
    updateVisibleTerritories: ReturnType<typeof vi.fn>;
    getAllTerritoriesLayer: ReturnType<typeof vi.fn>;
    ocultarPoligonosNoSeleccionados: ReturnType<typeof vi.fn>;
    updateLabelsVisibility: ReturnType<typeof vi.fn>;
  };
  let selection: {
    toggleManzana: ReturnType<typeof vi.fn>;
    restaurarMarcadoDesdeDB: ReturnType<typeof vi.fn>;
    restaurarMarcadoConReportes: ReturnType<typeof vi.fn>;
    reaplicarMarcasSeleccionadas: ReturnType<typeof vi.fn>;
  };
  let territorioService: {
    getReportesDesdeCache: ReturnType<typeof vi.fn>;
    revalidarReportes: ReturnType<typeof vi.fn>;
    limpiarCache: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let toast: { show: ReturnType<typeof vi.fn> };
  let fakeMap: { on: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    fakeMap = { on: vi.fn() };
    rendering = {
      initializeMap: vi.fn(),
      getMap: vi.fn().mockReturnValue(fakeMap),
      setManzanaClickHandler: vi.fn(),
      loadAllTerritories: vi.fn().mockResolvedValue(undefined),
      updateVisibleTerritories: vi.fn().mockReturnValue([]),
      getAllTerritoriesLayer: vi.fn().mockReturnValue([]),
      getFeatureLayerByTerritorio: vi.fn().mockReturnValue(undefined),
      ocultarPoligonosNoSeleccionados: vi.fn(),
      updateLabelsVisibility: vi.fn(),
    };
    selection = {
      toggleManzana: vi.fn(),
      restaurarMarcadoDesdeDB: vi.fn().mockResolvedValue(undefined),
      restaurarMarcadoConReportes: vi.fn(),
      reaplicarMarcasSeleccionadas: vi.fn(),
    };
    territorioService = {
      getReportesDesdeCache: vi.fn(() => new Map()),
      revalidarReportes: vi.fn(async () => new Map()),
      limpiarCache: vi.fn(),
      logout: vi.fn(),
    };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        MapInitializationService,
        MapStateService,
        DraftMarksService,
        { provide: MapRenderingFacade, useValue: rendering },
        { provide: MapSelectionService, useValue: selection },
        { provide: TerritorioService, useValue: territorioService },
        { provide: Toast, useValue: toast },
      ],
    });
    service = TestBed.inject(MapInitializationService);
    state = TestBed.inject(MapStateService);
    drafts = TestBed.inject(DraftMarksService);
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  it('initializes the map and registers click/zoom/move handlers', async () => {
    const el = document.createElement('div');
    const onClick = vi.fn();

    await service.initialize(el, onClick);

    expect(rendering.initializeMap).toHaveBeenCalledWith(el);
    expect(fakeMap.on).toHaveBeenCalledWith('click', onClick);
    expect(fakeMap.on).toHaveBeenCalledWith('zoomend', expect.any(Function));
    expect(fakeMap.on).toHaveBeenCalledWith('moveend', expect.any(Function));
    expect(state.isLoading()).toBe(false);
  });

  it('stops early when the map could not be created', async () => {
    rendering.getMap.mockReturnValue(null);

    await service.initialize(document.createElement('div'), vi.fn());

    expect(rendering.initializeMap).toHaveBeenCalled();
    expect(fakeMap.on).not.toHaveBeenCalled();
  });

  it('toggles a manzana from the click handler only in completa mode and only for selected territories', async () => {
    await service.initialize(document.createElement('div'), vi.fn());
    const handler = rendering.setManzanaClickHandler.mock.calls[0][0];
    const event = {
      originalEvent: { stopPropagation: vi.fn(), preventDefault: vi.fn() },
    } as never;

    state.modoMarcado.set('completa');
    // Territorio NO seleccionado: el click debe ignorarse (bloquea seleccionar
    // territorios ajenos desde el modo marcar-completo).
    handler('m0', 'Otro', {} as L.Polygon, '#0000ff', 99, event as L.LeafletMouseEvent);
    expect(selection.toggleManzana).not.toHaveBeenCalled();

    // Territorio seleccionado: sí permite marcar/desmarcar manzanas.
    state.territoriosSeleccionados.set([5]);
    handler('m1', 'A', {} as L.Polygon, '#ff0000', 5, event as L.LeafletMouseEvent);
    expect(selection.toggleManzana).toHaveBeenCalledWith('m1', 'A', {}, '#ff0000', 5);

    selection.toggleManzana.mockClear();
    state.modoMarcado.set('none');
    handler('m2', 'B', {} as L.Polygon, '#00ff00', 6, event as L.LeafletMouseEvent);
    expect(selection.toggleManzana).not.toHaveBeenCalled();
  });

  it('restores marks for newly visible territories and hides the rest while marking', async () => {
    rendering.updateVisibleTerritories.mockReturnValue([3]);
    rendering.getFeatureLayerByTerritorio.mockReturnValue({ territorioPadre: 3, color: '#ff0000', layer: {} });
    state.modoMarcado.set('completa');

    await service.initialize(document.createElement('div'), vi.fn());

    expect(rendering.getFeatureLayerByTerritorio).toHaveBeenCalledWith(3);
    expect(selection.restaurarMarcadoDesdeDB).toHaveBeenCalledWith(3, '#ff0000', { actualizarEstadoMarcado: false });
    expect(rendering.ocultarPoligonosNoSeleccionados).toHaveBeenCalled();
  });

  it('restores all marks from cache and revalidates territories without a draft', async () => {
    rendering.getAllTerritoriesLayer.mockReturnValue([
      { territorioPadre: 1, color: '#00ff00', layer: {} },
      { territorioPadre: 2, color: '#0000ff', layer: {} },
    ]);
    territorioService.getReportesDesdeCache.mockReturnValue(
      new Map([[1, [{ id: 1 }] as never]])
    );
    territorioService.revalidarReportes.mockResolvedValue(
      new Map([[2, [{ id: 2 }] as never]])
    );

    await service.initialize(document.createElement('div'), vi.fn());

    expect(territorioService.getReportesDesdeCache).toHaveBeenCalledWith([1, 2]);
    expect(territorioService.revalidarReportes).toHaveBeenCalledWith([1, 2]);
    expect(selection.restaurarMarcadoConReportes).toHaveBeenCalledWith(1, [{ id: 1 }], '#00ff00', { actualizarEstadoMarcado: false });
    expect(selection.restaurarMarcadoConReportes).toHaveBeenCalledWith(2, [{ id: 2 }], '#0000ff', { actualizarEstadoMarcado: false });
  });

  it('restores the draft when one exists and skips cache paint + revalidation for drafted territories', async () => {
    rendering.getAllTerritoriesLayer.mockReturnValue([
      { territorioPadre: 1, color: '#3b82f6', layer: {} },
      { territorioPadre: 2, color: '#00ff00', layer: {} },
    ]);
    drafts.guardar({
      manzanasById: { A: { id: 'A', nombreBloque: 'Bloque A', color: '#3b82f6', territorioNumero: 1 } },
      territoriosSeleccionados: [1],
      territorioSeleccionado: 1,
      datosParcialesGuardados: {},
      modoMarcado: 'completa',
      predicacion: 'tarde',
      savedAt: Date.now(),
    });
    territorioService.getReportesDesdeCache.mockReturnValue(
      new Map([[2, [{ id: 2 }] as never]])
    );

    await service.initialize(document.createElement('div'), vi.fn());

    const reportes = selection.restaurarMarcadoConReportes;
    const callPara1 = reportes.mock.calls.find(c => c[0] === 1);
    expect(callPara1).toBeDefined();
    expect(callPara1![1].length).toBe(1);
    expect(callPara1![3]).toEqual({ actualizarEstadoMarcado: false });
    expect(territorioService.revalidarReportes).not.toHaveBeenCalledWith(expect.arrayContaining([1]));
    expect(state.territoriosSeleccionados()).toEqual([1]);
    expect(state.modoMarcado()).toBe('completa');
    expect(state.predicacion()).toBe('tarde');
  });

  it('shows a toast and clears the loading flag when territory loading fails after all retries', async () => {
    vi.useFakeTimers();
    try {
      rendering.loadAllTerritories.mockRejectedValue(new Error('boom'));

      const initPromise = service.initialize(document.createElement('div'), vi.fn());
      await vi.advanceTimersByTimeAsync(200_000);
      await initPromise;

      expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('cargar'));
      expect(state.isLoading()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries the territory load after a transient failure and succeeds', async () => {
    vi.useFakeTimers();
    try {
      rendering.loadAllTerritories
        .mockRejectedValueOnce(new Error('cold start'))
        .mockResolvedValueOnce(undefined);

      const initPromise = service.initialize(document.createElement('div'), vi.fn());
      await vi.advanceTimersByTimeAsync(10_000);
      await initPromise;

      expect(rendering.loadAllTerritories).toHaveBeenCalledTimes(2);
      expect(toast.show).not.toHaveBeenCalled();
      expect(state.isLoading()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reloadAllTerritories clears the report cache and reloads', async () => {
    await service.reloadAllTerritories();

    expect(territorioService.limpiarCache).toHaveBeenCalled();
    expect(rendering.loadAllTerritories).toHaveBeenCalledWith(territorioService);
  });
});
