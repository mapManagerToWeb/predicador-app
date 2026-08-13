import { TestBed } from '@angular/core/testing';
import { MapDataPersistenceService } from './map-data-persistence.service';
import { MapStateService } from './map-state.service';
import { MapReportService } from '../map-report.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import { ReportCacheService } from '../../../core/services/report-cache';
import { DraftMarksService } from '../../../core/services/map-draft';

describe('MapDataPersistenceService', () => {
  let service: MapDataPersistenceService;
  let state: MapStateService;
  let report: {
    getProfile: ReturnType<typeof vi.fn>;
    buildRegistros: ReturnType<typeof vi.fn>;
    buildTerritoriosEnvioSoloIncompletos: ReturnType<typeof vi.fn>;
    captureScreenshot: ReturnType<typeof vi.fn>;
    buildWhatsAppRequest: ReturnType<typeof vi.fn>;
    saveToDatabase: ReturnType<typeof vi.fn>;
    sendWhatsApp: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    report = {
      getProfile: vi.fn().mockReturnValue({ name: 'A', lastName: 'B', avatar: 0, telefono: '56912345678' }),
      buildRegistros: vi.fn().mockReturnValue([]),
      buildTerritoriosEnvioSoloIncompletos: vi.fn().mockReturnValue([]),
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
        { provide: TerritorioService, useValue: { crearReportes: vi.fn().mockResolvedValue([]) } },
        { provide: Toast, useValue: { show: vi.fn() } },
        { provide: ReportCacheService, useValue: {
            setTerritorio: vi.fn(), getCache: vi.fn(() => new Map()), clear: vi.fn(),
            setTerritorios: vi.fn(), removeTerritorios: vi.fn(), hasData: vi.fn(() => false),
        } },
        { provide: DraftMarksService, useValue: { eliminarTerritorios: vi.fn(), clear: vi.fn(), cargar: vi.fn(() => null), guardar: vi.fn() } },
      ],
    });
    service = TestBed.inject(MapDataPersistenceService);
    state = TestBed.inject(MapStateService);
    state.manzanasById.set(new Map([["{ id: 'A', nombreBloque: 'A', color: '#fff', territorioNumero: 1 }"]]));
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
    report.buildTerritoriosEnvioSoloIncompletos.mockImplementation(() => {
      throw new Error('build failed');
    });

    await service.guardarYEnviar();

    expect(state.enviando()).toBe(false);
    expect(report.captureScreenshot).not.toHaveBeenCalled();
  });

  it('does NOT capture or send when every territory is finished', async () => {
    report.buildTerritoriosEnvioSoloIncompletos.mockReturnValue([]);
    const toast = TestBed.inject(Toast);
    const show = toast.show as ReturnType<typeof vi.fn>;

    await service.guardarYEnviar();

    expect(report.captureScreenshot).not.toHaveBeenCalled();
    expect(report.sendWhatsApp).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(expect.stringContaining('No hay territorios incompletos para enviar'));
    expect(state.enviando()).toBe(false);
  });

  it('reports incomplete territories with the *incompleto* wording on success', async () => {
    report.buildTerritoriosEnvioSoloIncompletos.mockReturnValue([
      { numero: 2, finalizado: false, totalManzanas: 1, manzanasMarcadas: 0 },
    ]);
    report.captureScreenshot.mockResolvedValue('screenshot-base64');
    report.buildWhatsAppRequest.mockReturnValue({
      encargadoNombre: 'A',
      encargadoApellido: 'B',
      fechaRegistro: '01-08-2026',
      predicacion: 'tarde',
      territorios: [{ numero: 2, finalizado: false, totalManzanas: 1, manzanasMarcadas: 0 }],
      screenshotBase64: 'screenshot-base64',
      destinationNumber: '56912345678',
    });
    report.sendWhatsApp.mockResolvedValue(true);

    const toast = TestBed.inject(Toast);
    const show = toast.show as ReturnType<typeof vi.fn>;

    await service.guardarYEnviar();

    expect(report.captureScreenshot).toHaveBeenCalledTimes(1);
    expect(report.sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(expect.stringContaining('*incompleto*'));
    expect(show).not.toHaveBeenCalledWith(expect.stringContaining('*faltante*'));
  });

  it('writes the report cache and clears the draft for saved territories', async () => {
    const saved = [{ id: 10, ...reporteShape(1) }];
    report.saveToDatabase.mockResolvedValue(saved);

    await service.guardarEnBaseDeDatos();

    const cache = TestBed.inject(ReportCacheService) as unknown as { setTerritorio: ReturnType<typeof vi.fn> };
    const drafts = TestBed.inject(DraftMarksService) as unknown as { eliminarTerritorios: ReturnType<typeof vi.fn> };
    expect(cache.setTerritorio).toHaveBeenCalledWith(1, saved[0]);
    expect(drafts.eliminarTerritorios).toHaveBeenCalledWith([1]);
    expect(report.saveToDatabase).toHaveBeenCalledTimes(1);
  });

  it('does not touch cache or draft when the POST fails', async () => {
    report.saveToDatabase.mockRejectedValue(new Error('boom'));

    await service.guardarEnBaseDeDatos();

    const cache = TestBed.inject(ReportCacheService) as unknown as { setTerritorio: ReturnType<typeof vi.fn> };
    const drafts = TestBed.inject(DraftMarksService) as unknown as { eliminarTerritorios: ReturnType<typeof vi.fn> };
    expect(cache.setTerritorio).not.toHaveBeenCalled();
    expect(drafts.eliminarTerritorios).not.toHaveBeenCalled();
    expect(state.enviando()).toBe(false);
  });

  function reporteShape(territorio: number) {
    return {
      manzanaId: null, fecha: '2026-08-12T10:00:00Z', encargadoId: 1,
      encargadoNombre: 'A', encargadoApellido: 'B', sessionTime: '06:00',
      estado: 'completed', territorioNumero: territorio, totalManzanas: 3,
      manzanasMarcadas: 3, tipoSesion: 'completa', geometriaParcial: null,
      puntosParciales: null, manzanasIds: 'A,B,C',
    };
  }
});
