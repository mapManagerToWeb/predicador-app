import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapMarkRestorationService } from './map-mark-restoration.service';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapLayerRegistry } from './map-layer-registry.service';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';

function fakePath() {
  return { setStyle: vi.fn(), getLatLngs: vi.fn(() => []) };
}

describe('MapMarkRestorationService', () => {
  let service: MapMarkRestorationService;
  let state: MapStateService;
  let registry: MapLayerRegistry;
  let rendering: {
    getManzanaIndex: ReturnType<typeof vi.fn>;
    getAllTerritoriesLayer: ReturnType<typeof vi.fn>;
    applyBaseTerritoryStyle: ReturnType<typeof vi.fn>;
    getMap: ReturnType<typeof vi.fn>;
    addExtraLayer: ReturnType<typeof vi.fn>;
    removeExtraLayer: ReturnType<typeof vi.fn>;
    getCurrentTerritoryColor: ReturnType<typeof vi.fn>;
  };
  let territorioService: { getReportesPorTerritorio: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    rendering = {
      getManzanaIndex: vi.fn().mockReturnValue([]),
      getAllTerritoriesLayer: vi.fn().mockReturnValue([]),
      applyBaseTerritoryStyle: vi.fn(),
      getMap: vi.fn().mockReturnValue(null),
      addExtraLayer: vi.fn(),
      removeExtraLayer: vi.fn(),
      getCurrentTerritoryColor: vi.fn().mockReturnValue('#fff'),
      getFeatureLayerByTerritorio: vi.fn().mockReturnValue(undefined),
      getManzanaCountByTerritorio: vi.fn().mockReturnValue(0),
    };
    territorioService = { getReportesPorTerritorio: vi.fn() };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        MapMarkRestorationService,
        MapStateService,
        { provide: MapRenderingFacade, useValue: rendering },
        MapLayerRegistry,
        { provide: TerritorioService, useValue: territorioService },
        { provide: Toast, useValue: toast },
      ],
    });
    service = TestBed.inject(MapMarkRestorationService);
    state = TestBed.inject(MapStateService);
    registry = TestBed.inject(MapLayerRegistry);
  });

  describe('restaurarDesdeDB', () => {
    it('restores marks from the last report', async () => {
      rendering.getAllTerritoriesLayer.mockReturnValue([
        { territorioPadre: 1, color: '#ff0000', layer: {} },
      ]);
      rendering.getManzanaIndex.mockReturnValue([
        { territorioNumero: 1, id: 'm1', nombreBloque: 'A', polygon: fakePath() },
        { territorioNumero: 1, id: 'm2', nombreBloque: 'B', polygon: fakePath() },
      ]);
      territorioService.getReportesPorTerritorio.mockResolvedValue([
        { sessionTime: '2026-08-01T10:00:00Z', manzanasIds: 'm1', manzanaId: null },
      ]);

      await service.restaurarDesdeDB(1);

      expect(rendering.applyBaseTerritoryStyle).toHaveBeenCalled();
      expect(state.manzanasMarcadas().map(m => m.id)).toEqual(['m1']);
      expect(registry.get('m1')).not.toBeNull();
    });

    it('shows a toast when the reports cannot be loaded', async () => {
      territorioService.getReportesPorTerritorio.mockRejectedValue(new Error('boom'));

      await service.restaurarDesdeDB(1);

      expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('restaurar'));
    });
  });

  describe('restaurarConReportes', () => {
    it('applies base territory style with correct completion', () => {
      rendering.getFeatureLayerByTerritorio.mockReturnValue({ territorioPadre: 1, color: '#ff0000', layer: {} });
      rendering.getManzanaCountByTerritorio.mockReturnValue(1);

      service.restaurarConReportes(1, [
        { sessionTime: '2026-08-01T10:00:00Z', manzanasIds: 'm1', manzanaId: null } as never,
      ]);

      expect(rendering.applyBaseTerritoryStyle).toHaveBeenCalledWith(1, '#ff0000', 1, { total: 1, isComplete: true });
    });

    it('resets the territory style with zero marcadas when reports is empty', () => {
      rendering.getManzanaCountByTerritorio.mockReturnValue(0);

      service.restaurarConReportes(1, []);

      expect(rendering.applyBaseTerritoryStyle).toHaveBeenCalledWith(1, '#fff', 0, { total: 0, isComplete: false });
    });
  });
});
