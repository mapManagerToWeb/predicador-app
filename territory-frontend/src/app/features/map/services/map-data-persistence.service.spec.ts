import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { MapDataPersistenceService } from './map-data-persistence.service';
import { MapStateService } from './map-state.service';
import { MapReportService } from './map-report.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { TerritorioService } from '../../../core/services/territorio';
import { Toast } from '../../../core/services/toast';
import { ReportCacheService } from '../../../core/services/report-cache';
import { DraftMarksService } from './map-draft';
import { MapCaptureService } from './map-capture.service';
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
  let capture: { prepararCapturaSoloIncompletos: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    report = {
      getProfile: vi
        .fn()
        .mockReturnValue({ name: 'A', lastName: 'B', avatar: 0, telefono: '56912345678' }),
      buildRegistros: vi.fn().mockReturnValue([]),
      buildTerritoriosParaEnvio: vi
        .fn()
        .mockReturnValue({ territorios: [], requiereScreenshot: false }),
      captureScreenshot: vi.fn().mockResolvedValue('screenshot-base64'),
      buildWhatsAppRequest: vi.fn().mockReturnValue({}),
      saveToDatabase: vi.fn().mockResolvedValue([]),
      sendWhatsApp: vi.fn().mockResolvedValue(true),
      eliminarReportes: vi.fn().mockResolvedValue(undefined),
    };
    capture = { prepararCapturaSoloIncompletos: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        MapDataPersistenceService,
        MapStateService,
        { provide: MapReportService, useValue: report },
        {
          provide: MapRenderingFacade,
          useValue: {
            getAllTerritoriesLayer: vi.fn().mockReturnValue([]),
            restaurarVisibilidadPoligonos: vi.fn(),
            getManzanaCountByTerritorio: vi.fn().mockReturnValue(0),
          },
        },
        {
          provide: MapSelectionService,
          useValue: {
            reaplicarMarcasSeleccionadas: vi.fn(),
            restaurarMarcadoDesdeDB: vi.fn().mockResolvedValue(undefined),
          },
        },
        { provide: TerritorioService, useValue: { crearReportes: vi.fn().mockResolvedValue([]) } },
        { provide: MapCaptureService, useValue: capture },
        { provide: Toast, useValue: { show: vi.fn() } },
        {
          provide: ReportCacheService,
          useValue: {
            setTerritorio: vi.fn(),
            getCache: vi.fn(() => new Map()),
            clear: vi.fn(),
            setTerritorios: vi.fn(),
            removeTerritorios: vi.fn(),
            hasData: vi.fn(() => false),
          },
        },
        {
          provide: DraftMarksService,
          useValue: {
            eliminarTerritorios: vi.fn(),
            clear: vi.fn(),
            cargar: vi.fn(() => null),
            guardar: vi.fn(),
          },
        },
      ],
    });
    service = TestBed.inject(MapDataPersistenceService);
    state = TestBed.inject(MapStateService);
    state.manzanasById.set(
      new Map([["{ id: 'A', nombreBloque: 'A', color: '#fff', territorioNumero: 1 }"]]),
    );
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
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [],
      requiereScreenshot: false,
    });
    const toast = TestBed.inject(Toast);
    const show = toast.show as ReturnType<typeof vi.fn>;

    await service.guardarYEnviar();

    expect(report.captureScreenshot).not.toHaveBeenCalled();
    expect(report.sendWhatsApp).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(TOAST_MESSAGES.noSendableTerritories);
    expect(state.enviando()).toBe(false);
  });

  it('envía un único territorio completado con la imagen oficial (sin captura)', async () => {
    state.manzanasById.set(
      new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]),
    );
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
    state.manzanasById.set(
      new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]),
    );
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [{ numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 }],
      requiereScreenshot: true,
    });
    report.buildWhatsAppRequest.mockReturnValue({
      encargadoNombre: 'A',
      encargadoApellido: 'B',
      fechaRegistro: '01-08-2026',
      predicacion: 'tarde',
      territorios: [],
      screenshotBase64: null,
      destinationNumber: '56912345678',
    });
    report.saveToDatabase.mockRejectedValue(new Error('boom'));
    const toast = TestBed.inject(Toast);
    const show = toast.show as ReturnType<typeof vi.fn>;

    await service.guardarYEnviar();

    expect(report.sendWhatsApp).not.toHaveBeenCalled();
    expect(report.eliminarReportes).not.toHaveBeenCalled();
    expect(state.manzanasById().size).toBeGreaterThan(0);
    expect(state.territoriosSeleccionados()).toEqual([1]);
    expect(show).toHaveBeenCalledWith(TOAST_MESSAGES.saveError);
    expect(state.enviando()).toBe(false);
  });

  it('503 de reporting-service muestra el mensaje específico con marcas conservadas (guardarYEnviar)', async () => {
    state.manzanasById.set(
      new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]),
    );
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [{ numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 }],
      requiereScreenshot: false,
    });
    report.saveToDatabase.mockRejectedValue(
      new HttpErrorResponse({ status: 503, error: { service: 'reporting-service' } }),
    );
    const toast = TestBed.inject(Toast);
    const show = toast.show as ReturnType<typeof vi.fn>;

    await service.guardarYEnviar();

    expect(show).toHaveBeenCalledWith(TOAST_MESSAGES.reportingUnavailable);
    expect(show).not.toHaveBeenCalledWith(TOAST_MESSAGES.saveError);
    // Datos a salvo: sin rollback y marcas intactas.
    expect(report.eliminarReportes).not.toHaveBeenCalled();
    expect(state.manzanasById().size).toBeGreaterThan(0);
  });

  it('503 de reporting-service muestra el mensaje específico también en guardarEnBaseDeDatos', async () => {
    report.saveToDatabase.mockRejectedValue(
      new HttpErrorResponse({ status: 503, error: { service: 'reporting-service' } }),
    );
    const toast = TestBed.inject(Toast);
    const show = toast.show as ReturnType<typeof vi.fn>;

    await service.guardarEnBaseDeDatos();

    expect(show).toHaveBeenCalledWith(TOAST_MESSAGES.reportingUnavailable);
    expect(show).not.toHaveBeenCalledWith(TOAST_MESSAGES.saveError);
  });

  it('un 500 mantiene el mensaje genérico de error de guardado', async () => {
    state.manzanasById.set(
      new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]),
    );
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [{ numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 }],
      requiereScreenshot: false,
    });
    report.saveToDatabase.mockRejectedValue(
      new HttpErrorResponse({ status: 500, error: { detail: 'internal' } }),
    );
    const toast = TestBed.inject(Toast);
    const show = toast.show as ReturnType<typeof vi.fn>;

    await service.guardarYEnviar();

    expect(show).toHaveBeenCalledWith(TOAST_MESSAGES.saveError);
    expect(show).not.toHaveBeenCalledWith(TOAST_MESSAGES.reportingUnavailable);
  });

  it('ACID: rolls back the saved reports when the WhatsApp send fails (compensation)', async () => {
    state.manzanasById.set(
      new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]),
    );
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [{ numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 }],
      requiereScreenshot: true,
    });
    report.buildWhatsAppRequest.mockReturnValue({
      encargadoNombre: 'A',
      encargadoApellido: 'B',
      fechaRegistro: '01-08-2026',
      predicacion: 'tarde',
      territorios: [],
      screenshotBase64: null,
      destinationNumber: '56912345678',
    });
    const guardado = { id: 10, ...reporteShape(1) };
    report.saveToDatabase.mockResolvedValue([guardado]);
    report.sendWhatsApp.mockResolvedValue(false);
    const toast = TestBed.inject(Toast);
    const show = toast.show as ReturnType<typeof vi.fn>;
    const cache = TestBed.inject(ReportCacheService) as unknown as {
      setTerritorio: ReturnType<typeof vi.fn>;
    };
    const drafts = TestBed.inject(DraftMarksService) as unknown as {
      eliminarTerritorios: ReturnType<typeof vi.fn>;
    };

    await service.guardarYEnviar();

    expect(report.saveToDatabase).toHaveBeenCalledTimes(1);
    expect(report.eliminarReportes).toHaveBeenCalledWith([guardado]);
    expect(cache.setTerritorio).not.toHaveBeenCalled();
    expect(drafts.eliminarTerritorios).not.toHaveBeenCalled();
    expect(state.manzanasById().size).toBeGreaterThan(0);
    expect(state.territoriosSeleccionados()).toEqual([1]);
    expect(show).toHaveBeenCalledWith(TOAST_MESSAGES.sendRollbackError);
    expect(state.enviando()).toBe(false);
  });

  it('shows the WhatsApp confirmation toast when an incomplete territory is sent and saved', async () => {
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
    expect(show).toHaveBeenCalledWith(
      TOAST_MESSAGES.sendSuccessTitle,
      4000,
      'sent',
      TOAST_MESSAGES.sendSuccessSubtitle,
    );
  });

  it('sends successfully when the session includes a parcial-* zone mark (screenshot + save + send, no rollback)', async () => {
    state.manzanasById.set(
      new Map([
        ['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }],
        [
          'parcial-1-0',
          {
            id: 'parcial-1-0',
            nombreBloque: 'Zona parcial',
            color: '#22c55e',
            territorioNumero: 1,
          },
        ],
      ]),
    );
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [{ numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 2 }],
      requiereScreenshot: true,
    });
    report.buildWhatsAppRequest.mockReturnValue({
      encargadoNombre: 'A',
      encargadoApellido: 'B',
      fechaRegistro: '01-08-2026',
      predicacion: 'tarde',
      territorios: [],
      screenshotBase64: null,
      destinationNumber: '56912345678',
    });
    const guardado = [{ id: 10, ...reporteShape(1) }];
    report.saveToDatabase.mockResolvedValue(guardado);
    report.sendWhatsApp.mockResolvedValue(true);
    const toast = TestBed.inject(Toast);
    const show = toast.show as ReturnType<typeof vi.fn>;

    await service.guardarYEnviar();

    // buildRegistros recibió las marcas incluyendo la zona parcial.
    const marksEnviados = report.buildRegistros.mock.calls[0]?.[0] as { id: string }[];
    expect(marksEnviados.map((m) => m.id)).toEqual(expect.arrayContaining(['m1', 'parcial-1-0']));
    expect(report.captureScreenshot).toHaveBeenCalledTimes(1);
    expect(report.saveToDatabase).toHaveBeenCalledTimes(1);
    expect(report.sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(report.eliminarReportes).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(
      TOAST_MESSAGES.sendSuccessTitle,
      4000,
      'sent',
      TOAST_MESSAGES.sendSuccessSubtitle,
    );
    expect(state.enviando()).toBe(false);
  });

  it('writes the report cache and clears the draft for saved territories', async () => {
    const saved = [{ id: 10, ...reporteShape(1) }];
    report.saveToDatabase.mockResolvedValue(saved);

    await service.guardarEnBaseDeDatos();

    const cache = TestBed.inject(ReportCacheService) as unknown as {
      setTerritorio: ReturnType<typeof vi.fn>;
    };
    const drafts = TestBed.inject(DraftMarksService) as unknown as {
      eliminarTerritorios: ReturnType<typeof vi.fn>;
    };
    expect(cache.setTerritorio).toHaveBeenCalledWith(1, saved[0]);
    expect(drafts.eliminarTerritorios).toHaveBeenCalledWith([1]);
    expect(report.saveToDatabase).toHaveBeenCalledTimes(1);
  });

  it('does not touch cache or draft when the POST fails', async () => {
    report.saveToDatabase.mockRejectedValue(new Error('boom'));

    await service.guardarEnBaseDeDatos();

    const cache = TestBed.inject(ReportCacheService) as unknown as {
      setTerritorio: ReturnType<typeof vi.fn>;
    };
    const drafts = TestBed.inject(DraftMarksService) as unknown as {
      eliminarTerritorios: ReturnType<typeof vi.fn>;
    };
    expect(cache.setTerritorio).not.toHaveBeenCalled();
    expect(drafts.eliminarTerritorios).not.toHaveBeenCalled();
    expect(state.enviando()).toBe(false);
  });

  it('clears the selection state after a successful save', async () => {
    state.manzanasById.set(
      new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]),
    );

    await service.guardarEnBaseDeDatos();

    expect(state.territoriosSeleccionados()).toEqual([]);
    expect(state.territorioSeleccionado()).toBeNull();
    expect(state.modoMarcado()).toBe('none');
    expect(state.manzanasById().size).toBe(0);
  });

  it('clears the selection state after a successful send', async () => {
    state.manzanasById.set(
      new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]),
    );
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [{ numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 }],
      requiereScreenshot: true,
    });
    report.sendWhatsApp.mockResolvedValue(true);
    report.buildWhatsAppRequest.mockReturnValue({
      encargadoNombre: 'A',
      encargadoApellido: 'B',
      fechaRegistro: '01-08-2026',
      predicacion: 'tarde',
      territorios: [],
      screenshotBase64: null,
      destinationNumber: '56912345678',
    });

    await service.guardarYEnviar();

    expect(state.territoriosSeleccionados()).toEqual([]);
    expect(state.modoMarcado()).toBe('none');
    expect(state.manzanasById().size).toBe(0);
  });

  it('clears the selection state when post-send cleanup fails (catch branch)', async () => {
    state.manzanasById.set(
      new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]),
    );
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [{ numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 }],
      requiereScreenshot: true,
    });
    report.sendWhatsApp.mockResolvedValue(true);
    report.buildWhatsAppRequest.mockReturnValue({
      encargadoNombre: 'A',
      encargadoApellido: 'B',
      fechaRegistro: '01-08-2026',
      predicacion: 'tarde',
      territorios: [],
      screenshotBase64: null,
      destinationNumber: '56912345678',
    });
    const drafts = TestBed.inject(DraftMarksService) as unknown as {
      eliminarTerritorios: { mockImplementationOnce: (fn: () => void) => void };
    };
    drafts.eliminarTerritorios.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    await service.guardarYEnviar();

    expect(state.territoriosSeleccionados()).toEqual([]);
    expect(state.modoMarcado()).toBe('none');
    expect(state.manzanasById().size).toBe(0);
  });

  it('buildRegistros receives datosParciales BEFORE they are cleared', async () => {
    // Set up partial marks in the state
    state.manzanasById.set(
      new Map([
        [
          'parcial-1-0',
          { id: 'parcial-1-0', nombreBloque: 'Parcial', color: '#22c55e', territorioNumero: 1 },
        ],
      ]),
    );
    const parciales = new Map<number, { puntos: unknown[]; geometria: string }>([
      [
        1,
        {
          puntos: [{ latlng: { lat: 0, lng: 0 }, edgeIdx: 0, t: 0 }],
          geometria: '{"type":"Polygon"}',
        },
      ],
    ]);
    state.datosParcialesGuardados = parciales;

    // Capture what buildRegistros receives — datosParciales must NOT be empty.
    // Nota: snapshot con copia en el momento de la llamada; clearDatosParciales()
    // vacía el Map in-place, así que mirar la referencia original tras el await
    // mostraría un Map ya limpiado (aliasing por referencia, no un bug real).
    let receivedParciales: typeof parciales | null = null;
    report.buildRegistros.mockImplementation((_m, _l, _s, dp) => {
      receivedParciales = new Map(dp as typeof parciales);
      return [{ territorioNumero: 1, encargadoNombre: 'A', encargadoApellido: 'B' }];
    });

    await service.guardarEnBaseDeDatos();

    expect(receivedParciales).not.toBeNull();
    expect(receivedParciales!.size).toBe(1);
    expect(receivedParciales!.get(1)).toBeDefined();
  });

  it('clears datosParciales AFTER the HTTP request completes, not before', async () => {
    state.manzanasById.set(
      new Map([
        [
          'parcial-1-0',
          { id: 'parcial-1-0', nombreBloque: 'Parcial', color: '#22c55e', territorioNumero: 1 },
        ],
      ]),
    );
    const parciales = new Map<number, { puntos: unknown[]; geometria: string }>([
      [
        1,
        {
          puntos: [{ latlng: { lat: 0, lng: 0 }, edgeIdx: 0, t: 0 }],
          geometria: '{"type":"Polygon"}',
        },
      ],
    ]);
    state.datosParcialesGuardados = parciales;

    let datosParcialesClearedDuringAwait = false;
    report.saveToDatabase.mockImplementation(async () => {
      // At this point, the HTTP request is in flight.
      // datosParciales should NOT have been cleared yet.
      if (state.datosParcialesGuardados.size === 0) {
        datosParcialesClearedDuringAwait = true;
      }
      return [{ id: 1 }];
    });

    await service.guardarEnBaseDeDatos();

    expect(datosParcialesClearedDuringAwait).toBe(false);
    // After the request completes, datosParciales should be cleared.
    expect(state.datosParcialesGuardados.size).toBe(0);
  });

  it('warns about missing profile and skips the save (guardarEnBaseDeDatos)', async () => {
    report.getProfile.mockReturnValue(null);

    await service.guardarEnBaseDeDatos();

    const toast = TestBed.inject(Toast);
    expect(toast.show as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(TOAST_MESSAGES.noProfile);
    expect(report.saveToDatabase).not.toHaveBeenCalled();
    expect(state.enviando()).toBe(false);
  });

  it('warns about missing profile and skips the send (guardarYEnviar)', async () => {
    report.getProfile.mockReturnValue(null);

    await service.guardarYEnviar();

    const toast = TestBed.inject(Toast);
    expect(toast.show as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(TOAST_MESSAGES.noProfile);
    expect(report.captureScreenshot).not.toHaveBeenCalled();
    expect(report.sendWhatsApp).not.toHaveBeenCalled();
    expect(state.enviando()).toBe(false);
  });

  it('warns when there are no marked blocks in guardarEnBaseDeDatos', async () => {
    state.manzanasById.set(new Map());

    await service.guardarEnBaseDeDatos();

    const toast = TestBed.inject(Toast);
    expect(toast.show as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(TOAST_MESSAGES.noMarked);
    expect(report.saveToDatabase).not.toHaveBeenCalled();
  });

  it('warns when there are no marked blocks in guardarYEnviar', async () => {
    state.manzanasById.set(new Map());

    await service.guardarYEnviar();

    const toast = TestBed.inject(Toast);
    expect(toast.show as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      TOAST_MESSAGES.noTerritories,
    );
    expect(report.sendWhatsApp).not.toHaveBeenCalled();
  });

  it('does nothing when a save is already in flight (enviando guard)', async () => {
    state.enviando.set(true);

    await service.guardarEnBaseDeDatos();

    const toast = TestBed.inject(Toast);
    expect(report.saveToDatabase).not.toHaveBeenCalled();
    expect(toast.show as ReturnType<typeof vi.fn>).not.toHaveBeenCalledWith(TOAST_MESSAGES.saving);
    expect(state.enviando()).toBe(true);
    state.enviando.set(false);
  });

  it('does nothing when a send is already in flight (enviando guard)', async () => {
    state.enviando.set(true);

    await service.guardarYEnviar();

    expect(report.buildTerritoriosParaEnvio).not.toHaveBeenCalled();
    expect(report.sendWhatsApp).not.toHaveBeenCalled();
    state.enviando.set(false);
  });

  it('keeps marks and shows no error toast on SSR AbortError (guardarEnBaseDeDatos)', async () => {
    report.saveToDatabase.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await service.guardarEnBaseDeDatos();

    const toast = TestBed.inject(Toast);
    expect(toast.show as ReturnType<typeof vi.fn>).not.toHaveBeenCalledWith(TOAST_MESSAGES.saveError);
    expect(state.manzanasById().size).toBeGreaterThan(0);
    expect(state.territoriosSeleccionados()).toEqual([1]);
    expect(state.enviando()).toBe(false);
  });

  it('keeps marks and shows no error toast on SSR AbortError (guardarYEnviar)', async () => {
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [{ numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 }],
      requiereScreenshot: false,
    });
    report.saveToDatabase.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await service.guardarYEnviar();

    const toast = TestBed.inject(Toast);
    const show = toast.show as ReturnType<typeof vi.fn>;
    expect(show).not.toHaveBeenCalledWith(TOAST_MESSAGES.saveError);
    expect(show).not.toHaveBeenCalledWith(TOAST_MESSAGES.sendRollbackError);
    expect(report.eliminarReportes).not.toHaveBeenCalled();
    expect(state.manzanasById().size).toBeGreaterThan(0);
    expect(state.enviando()).toBe(false);
    expect(state.screenshotPreview()).toBeNull();
  });

  it('invokes the screenshot prepare callback with marks, selection, layers and manzana counter', async () => {
    state.manzanasById.set(
      new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]),
    );
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [{ numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 }],
      requiereScreenshot: true,
    });
    report.captureScreenshot.mockImplementation(
      async (prepare: () => unknown, restore: () => undefined) => {
        prepare();
        restore();
        return 'screenshot-base64';
      },
    );
    report.buildWhatsAppRequest.mockReturnValue({
      encargadoNombre: 'A',
      encargadoApellido: 'B',
      fechaRegistro: '01-08-2026',
      predicacion: 'tarde',
      territorios: [],
      screenshotBase64: 'screenshot-base64',
      destinationNumber: '56912345678',
    });
    report.sendWhatsApp.mockResolvedValue(true);

    await service.guardarYEnviar();

    expect(capture.prepararCapturaSoloIncompletos).toHaveBeenCalledTimes(1);
    const [marksArg, selArg, layersArg, counterFn] = capture.prepararCapturaSoloIncompletos.mock
      .calls[0] as [unknown[], number[], unknown[], (n: number) => number];
    expect(marksArg).toHaveLength(1);
    expect(selArg).toEqual([1]);
    expect(layersArg).toEqual([]);
    // El 4° argumento delega el conteo de manzanas en la fachada de render.
    expect(counterFn(7)).toBe(0);
    const facade = TestBed.inject(MapRenderingFacade) as unknown as {
      getManzanaCountByTerritorio: ReturnType<typeof vi.fn>;
    };
    expect(facade.getManzanaCountByTerritorio).toHaveBeenCalledWith(7);
  });

  it('rolls back the saved reports when sendWhatsApp throws after a successful save', async () => {
    state.manzanasById.set(
      new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]),
    );
    report.buildTerritoriosParaEnvio.mockReturnValue({
      territorios: [{ numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 }],
      requiereScreenshot: false,
    });
    report.buildWhatsAppRequest.mockReturnValue({
      encargadoNombre: 'A',
      encargadoApellido: 'B',
      fechaRegistro: '01-08-2026',
      predicacion: 'tarde',
      territorios: [],
      screenshotBase64: null,
      destinationNumber: '56912345678',
    });
    const guardado = { id: 10, ...reporteShape(1) };
    report.saveToDatabase.mockResolvedValue([guardado]);
    report.sendWhatsApp.mockRejectedValue(new Error('network down'));
    const toast = TestBed.inject(Toast);
    const show = toast.show as ReturnType<typeof vi.fn>;

    await service.guardarYEnviar();

    expect(report.eliminarReportes).toHaveBeenCalledWith([guardado]);
    expect(show).toHaveBeenCalledWith(TOAST_MESSAGES.sendRollbackError);
    expect(state.manzanasById().size).toBeGreaterThan(0);
    expect(state.enviando()).toBe(false);
  });

  it('skips the territory cache when a saved report has no territorioNumero', async () => {
    const saved = [{ id: 11, territorioNumero: null }];
    report.saveToDatabase.mockResolvedValue(saved);
    const cache = TestBed.inject(ReportCacheService) as unknown as {
      setTerritorio: ReturnType<typeof vi.fn>;
    };
    const drafts = TestBed.inject(DraftMarksService) as unknown as {
      eliminarTerritorios: ReturnType<typeof vi.fn>;
    };

    await service.guardarEnBaseDeDatos();

    expect(cache.setTerritorio).not.toHaveBeenCalled();
    expect(drafts.eliminarTerritorios).toHaveBeenCalledWith([1]);
    expect(state.enviando()).toBe(false);
  });

  function reporteShape(territorio: number) {
    return {
      manzanaId: null,
      fecha: '2026-08-12T10:00:00Z',
      encargadoId: 1,
      encargadoNombre: 'A',
      encargadoApellido: 'B',
      sessionTime: '06:00',
      estado: 'completed',
      territorioNumero: territorio,
      totalManzanas: 3,
      manzanasMarcadas: 3,
      tipoSesion: 'completa',
      geometriaParcial: null,
      puntosParciales: null,
      manzanasIds: 'A,B,C',
    };
  }
});
