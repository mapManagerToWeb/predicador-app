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
  });

  it('el panel reenvía por su propio camino y espera el resultado', async () => {
    const promise = service.reenviarDesdePanel(request);
    const postReq = httpMock.expectOne(r => r.method === 'POST' && r.url.endsWith('/reports/admin/reenviar'));
    expect(postReq.request.headers.has('Idempotency-Key')).toBe(true);
    postReq.flush({ idempotencyKey: 'key-2', status: 'SUCCEEDED', messageId: 'msg_1', error: null });
    await expect(promise).resolves.toEqual({ success: true, messageId: 'msg_1', error: null });
  });
});
