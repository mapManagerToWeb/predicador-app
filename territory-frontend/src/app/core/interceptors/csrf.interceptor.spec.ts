import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { csrfInterceptor } from './csrf.interceptor';

const BOOTSTRAP_URL = '/api/v1/auth/csrf';
const CSRF_PROBLEM = {
  type: 'https://api.predicador.com/errors/csrf-token-invalid',
  status: 403,
};

describe('csrfInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  const setCookie = (value: string) => {
    document.cookie = `XSRF-TOKEN=${value}; path=/`;
  };
  const clearCookie = () => {
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
  };

  beforeEach(() => {
    clearCookie();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([csrfInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    clearCookie();
  });

  it('sends credentials on own API requests', () => {
    http.get('/api/v1/territories').subscribe();

    const request = httpMock.expectOne('/api/v1/territories');

    expect(request.request.withCredentials).toBe(true);
    request.flush({});
  });

  it('adds the CSRF header to state-changing own API requests', () => {
    setCookie('csrf-token');
    http.post('/api/v1/reports', {}).subscribe();

    const request = httpMock.expectOne('/api/v1/reports');

    expect(request.request.headers.get('X-XSRF-TOKEN')).toBe('csrf-token');
    request.flush({});
  });

  it('does not send credentials to third-party origins', () => {
    http.get('https://tile.openstreetmap.org/0/0/0.png').subscribe();

    const request = httpMock.expectOne('https://tile.openstreetmap.org/0/0/0.png');

    expect(request.request.withCredentials).toBe(false);
    request.flush({});
  });

  it('bootstraps the token before the first state-changing request', () => {
    http.post('/api/v1/encargados/buscar-crear', {}).subscribe();

    const bootstrap = httpMock.expectOne(BOOTSTRAP_URL);
    expect(bootstrap.request.method).toBe('GET');
    expect(bootstrap.request.withCredentials).toBe(true);
    // El gateway responde 204 con Set-Cookie; en el test lo simula el navegador.
    setCookie('seeded-token');
    bootstrap.flush(null, { status: 204, statusText: 'No Content' });

    const request = httpMock.expectOne('/api/v1/encargados/buscar-crear');
    expect(request.request.headers.get('X-XSRF-TOKEN')).toBe('seeded-token');
    request.flush({});
  });

  it('bootstraps once for concurrent state-changing requests', () => {
    http.post('/api/v1/reports', { a: 1 }).subscribe();
    http.post('/api/v1/reports', { b: 2 }).subscribe();

    const bootstrap = httpMock.expectOne(BOOTSTRAP_URL);
    setCookie('shared-token');
    bootstrap.flush(null, { status: 204, statusText: 'No Content' });

    const requests = httpMock.match('/api/v1/reports');
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.request.headers.get('X-XSRF-TOKEN')).toBe('shared-token');
      request.flush({});
    }
  });

  it('refreshes the token and replays the request when the gateway rejects CSRF', () => {
    // Caso real: el login rotó el token después de que el SPA leyera la cookie.
    setCookie('stale-token');
    let saved = false;
    http.post('/api/v1/reports', {}).subscribe({ next: () => (saved = true) });

    const rejected = httpMock.expectOne('/api/v1/reports');
    expect(rejected.request.headers.get('X-XSRF-TOKEN')).toBe('stale-token');
    rejected.flush(CSRF_PROBLEM, { status: 403, statusText: 'Forbidden' });

    const bootstrap = httpMock.expectOne(BOOTSTRAP_URL);
    setCookie('rotated-token');
    bootstrap.flush(null, { status: 204, statusText: 'No Content' });

    const replayed = httpMock.expectOne('/api/v1/reports');
    expect(replayed.request.headers.get('X-XSRF-TOKEN')).toBe('rotated-token');
    replayed.flush({});

    expect(saved).toBe(true);
  });

  it('does not retry a 403 that is not a CSRF rejection', () => {
    setCookie('valid-token');
    let status: number | undefined;
    http.post('/api/v1/reports', {}).subscribe({ error: error => (status = error.status) });

    const request = httpMock.expectOne('/api/v1/reports');
    request.flush(
      { type: 'about:blank', detail: 'No tiene permisos' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(status).toBe(403);
  });

  it('fails with an explicit error when the cookie stays unreadable', () => {
    // Regresión: la cookie emitida como HttpOnly no se puede leer, y enviar el
    // header vacío devolvía un 403 que parecía sesión expirada.
    let message: string | undefined;
    http.post('/api/v1/reports', {}).subscribe({ error: error => (message = error.message) });

    const bootstrap = httpMock.expectOne(BOOTSTRAP_URL);
    bootstrap.flush(null, { status: 204, statusText: 'No Content' });

    expect(message).toContain('XSRF-TOKEN');
    httpMock.expectNone('/api/v1/reports');
  });
});
