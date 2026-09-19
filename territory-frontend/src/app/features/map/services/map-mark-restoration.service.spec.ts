import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MapMarkRestorationService } from './map-mark-restoration.service';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';

function fakeManzana(id: string, territorioNumero: number) {
  return { id, nombreBloque: `Bloque-${id}`, color: '#ff0000', territorioNumero };
}

describe('MapMarkRestorationService', () => {
  let service: MapMarkRestorationService;
  let state: MapStateService;
  let rendering: {
    getManzanaIndex: ReturnType<typeof vi.fn>;
    getAllTerritoriesLayer: ReturnType<typeof vi.fn>;
    applyBaseTerritoryStyle: ReturnType<typeof vi.fn>;
    getMap: ReturnType<typeof vi.fn>;
    addExtraLayer: ReturnType<typeof vi.fn>;
    removeExtraLayer: ReturnType<typeof vi.fn>;
    getCurrentTerritoryColor: ReturnType<typeof vi.fn>;
    getFeatureLayerByTerritorio: ReturnType<typeof vi.fn>;
    getManzanaCountByTerritorio: ReturnType<typeof vi.fn>;
    refreshMarksVisual: ReturnType<typeof vi.fn>;
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
      refreshMarksVisual: vi.fn(),
    };
    territorioService = { getReportesPorTerritorio: vi.fn() };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        MapMarkRestorationService,
        MapStateService,
        { provide: MapRenderingFacade, useValue: rendering },
        { provide: TerritorioService, useValue: territorioService },
        { provide: Toast, useValue: toast },
      ],
    });
    service = TestBed.inject(MapMarkRestorationService);
    state = TestBed.inject(MapStateService);
  });

  describe('restaurarDesdeDB', () => {
    it('restores marks from the last report', async () => {
      rendering.getManzanaIndex.mockReturnValue([
        fakeManzana('m1', 1),
        fakeManzana('m2', 1),
      ]);
      territorioService.getReportesPorTerritorio.mockResolvedValue([
        { sessionTime: '2026-08-01T10:00:00Z', manzanasIds: 'm1', manzanaId: null },
      ]);

      await service.restaurarDesdeDB(1);

      expect(state.manzanasMarcadaList().map(m => m.id)).toEqual(['m1']);
    });

    it('shows a toast when the reports cannot be loaded', async () => {
      territorioService.getReportesPorTerritorio.mockRejectedValue(new Error('boom'));

      await service.restaurarDesdeDB(1);

      expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('restaurar'));
    });
  });

  describe('restaurarConReportes', () => {
    it('applies marks based on the reports', () => {
      rendering.getManzanaIndex.mockReturnValue([
        fakeManzana('m1', 1),
        fakeManzana('m2', 1),
      ]);

      service.restaurarConReportes(1, [
        { sessionTime: '2026-08-01T10:00:00Z', manzanasIds: 'm1', manzanaId: null } as never,
      ]);

      expect(state.manzanasMarcadaList().map(m => m.id)).toEqual(['m1']);
    });

    it('resets the territory with empty state when reports is empty', () => {
      service.restaurarConReportes(1, []);

      expect(state.manzanasMarcadaList()).toEqual([]);
    });

    it('paints restored marks without registering them as editable marks', () => {
      rendering.getManzanaIndex.mockReturnValue([
        fakeManzana('m1', 1),
        fakeManzana('m2', 1),
      ]);

      service.restaurarConReportes(
        1,
        [{ sessionTime: '2026-08-01T10:00:00Z', manzanasIds: 'm1,m2', manzanaId: null } as never],
        undefined,
        { actualizarEstadoMarcado: false }
      );

      // Visible (the map can paint them)…
      expect(state.manzanasVisiblesList().map(m => m.id).sort()).toEqual(['m1', 'm2']);
      // …but they are NOT the user's marks: no duplicate send on load.
      expect(state.manzanasMarcadaList()).toEqual([]);
      expect(rendering.refreshMarksVisual).toHaveBeenCalled();
    });

    it('drops previously restored marks when the backend has no report', () => {
      service.restaurarConReportes(
        1,
        [{ sessionTime: '2026-08-01T10:00:00Z', manzanasIds: 'm1', manzanaId: null } as never],
        undefined,
        { actualizarEstadoMarcado: false }
      );
      expect(state.manzanasVisiblesList().map(m => m.id)).toEqual(['m1']);

      service.restaurarConReportes(1, [], undefined, { actualizarEstadoMarcado: false });

      expect(state.manzanasVisiblesList()).toEqual([]);
    });

    it('promotes restored marks to editable state when the territory is selected', () => {
      service.restaurarConReportes(
        1,
        [{ sessionTime: '2026-08-01T10:00:00Z', manzanasIds: 'm1', manzanaId: null } as never],
        undefined,
        { actualizarEstadoMarcado: false }
      );

      service.restaurarConReportes(1, [
        { sessionTime: '2026-08-01T10:00:00Z', manzanasIds: 'm1', manzanaId: null } as never,
      ]);

      expect(state.manzanasMarcadaList().map(m => m.id)).toEqual(['m1']);
      // The display-only copy is gone, so toggling the mark off cannot resurrect it.
      expect(state.restoredMarksById().size).toBe(0);
    });
  });
});
