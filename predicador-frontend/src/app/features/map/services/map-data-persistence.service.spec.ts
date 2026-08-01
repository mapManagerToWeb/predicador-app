import { TestBed } from '@angular/core/testing';
import { MapDataPersistenceService } from './map-data-persistence.service';
import { MapStateService } from './map-state.service';
import { MapReportService } from '../map-report.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';

describe('MapDataPersistenceService', () => {
  let service: MapDataPersistenceService;
  let state: MapStateService;
  let report: {
    getProfile: ReturnType<typeof vi.fn>;
    buildRegistros: ReturnType<typeof vi.fn>;
    buildTerritoriosEnvio: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    report = {
      getProfile: vi.fn().mockReturnValue({ name: 'A', lastName: 'B', avatar: 0 }),
      buildRegistros: vi.fn().mockReturnValue([]),
      buildTerritoriosEnvio: vi.fn().mockReturnValue([]),
    };
    TestBed.configureTestingModule({
      providers: [
        MapDataPersistenceService,
        MapStateService,
        { provide: MapReportService, useValue: report },
        { provide: MapRenderingFacade, useValue: { getAllTerritoriesLayer: vi.fn().mockReturnValue([]) } },
        { provide: MapSelectionService, useValue: {} },
        { provide: TerritorioService, useValue: {} },
        { provide: Toast, useValue: { show: vi.fn() } },
      ],
    });
    service = TestBed.inject(MapDataPersistenceService);
    state = TestBed.inject(MapStateService);
    state.manzanasMarcadas.set([{ id: 'A', nombreBloque: 'A', layer: {} as never, territorioNumero: 1 }]);
  });

  it('clears loading when database report construction fails', async () => {
    report.buildRegistros.mockImplementation(() => {
      throw new Error('build failed');
    });

    await service.guardarEnBaseDeDatos();

    expect(state.enviando()).toBe(false);
  });

  it('clears loading when WhatsApp territory construction fails', async () => {
    report.buildTerritoriosEnvio.mockImplementation(() => {
      throw new Error('build failed');
    });

    await service.guardarYEnviar();

    expect(state.enviando()).toBe(false);
  });
});
