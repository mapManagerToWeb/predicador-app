import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapInitializationService } from './map-initialization.service';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { TerritorioService } from '../../../core/services/territorio';
import { DraftMarksService } from './map-draft';
import { Toast } from '../../../core/services/toast';

describe('MapInitializationService', () => {
  let service: MapInitializationService;
  let state: MapStateService;
  let rendering: {
    hasCachedGeojson: ReturnType<typeof vi.fn>;
    podarGeojsonCache: ReturnType<typeof vi.fn>;
    fetchAndBuildFeatureLayers: ReturnType<typeof vi.fn>;
    loadGeoJsonMetadata: ReturnType<typeof vi.fn>;
    getAllTerritoriesLayer: ReturnType<typeof vi.fn>;
    getTerritoryDataCache: ReturnType<typeof vi.fn>;
  };
  let selection: {
    restaurarMarcadoDesdeDB: ReturnType<typeof vi.fn>;
    restaurarMarcadoConReportes: ReturnType<typeof vi.fn>;
    reaplicarMarcasSeleccionadas: ReturnType<typeof vi.fn>;
  };
  let territorioService: {
    hasCacheReportes: ReturnType<typeof vi.fn>;
    reconciliarCacheConBackend: ReturnType<typeof vi.fn>;
    limpiarCache: ReturnType<typeof vi.fn>;
    getReportesDesdeCache: ReturnType<typeof vi.fn>;
    revalidarReportes: ReturnType<typeof vi.fn>;
  };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    rendering = {
      hasCachedGeojson: vi.fn(() => false),
      podarGeojsonCache: vi.fn(),
      fetchAndBuildFeatureLayers: vi.fn().mockResolvedValue(undefined),
      loadGeoJsonMetadata: vi.fn().mockResolvedValue(undefined),
      getAllTerritoriesLayer: vi.fn().mockReturnValue([]),
      getTerritoryDataCache: vi.fn().mockReturnValue(new Map()),
    };
    selection = {
      restaurarMarcadoDesdeDB: vi.fn().mockResolvedValue(undefined),
      restaurarMarcadoConReportes: vi.fn(),
      reaplicarMarcasSeleccionadas: vi.fn(),
    };
    territorioService = {
      hasCacheReportes: vi.fn(() => false),
      reconciliarCacheConBackend: vi.fn(async () => null),
      limpiarCache: vi.fn(),
      getColores: vi.fn(async () => ({})),
      getReportesDesdeCache: vi.fn(() => new Map()),
      revalidarReportes: vi.fn(async () => new Map()),
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
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  it('initializes without error', async () => {
    await service.initialize(document.createElement('div'), vi.fn());
    expect(state.isLoading()).toBe(false);
  });

  it('fetches colors even when no cache exists', async () => {
    rendering.hasCachedGeojson.mockReturnValue(false);
    territorioService.hasCacheReportes.mockReturnValue(false);

    await service.initialize(document.createElement('div'), vi.fn());

    expect(rendering.fetchAndBuildFeatureLayers).toHaveBeenCalled();
  });

  it('fetches territory colors during initialization', async () => {
    const colors = { 1: '#ff0000', 2: '#00ff00' };
    territorioService.getColores.mockResolvedValue(colors);

    await service.initialize(document.createElement('div'), vi.fn());

    expect(rendering.fetchAndBuildFeatureLayers).toHaveBeenCalled();
    expect(rendering.loadGeoJsonMetadata).toHaveBeenCalled();
  });

  it('handles fetch errors gracefully', async () => {
    rendering.fetchAndBuildFeatureLayers.mockRejectedValue(new Error('network'));

    await service.initialize(document.createElement('div'), vi.fn());

    expect(toast.show).toHaveBeenCalled();
    expect(state.isLoading()).toBe(false);
  });

  it('reloadAllTerritories clears the report cache and reloads', async () => {
    await service.reloadAllTerritories();

    expect(territorioService.limpiarCache).toHaveBeenCalled();
  });

  it('revalidates every loaded territory at load (the territory data cache is empty in MapLibre mode)', async () => {
    rendering.getAllTerritoriesLayer.mockReturnValue([
      { territorioPadre: 56, color: '#ff0000' },
      { territorioPadre: 57, color: '#00ff00' },
    ] as never);
    rendering.getTerritoryDataCache.mockReturnValue(new Map());
    territorioService.getReportesDesdeCache.mockReturnValue(new Map());
    territorioService.revalidarReportes.mockResolvedValue(new Map());

    await service.initialize(document.createElement('div'), vi.fn());

    expect(territorioService.revalidarReportes).toHaveBeenCalledWith([56, 57]);
  });

  it('never asks for the versions of territories that hold a local draft', async () => {
    rendering.getAllTerritoriesLayer.mockReturnValue([
      { territorioPadre: 56, color: '#ff0000' },
      { territorioPadre: 57, color: '#00ff00' },
    ] as never);
    rendering.getTerritoryDataCache.mockReturnValue(new Map());
    territorioService.getReportesDesdeCache.mockReturnValue(new Map());
    territorioService.revalidarReportes.mockResolvedValue(new Map());
    TestBed.inject(DraftMarksService).guardar({
      manzanasById: { m1: { id: 'm1', nombreBloque: '', color: '#fff', territorioNumero: 56 } },
      territoriosSeleccionados: [56],
      territorioSeleccionado: 56,
      datosParcialesGuardados: {},
      modoMarcado: 'none',
      predicacion: 'tarde',
      savedAt: Date.now(),
    });

    await service.initialize(document.createElement('div'), vi.fn());

    expect(territorioService.revalidarReportes).toHaveBeenCalledWith([57]);
  });
});
