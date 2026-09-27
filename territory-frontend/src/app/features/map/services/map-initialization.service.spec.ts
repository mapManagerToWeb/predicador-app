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
    loadTerritoryMetadata: ReturnType<typeof vi.fn>;
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
      loadTerritoryMetadata: vi.fn().mockResolvedValue(undefined),
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
    expect(rendering.loadTerritoryMetadata).toHaveBeenCalled();
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

  it('loadAllTerritoriesPublic runs the same load flow MapPage boot uses', async () => {
    await service.loadAllTerritoriesPublic();

    expect(rendering.fetchAndBuildFeatureLayers).toHaveBeenCalled();
    expect(rendering.loadTerritoryMetadata).toHaveBeenCalled();
    expect(rendering.getAllTerritoriesLayer).toHaveBeenCalled();
    expect(state.isLoading()).toBe(false);
  });

  it('applies background revalidation results to territories that already have a layer', async () => {
    rendering.getAllTerritoriesLayer.mockReturnValue([
      { territorioPadre: 56, color: '#ff0000' },
      { territorioPadre: 57, color: '#00ff00' },
    ] as never);
    rendering.getTerritoryDataCache.mockReturnValue(new Map());
    territorioService.getReportesDesdeCache.mockReturnValue(new Map());
    territorioService.revalidarReportes.mockResolvedValue(
      new Map([[56, [{ id: 1 } as never]]]),
    );

    await service.loadAllTerritoriesPublic();

    // The revalidation pass restores 56 with the freshly fetched reportes and
    // the layer's color; 57 got only the instant (empty) paint from the
    // localStorage pass, never a revalidation result.
    expect(selection.restaurarMarcadoConReportes).toHaveBeenCalledWith(
      56,
      [{ id: 1 }],
      '#ff0000',
      { actualizarEstadoMarcado: false },
    );
    expect(
      selection.restaurarMarcadoConReportes.mock.calls.filter(([numero]) => numero === 57),
    ).toHaveLength(1); // instant paint only
  });

  it('skips revalidation results whose layer has not been built yet (cache stays seeded)', async () => {
    rendering.getAllTerritoriesLayer.mockReturnValue([
      { territorioPadre: 56, color: '#ff0000' },
    ] as never);
    rendering.getTerritoryDataCache.mockReturnValue(new Map());
    territorioService.getReportesDesdeCache.mockReturnValue(new Map());
    territorioService.revalidarReportes.mockResolvedValue(
      new Map([[99, [{ id: 9 } as never]]]),
    );

    await service.loadAllTerritoriesPublic();

    expect(territorioService.revalidarReportes).toHaveBeenCalledWith([56]);
    // 99 has no layer → the result must not be painted against any territory.
    expect(
      selection.restaurarMarcadoConReportes.mock.calls.filter(([numero]) => numero === 99),
    ).toHaveLength(0);
  });

  it('swallows revalidation failures (offline) instead of surfacing a load error', async () => {
    rendering.getAllTerritoriesLayer.mockReturnValue([
      { territorioPadre: 56, color: '#ff0000' },
    ] as never);
    rendering.getTerritoryDataCache.mockReturnValue(new Map());
    territorioService.getReportesDesdeCache.mockReturnValue(new Map());
    territorioService.revalidarReportes.mockRejectedValue(new Error('offline'));

    await service.loadAllTerritoriesPublic();

    expect(toast.show).not.toHaveBeenCalled();
    expect(state.isLoading()).toBe(false);
  });

  it('seeds per-territory partial geometry from the draft before restoring marks', async () => {
    rendering.getAllTerritoriesLayer.mockReturnValue([
      { territorioPadre: 56, color: '#ff0000' },
    ] as never);
    rendering.getTerritoryDataCache.mockReturnValue(new Map());
    territorioService.getReportesDesdeCache.mockReturnValue(new Map());
    territorioService.revalidarReportes.mockResolvedValue(new Map());
    const polygonJson = JSON.stringify({
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    });
    TestBed.inject(DraftMarksService).guardar({
      manzanasById: {
        'parcial-1': { id: 'parcial-1', nombreBloque: 'Zona parcial', color: '#ff0000', territorioNumero: 56 },
      },
      territoriosSeleccionados: [56],
      territorioSeleccionado: 56,
      datosParcialesGuardados: {
        56: {
          puntos: [{ lat: -37.4, lng: -73.25, edgeIdx: 0, t: 0.5 }],
          geometria: polygonJson,
        },
      },
      modoMarcado: 'none',
      predicacion: 'tarde',
      savedAt: Date.now(),
    });

    await service.initialize(document.createElement('div'), vi.fn());

    // The overlay synthesis reads these records, so they must exist before
    // the per-territory restore runs (bug fix "modo parcial").
    expect(state.getDatosParciales(56)?.puntos).toEqual([
      { latlng: { lat: -37.4, lng: -73.25 }, edgeIdx: 0, t: 0.5 },
    ]);
    expect(state.getDatosParciales(56)?.geometria).toBe(polygonJson);
    // The draft's editable parcial mark is kept — the restore must not paint
    // a duplicate zone.
    expect(state.manzanasById().get('parcial-1')).toBeDefined();
    // Draft territories are skipped by the background revalidation.
    expect(territorioService.revalidarReportes).not.toHaveBeenCalled();
  });
});
