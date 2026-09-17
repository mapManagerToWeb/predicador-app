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
  };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    rendering = {
      hasCachedGeojson: vi.fn(() => false),
      podarGeojsonCache: vi.fn(),
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

  it('skips reconciliation when neither cache holds data', async () => {
    rendering.hasCachedGeojson.mockReturnValue(false);
    territorioService.hasCacheReportes.mockReturnValue(false);

    await service.initialize(document.createElement('div'), vi.fn());

    expect(territorioService.reconciliarCacheConBackend).not.toHaveBeenCalled();
    expect(rendering.podarGeojsonCache).not.toHaveBeenCalled();
  });

  it('prunes caches when the backend confirms deleted territories', async () => {
    rendering.hasCachedGeojson.mockReturnValue(true);
    const vigentes = new Set([1, 2]);
    territorioService.reconciliarCacheConBackend.mockResolvedValue(vigentes);

    await service.initialize(document.createElement('div'), vi.fn());

    expect(territorioService.reconciliarCacheConBackend).toHaveBeenCalled();
    expect(rendering.podarGeojsonCache).toHaveBeenCalledWith(vigentes);
  });

  it('keeps caches when the backend is unreachable during reconciliation', async () => {
    rendering.hasCachedGeojson.mockReturnValue(true);
    territorioService.reconciliarCacheConBackend.mockResolvedValue(null);

    await service.initialize(document.createElement('div'), vi.fn());

    expect(rendering.podarGeojsonCache).not.toHaveBeenCalled();
  });

  it('reloadAllTerritories clears the report cache and reloads', async () => {
    await service.reloadAllTerritories();

    expect(territorioService.limpiarCache).toHaveBeenCalled();
  });
});
