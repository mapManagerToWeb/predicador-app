import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { vi } from 'vitest';
import { WhatsAppService } from './whatsapp';
import { WhatsAppSendRequest } from '../models/models';

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  let httpMock: HttpTestingController;

  const request: WhatsAppSendRequest = {
    encargadoNombre: 'Daniel',
    encargadoApellido: 'Uribe',
    fechaRegistro: '21-07-2026',
    territorios: [{ numero: 1, finalizado: true, totalManzanas: 12, manzanasMarcadas: 12 }],
    screenshotBase64: null,
    destinationNumber: null
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WhatsAppService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(WhatsAppService);
    (service as unknown as { pollIntervalMs: number }).pollIntervalMs = 1000;
    httpMock = TestBed.inject(HttpTestingController);
    vi.useFakeTimers();
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  it('should submit and poll until succeeded', async () => {
    const promise = service.sendReport(request);

    const postReq = httpMock.expectOne(r => r.method === 'POST' && r.url.includes('/reports/send'));
    expect(postReq.request.headers.has('Idempotency-Key')).toBe(true);
    expect(postReq.request.body).toEqual(request);
    postReq.flush({ idempotencyKey: 'key-1', status: 'IN_PROGRESS', messageId: null, error: null });

    await vi.advanceTimersByTimeAsync(1000);
    const getReq = httpMock.expectOne(r => r.method === 'GET' && r.url.includes('/reports/send/'));
    getReq.flush({ idempotencyKey: 'key-1', status: 'SUCCEEDED', messageId: 'msg_123', error: null });

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg_123');
  });

  it('should return result directly when the key is already completed', async () => {
    const promise = service.sendReport(request);

    const postReq = httpMock.expectOne(r => r.method === 'POST' && r.url.includes('/reports/send'));
    postReq.flush({ idempotencyKey: 'key-1', status: 'SUCCEEDED', messageId: 'msg_999', error: null });

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg_999');
    httpMock.expectNone(r => r.method === 'GET');
  });

  it('should report failure from the polling result', async () => {
    const promise = service.sendReport(request);

    const postReq = httpMock.expectOne(r => r.method === 'POST' && r.url.includes('/reports/send'));
    postReq.flush({ idempotencyKey: 'key-1', status: 'IN_PROGRESS', messageId: null, error: null });

    await vi.advanceTimersByTimeAsync(1000);
    const getReq = httpMock.expectOne(r => r.method === 'GET' && r.url.includes('/reports/send/'));
    getReq.flush({ idempotencyKey: 'key-1', status: 'FAILED', messageId: null, error: 'Token invalido' });

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toBe('Token invalido');
    expect(result.estado).toBe('fallo');
  });

  it('el panel reenvía por su propio camino y espera el resultado', async () => {
    const promise = service.reenviarDesdePanel(request);
    const postReq = httpMock.expectOne(r => r.method === 'POST' && r.url.endsWith('/reports/admin/reenviar'));
    expect(postReq.request.headers.has('Idempotency-Key')).toBe(true);
    postReq.flush({ idempotencyKey: 'key-2', status: 'SUCCEEDED', messageId: 'msg_1', error: null });
    await expect(promise).resolves.toEqual({ success: true, messageId: 'msg_1', error: null, estado: 'enviado' });
  });

  describe('con poca señal', () => {
    it('si se corta al pedir el WhatsApp, lo reintenta con la MISMA clave', async () => {
      const promise = service.sendReport(request);
      const primero = httpMock.expectOne(r => r.method === 'POST');
      const clave = primero.request.headers.get('Idempotency-Key');
      primero.error(new ProgressEvent('error'), { status: 0 });
      await vi.advanceTimersByTimeAsync(1000);
      const segundo = httpMock.expectOne(r => r.method === 'POST');
      expect(segundo.request.headers.get('Idempotency-Key')).toBe(clave);
      segundo.flush({ idempotencyKey: clave, status: 'SUCCEEDED', messageId: 'm2', error: null });
      await expect(promise).resolves.toMatchObject({ success: true, estado: 'enviado' });
    });

    it('si nunca se pudo entregar el pedido, queda sin confirmar (no es un fallo)', async () => {
      const promise = service.sendReport(request);
      httpMock.expectOne(r => r.method === 'POST').error(new ProgressEvent('error'), { status: 0 });
      await vi.advanceTimersByTimeAsync(1000);
      httpMock.expectOne(r => r.method === 'POST').flush('caído', { status: 503, statusText: 'x' });
      await vi.advanceTimersByTimeAsync(2000);
      httpMock.expectOne(r => r.method === 'POST').error(new ProgressEvent('error'), { status: 0 });
      await expect(promise).resolves.toMatchObject({ success: false, estado: 'sin-confirmar' });
    });

    it('si el servidor rechaza el pedido (4xx), es un fallo y no se reintenta', async () => {
      const promise = service.sendReport(request);
      httpMock.expectOne(r => r.method === 'POST').flush('no', { status: 400, statusText: 'Bad Request' });
      await expect(promise).resolves.toMatchObject({ success: false, estado: 'fallo' });
      httpMock.expectNone(r => r.method === 'POST');
    });

    it('un corte al consultar el estado no corta la espera', async () => {
      const promise = service.sendReport(request);
      httpMock.expectOne(r => r.method === 'POST').flush({ idempotencyKey: 'k', status: 'IN_PROGRESS', messageId: null, error: null });
      await vi.advanceTimersByTimeAsync(1000);
      httpMock.expectOne(r => r.method === 'GET').error(new ProgressEvent('error'), { status: 0 });
      await vi.advanceTimersByTimeAsync(2000);
      httpMock.expectOne(r => r.method === 'GET').flush({ idempotencyKey: 'k', status: 'SUCCEEDED', messageId: 'm', error: null });
      await expect(promise).resolves.toMatchObject({ success: true, estado: 'enviado' });
    });

    it('si pasa el tiempo sin respuesta, queda sin confirmar', async () => {
      const promise = service.sendReport(request);
      httpMock.expectOne(r => r.method === 'POST').flush({ idempotencyKey: 'k', status: 'IN_PROGRESS', messageId: null, error: null });
      for (let i = 0; i < 30; i++) {
        await vi.advanceTimersByTimeAsync(15000);
        for (const r of httpMock.match(x => x.method === 'GET')) r.flush({ idempotencyKey: 'k', status: 'IN_PROGRESS', messageId: null, error: null });
      }
      await expect(promise).resolves.toMatchObject({ success: false, estado: 'sin-confirmar' });
    });
  });
});
