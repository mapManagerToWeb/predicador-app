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
import { TOAST_MESSAGES } from '../utils/map-constants';

describe('MapDataPersistenceService', () => {
  let service: MapDataPersistenceService;
  let state: MapStateService;
  let report: {
    getProfile: ReturnType<typeof vi.fn>;
    buildRegistros: ReturnType<typeof vi.fn>;
    buildTerritoriosParaEnvio: ReturnType<typeof vi.fn>;
    captureScreenshot: ReturnType<typeof vi.fn>;
    buildWhatsAppRequest: ReturnType<typeof vi.fn>;
    saveToDatabase: ReturnType<typeof vi.fn>;
    sendWhatsApp: ReturnType<typeof vi.fn>;
    eliminarReportes: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    report = {
      getProfile: vi.fn().mockReturnValue({ name: 'A', lastName: 'B', avatar: 0, telefono: '56912345678' }),
      buildRegistros: vi.fn().mockReturnValue([]),
      buildTerritoriosParaEnvio: vi.fn().mockReturnValue({ territorios: [], requiereScreenshot: false }),
      captureScreenshot: vi.fn().mockResolvedValue('screenshot-base64'),
      buildWhatsAppRequest: vi.fn().mockReturnValue({}),
      saveToDatabase: vi.fn().mockResolvedValue([]),
      sendWhatsApp: vi.fn().mockResolvedValue(true),
      eliminarReportes: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        MapDataPersistenceService,
        MapStateService,
        { provide: MapReportService, useValue: report },
        { provide: MapRenderingFacade, useValue: {
            getAllTerritoriesLayer: vi.fn().mockReturnValue([]),
            restaurarVistaConMarcas: vi.fn(),
            restaurarVisibilidadPoligonos: vi.fn(),
        } },
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
    report.buildTerritoriosParaEnvio.mockImplementation(() => {
      throw new Error('build failed');
    });

    await service.guardarYEnviar();

    expect(state.enviando()).toBe(false);
    expect(report.captureScreenshot).not.toHaveBeenCalled();
  });

  it('does NOT capture or send when every territory is finished (more than one marked)', async () => {
    report.buildTerritoriosParaEnvio.mockReturnValue({ territorios: [], requiereScreenshot: false });
    const toast = TestBed.inject(Toast);
    const show = toast.show as ReturnType<typeof vi.fn>;

    await service.guardarYEnviar();

    expect(report.captureScreenshot).not.toHaveBeenCalled();
    expect(report.sendWhatsApp).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(TOAST_MESSAGES.noSendableTerritories);
    expect(state.enviando()).toBe(false);
  });

  it('envía un único territorio completado con la imagen oficial (sin captura)', async () => {
    state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]));
    const territorios = [{ numero: 1, finalizado: true, totalManzanas: 1, manzanasMarcadas: 1 }];
    report.buildTerritoriosParaEnvio.mockReturnValue({ territorios, requiereScreenshot: false });

    await service.guardarYEnviar();

    expect(report.captureScreenshot).not.toHaveBeenCalled();
    expect(report.buildWhatsAppRequest).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'A' }),
      territorios,
      null,
      expect.any(String),
    );
    expect(report.sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(state.enviando()).toBe(false);
  });

  it('ACID: does NOT send via WhatsApp when the database save fails (persist-first)', async () => {
    state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]));
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [{ numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 }],
      requiereScreenshot: true,
    });
    report.buildWhatsAppRequest.mockReturnValue({
      encargadoNombre: 'A', encargadoApellido: 'B', fechaRegistro: '01-08-2026',
      predicacion: 'tarde', territorios: [], screenshotBase64: null, destinationNumber: '56912345678',
    });
    report.saveToDatabase.mockRejectedValue(new Error('boom'));
    const toast = TestBed.inject(Toast);
    const show = toast.show as ReturnType<typeof vi.fn>;
    const rendering = TestBed.inject(MapRenderingFacade) as unknown as {
      restaurarVistaConMarcas: ReturnType<typeof vi.fn>;
    };

    await service.guardarYEnviar();

    expect(report.sendWhatsApp).not.toHaveBeenCalled();
    expect(report.eliminarReportes).not.toHaveBeenCalled();
    expect(rendering.restaurarVistaConMarcas).not.toHaveBeenCalled();
    expect(state.manzanasById().size).toBeGreaterThan(0);
    expect(state.territoriosSeleccionados()).toEqual([1]);
    expect(show).toHaveBeenCalledWith(TOAST_MESSAGES.saveError);
    expect(state.enviando()).toBe(false);
  });

  it('ACID: rolls back the saved reports when the WhatsApp send fails (compensation)', async () => {
    state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]));
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [{ numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 }],
      requiereScreenshot: true,
    });
    report.buildWhatsAppRequest.mockReturnValue({
      encargadoNombre: 'A', encargadoApellido: 'B', fechaRegistro: '01-08-2026',
      predicacion: 'tarde', territorios: [], screenshotBase64: null, destinationNumber: '56912345678',
    });
    const guardado = { id: 10, ...reporteShape(1) };
    report.saveToDatabase.mockResolvedValue([guardado]);
    report.sendWhatsApp.mockResolvedValue(false);
    const toast = TestBed.inject(Toast);
    const show = toast.show as ReturnType<typeof vi.fn>;
    const cache = TestBed.inject(ReportCacheService) as unknown as { setTerritorio: ReturnType<typeof vi.fn> };
    const drafts = TestBed.inject(DraftMarksService) as unknown as { eliminarTerritorios: ReturnType<typeof vi.fn> };
    const rendering = TestBed.inject(MapRenderingFacade) as unknown as {
      restaurarVistaConMarcas: ReturnType<typeof vi.fn>;
    };

    await service.guardarYEnviar();

    expect(report.saveToDatabase).toHaveBeenCalledTimes(1);
    expect(report.eliminarReportes).toHaveBeenCalledWith([guardado]);
    expect(cache.setTerritorio).not.toHaveBeenCalled();
    expect(drafts.eliminarTerritorios).not.toHaveBeenCalled();
    expect(rendering.restaurarVistaConMarcas).not.toHaveBeenCalled();
    expect(state.manzanasById().size).toBeGreaterThan(0);
    expect(state.territoriosSeleccionados()).toEqual([1]);
    expect(show).toHaveBeenCalledWith(TOAST_MESSAGES.sendRollbackError);
    expect(state.enviando()).toBe(false);
  });

  it('reports incomplete territories with the *incompleto* wording on success', async () => {
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [{ numero: 2, finalizado: false, totalManzanas: 1, manzanasMarcadas: 0 }],
      requiereScreenshot: true,
    });
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

  it('restores the full view with marks (no active selection) after a successful save', async () => {
    state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]));
    const marcadas = state.manzanasMarcadaList();

    await service.guardarEnBaseDeDatos();

    const rendering = TestBed.inject(MapRenderingFacade) as unknown as {
      restaurarVistaConMarcas: ReturnType<typeof vi.fn>;
      restaurarVisibilidadPoligonos: ReturnType<typeof vi.fn>;
    };
    expect(rendering.restaurarVistaConMarcas).toHaveBeenCalledWith(expect.arrayContaining(marcadas));
    expect(rendering.restaurarVisibilidadPoligonos).not.toHaveBeenCalled();
    expect(state.territoriosSeleccionados()).toEqual([]);
    expect(state.territorioSeleccionado()).toBeNull();
    expect(state.manzanasById().size).toBeGreaterThan(0);
  });

  it('restores the full view with marks after a successful send', async () => {
    state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]));
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [{ numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 }],
      requiereScreenshot: true,
    });
    report.sendWhatsApp.mockResolvedValue(true);
    report.buildWhatsAppRequest.mockReturnValue({
      encargadoNombre: 'A', encargadoApellido: 'B', fechaRegistro: '01-08-2026',
      predicacion: 'tarde', territorios: [], screenshotBase64: null, destinationNumber: '56912345678',
    });

    await service.guardarYEnviar();

    const rendering = TestBed.inject(MapRenderingFacade) as unknown as {
      restaurarVistaConMarcas: ReturnType<typeof vi.fn>;
      restaurarVisibilidadPoligonos: ReturnType<typeof vi.fn>;
    };
    expect(rendering.restaurarVistaConMarcas).toHaveBeenCalled();
    expect(rendering.restaurarVisibilidadPoligonos).not.toHaveBeenCalled();
    expect(state.territoriosSeleccionados()).toEqual([]);
    expect(state.manzanasById().size).toBeGreaterThan(0);
  });

  it('restores the full view with marks in the whatsapp-sent catch branch', async () => {
    state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]));
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [{ numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 }],
      requiereScreenshot: true,
    });
    report.sendWhatsApp.mockResolvedValue(true);
    report.buildWhatsAppRequest.mockReturnValue({
      encargadoNombre: 'A', encargadoApellido: 'B', fechaRegistro: '01-08-2026',
      predicacion: 'tarde', territorios: [], screenshotBase64: null, destinationNumber: '56912345678',
    });
    const rendering = TestBed.inject(MapRenderingFacade) as unknown as {
      restaurarVistaConMarcas: { mockImplementationOnce: (fn: () => void) => void };
    };
    rendering.restaurarVistaConMarcas.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    await service.guardarYEnviar();

    expect(state.territoriosSeleccionados()).toEqual([]);
    expect(state.manzanasById().size).toBeGreaterThan(0);
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
