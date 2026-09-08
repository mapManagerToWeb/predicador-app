import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('validateSession', () => {
    it('should return true when backend validates session', async () => {
      const validatePromise = service.validateSession();

      const req = httpMock.expectOne(`${environment.apiUrl}/encargados/session`);
      expect(req.request.method).toBe('GET');
      req.flush({ valid: true, role: 'encargado', subject: '123' });

      const result = await validatePromise;
      expect(result).toBe(true);
    });

    it('should return false when backend returns invalid session', async () => {
      const validatePromise = service.validateSession();

      const req = httpMock.expectOne(`${environment.apiUrl}/encargados/session`);
      req.flush({ valid: false });

      const result = await validatePromise;
      expect(result).toBe(false);
    });

    it('should return false on 401 (genuinely invalid session)', async () => {
      const validatePromise = service.validateSession();

      const req = httpMock.expectOne(`${environment.apiUrl}/encargados/session`);
      req.flush({}, { status: 401, statusText: 'Unauthorized' });

      const result = await validatePromise;
      expect(result).toBe(false);
    });

    it('should keep the session on 502/503 (service unavailable, not invalid)', async () => {
      const validatePromise = service.validateSession();

      const req = httpMock.expectOne(`${environment.apiUrl}/encargados/session`);
      req.flush({}, { status: 503, statusText: 'Service Unavailable' });

      const result = await validatePromise;
      expect(result).toBe(true);
    });

    it('should keep the session on network error', async () => {
      const validatePromise = service.validateSession();

      const req = httpMock.expectOne(`${environment.apiUrl}/encargados/session`);
      req.error(new ProgressEvent('network error'));

      const result = await validatePromise;
      expect(result).toBe(true);
    });

    it('should keep the session on timeout', async () => {
      const validatePromise = service.validateSession();

      httpMock.expectOne(`${environment.apiUrl}/encargados/session`);
      // Simular timeout no enviando respuesta
      await new Promise(resolve => setTimeout(resolve, 4000));

      const result = await validatePromise;
      expect(result).toBe(true);
    });

    it('should not cache a transient failure so the next validation retries', async () => {
      const first = service.validateSession();
      const req1 = httpMock.expectOne(`${environment.apiUrl}/encargados/session`);
      req1.flush({}, { status: 502, statusText: 'Bad Gateway' });
      expect(await first).toBe(true);

      // Sin caché del fallo: la siguiente validación vuelve a consultar el backend
      const second = service.validateSession();
      const req2 = httpMock.expectOne(`${environment.apiUrl}/encargados/session`);
      req2.flush({ valid: true });
      expect(await second).toBe(true);
    });

    it('should cache successful validation', async () => {
      const firstCall = service.validateSession();
      const req1 = httpMock.expectOne(`${environment.apiUrl}/encargados/session`);
      req1.flush({ valid: true });
      await firstCall;

      // Segunda llamada debería usar caché
      const secondCall = service.validateSession();
      const result = await secondCall;

      expect(result).toBe(true);
      httpMock.expectNone(`${environment.apiUrl}/encargados/session`);
    });

    it('should invalidate cache when requested', async () => {
      const firstCall = service.validateSession();
      const req1 = httpMock.expectOne(`${environment.apiUrl}/encargados/session`);
      req1.flush({ valid: true });
      await firstCall;

      service.invalidateCache();

      const secondCall = service.validateSession();
      const req2 = httpMock.expectOne(`${environment.apiUrl}/encargados/session`);
      req2.flush({ valid: true });
      await secondCall;
    });
  });
});
