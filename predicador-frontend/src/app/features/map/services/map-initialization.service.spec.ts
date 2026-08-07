import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as L from 'leaflet';
import { MapInitializationService } from './map-initialization.service';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';

describe('MapInitializationService', () => {
  let service: MapInitializationService;
  let state: MapStateService;
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
  };
  let territorioService: {
    getReportesPorTerritorios: ReturnType<typeof vi.fn>;
    invalidateAll: ReturnType<typeof vi.fn>;
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
    };
    territorioService = {
      getReportesPorTerritorios: vi.fn().mockResolvedValue(new Map()),
      invalidateAll: vi.fn(),
    };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        MapInitializationService,
        MapStateService,
        { provide: MapRenderingFacade, useValue: rendering },
        { provide: MapSelectionService, useValue: selection },
        { provide: TerritorioService, useValue: territorioService },
        { provide: Toast, useValue: toast },
      ],
    });
    service = TestBed.inject(MapInitializationService);
    state = TestBed.inject(MapStateService);
  });

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

  it('toggles a manzana from the click handler only in completa mode', async () => {
    await service.initialize(document.createElement('div'), vi.fn());
    const handler = rendering.setManzanaClickHandler.mock.calls[0][0];
    const event = {
      originalEvent: { stopPropagation: vi.fn(), preventDefault: vi.fn() },
    } as never;

    state.modoMarcado.set('completa');
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

  it('restores all marks from the last reports after load', async () => {
    rendering.getAllTerritoriesLayer.mockReturnValue([
      { territorioPadre: 1, color: '#00ff00', layer: {} },
      { territorioPadre: 2, color: '#0000ff', layer: {} },
    ]);
    territorioService.getReportesPorTerritorios.mockResolvedValue(
      new Map([[1, [{ id: 1 }] as never]])
    );

    await service.initialize(document.createElement('div'), vi.fn());

    expect(territorioService.getReportesPorTerritorios).toHaveBeenCalledWith([1, 2]);
    expect(selection.restaurarMarcadoConReportes).toHaveBeenCalledWith(1, [{ id: 1 }], '#00ff00', { actualizarEstadoMarcado: false });
    expect(selection.restaurarMarcadoConReportes).toHaveBeenCalledWith(2, [], '#0000ff', { actualizarEstadoMarcado: false });
  });

  it('shows a toast and clears the loading flag when territory loading fails', async () => {
    rendering.loadAllTerritories.mockRejectedValue(new Error('boom'));

    await service.initialize(document.createElement('div'), vi.fn());

    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('cargar'));
    expect(state.isLoading()).toBe(false);
  });

  it('reloadAllTerritories invalidates caches and reloads', async () => {
    await service.reloadAllTerritories();

    expect(territorioService.invalidateAll).toHaveBeenCalled();
    expect(rendering.loadAllTerritories).toHaveBeenCalledWith(territorioService);
  });
});
