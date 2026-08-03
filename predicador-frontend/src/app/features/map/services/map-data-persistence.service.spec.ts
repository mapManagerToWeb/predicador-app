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
    captureScreenshot: ReturnType<typeof vi.fn>;
    buildWhatsAppRequest: ReturnType<typeof vi.fn>;
    saveToDatabase: ReturnType<typeof vi.fn>;
    sendWhatsApp: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    report = {
      getProfile: vi.fn().mockReturnValue({ name: 'A', lastName: 'B', avatar: 0, telefono: '56912345678' }),
      buildRegistros: vi.fn().mockReturnValue([]),
      buildTerritoriosEnvio: vi.fn().mockReturnValue([]),
      captureScreenshot: vi.fn().mockResolvedValue('screenshot-base64'),
      buildWhatsAppRequest: vi.fn().mockReturnValue({}),
      saveToDatabase: vi.fn().mockResolvedValue([]),
      sendWhatsApp: vi.fn().mockResolvedValue({ success: true }),
    };
    TestBed.configureTestingModule({
      providers: [
        MapDataPersistenceService,
        MapStateService,
        { provide: MapReportService, useValue: report },
        { provide: MapRenderingFacade, useValue: { getAllTerritoriesLayer: vi.fn().mockReturnValue([]) } },
        { provide: MapSelectionService, useValue: { reaplicarMarcasSeleccionadas: vi.fn(), restaurarMarcadoDesdeDB: vi.fn().mockResolvedValue(undefined) } },
        { provide: TerritorioService, useValue: { invalidateReportCache: vi.fn() } },
        { provide: Toast, useValue: { show: vi.fn() } },
      ],
    });
    service = TestBed.inject(MapDataPersistenceService);
    state = TestBed.inject(MapStateService);
    state.manzanasMarcadas.set([{ id: 'A', nombreBloque: 'A', color: '#fff', territorioNumero: 1 }]);
    state.territoriosSeleccionados.set([1]);
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
    expect(report.captureScreenshot).not.toHaveBeenCalled();
  });

  it('always captures a screenshot before sending, even when every territory is finished', async () => {
    report.buildTerritoriosEnvio.mockReturnValue([
      { numero: 1, finalizado: true, totalManzanas: 1, manzanasMarcadas: 1 },
    ]);
    report.buildWhatsAppRequest.mockReturnValue({
      encargadoNombre: 'A',
      encargadoApellido: 'B',
      fechaRegistro: '01-08-2026',
      predicacion: 'tarde',
      territorios: [{ numero: 1, finalizado: true, totalManzanas: 1, manzanasMarcadas: 1 }],
      screenshotBase64: 'screenshot-base64',
      destinationNumber: '56912345678',
    });

    await service.guardarYEnviar();

    expect(report.captureScreenshot).toHaveBeenCalledTimes(1);
    expect(report.sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(report.buildWhatsAppRequest).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'A' }),
      expect.arrayContaining([expect.objectContaining({ finalizado: true })]),
      'screenshot-base64',
      'tarde'
    );
    expect(state.enviando()).toBe(false);
  });

  it('reports incomplete territories with the *incompleto* wording on success', async () => {
    report.buildTerritoriosEnvio.mockReturnValue([
      { numero: 1, finalizado: true, totalManzanas: 1, manzanasMarcadas: 1 },
      { numero: 2, finalizado: false, totalManzanas: 1, manzanasMarcadas: 0 },
    ]);
    const toast = TestBed.inject(Toast);
    const show = toast.show as ReturnType<typeof vi.fn>;

    await service.guardarYEnviar();

    expect(show).toHaveBeenCalledWith(expect.stringContaining('*incompleto*'));
    expect(show).not.toHaveBeenCalledWith(expect.stringContaining('*faltante*'));
  });
});
