import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { WhatsAppService } from './whatsapp';
import { WhatsAppSendRequest } from '../models/models';

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WhatsAppService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(WhatsAppService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should send report', async () => {
    const request: WhatsAppSendRequest = {
      encargadoNombre: 'Daniel',
      encargadoApellido: 'Uribe',
      fechaRegistro: '21-07-2026',
      territorios: [{ numero: 1, finalizado: true, totalManzanas: 12, manzanasMarcadas: 12 }],
      screenshotBase64: null,
      destinationNumber: null
    };

    const promise = service.sendReport(request);

    const req = httpMock.expectOne(r => r.url.includes('/reports/send'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ success: true, messageId: 'msg_123', error: null });

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg_123');
  });

  it('should handle error response', async () => {
    const request: WhatsAppSendRequest = {
      encargadoNombre: 'Daniel',
      encargadoApellido: 'Uribe',
      fechaRegistro: '21-07-2026',
      territorios: [{ numero: 1, finalizado: true, totalManzanas: 12, manzanasMarcadas: 12 }],
      screenshotBase64: null,
      destinationNumber: null
    };

    const promise = service.sendReport(request);

    const req = httpMock.expectOne(r => r.url.includes('/reports/send'));
    req.flush({ success: false, messageId: null, error: 'Token invalido' });

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error).toBe('Token invalido');
  });
});
