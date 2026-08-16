import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { vi } from 'vitest';
import { EncargadoService, EncargadoDto } from './encargado';
import { AuthTokenService } from './auth-token';
import { environment } from '../../../environments/environment';

describe('EncargadoService', () => {
  let service: EncargadoService;
  let httpMock: HttpTestingController;
  let authToken: AuthTokenService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        EncargadoService,
        AuthTokenService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(EncargadoService);
    httpMock = TestBed.inject(HttpTestingController);
    authToken = TestBed.inject(AuthTokenService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  const encargado: EncargadoDto = {
    id: 7,
    nombre: 'Daniel',
    apellido: 'Uribe',
    avatar: 3,
    telefono: '56912345678',
    activo: true,
  };

  describe('loginByPhone', () => {
    it('returns the encargado and sets the session role', async () => {
      const promise = service.loginByPhone('56912345678');

      const req = httpMock.expectOne(`${environment.apiUrl}/encargados/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ telefono: '56912345678' });
      req.flush({ encargado, token: null });

      await expect(promise).resolves.toEqual(encargado);
      expect(authToken.role()).toBe('encargado');
    });

    it('unwraps a bare EncargadoDto response', async () => {
      const promise = service.loginByPhone('56912345678');

      const req = httpMock.expectOne(`${environment.apiUrl}/encargados/login`);
      req.flush(encargado);

      await expect(promise).resolves.toEqual(encargado);
      expect(authToken.role()).toBeNull();
    });

    it('rejects when the backend returns an error', async () => {
      const promise = service.loginByPhone('56912345678');

      const req = httpMock.expectOne(`${environment.apiUrl}/encargados/login`);
      req.error(new ProgressEvent('error'), { status: 404, statusText: 'Not Found' });

      await expect(promise).rejects.toBeTruthy();
      expect(authToken.role()).toBeNull();
    });

    it('retries a transient 503 (cold start) and succeeds', async () => {
      vi.useFakeTimers();
      try {
        const promise = service.loginByPhone('56912345678');

        let req = httpMock.expectOne(`${environment.apiUrl}/encargados/login`);
        req.flush('', { status: 503, statusText: 'Service Unavailable' });

        await vi.advanceTimersByTimeAsync(1500);
        req = httpMock.expectOne(`${environment.apiUrl}/encargados/login`);
        req.flush({ encargado, token: null });

        await expect(promise).resolves.toEqual(encargado);
        expect(authToken.role()).toBe('encargado');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('buscarOCrear', () => {
    it('posts name/lastName/telefono and returns the encargado', async () => {
      const promise = service.buscarOCrear('Daniel', 'Uribe', '56912345678');

      const req = httpMock.expectOne(`${environment.apiUrl}/encargados/buscar-crear`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        nombre: 'Daniel',
        apellido: 'Uribe',
        telefono: '56912345678',
      });
      req.flush({ encargado, token: null });

      await expect(promise).resolves.toEqual(encargado);
      expect(authToken.role()).toBe('encargado');
    });

    it('accepts a null phone number', async () => {
      const promise = service.buscarOCrear('Daniel', 'Uribe', null);

      const req = httpMock.expectOne(`${environment.apiUrl}/encargados/buscar-crear`);
      expect(req.request.body).toEqual({ nombre: 'Daniel', apellido: 'Uribe', telefono: null });
      req.flush(encargado);

      await expect(promise).resolves.toEqual(encargado);
    });
  });
});
