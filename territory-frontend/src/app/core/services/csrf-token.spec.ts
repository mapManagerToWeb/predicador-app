import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CsrfTokenService } from './csrf-token';

describe('CsrfTokenService', () => {
  let service: CsrfTokenService;
  let httpMock: HttpTestingController;

  const clearCookie = () => {
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
  };

  beforeEach(() => {
    clearCookie();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CsrfTokenService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    clearCookie();
  });

  it('read() devuelve null cuando no hay cookie', () => {
    expect(service.read()).toBeNull();
  });

  it('read() decodifica el valor de la cookie', () => {
    document.cookie = `XSRF-TOKEN=${encodeURIComponent('a b')}; path=/`;

    expect(service.read()).toBe('a b');
  });

  it('refresh() pide el token al gateway y resuelve con la cookie resultante', () => {
    let token: string | null = null;
    service.refresh().subscribe(value => (token = value));

    const request = httpMock.expectOne('/api/v1/auth/csrf');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    document.cookie = 'XSRF-TOKEN=fresh-token; path=/';
    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(token).toBe('fresh-token');
  });

  it('refresh() comparte una sola petición entre llamadas concurrentes', () => {
    const tokens: (string | null)[] = [];
    service.refresh().subscribe(value => tokens.push(value));
    service.refresh().subscribe(value => tokens.push(value));

    const request = httpMock.expectOne('/api/v1/auth/csrf');
    document.cookie = 'XSRF-TOKEN=shared; path=/';
    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(tokens).toEqual(['shared', 'shared']);
  });

  it('refresh() vuelve a pedir el token una vez terminada la petición anterior', () => {
    service.refresh().subscribe();
    httpMock.expectOne('/api/v1/auth/csrf').flush(null, { status: 204, statusText: 'No Content' });

    service.refresh().subscribe();

    httpMock.expectOne('/api/v1/auth/csrf').flush(null, { status: 204, statusText: 'No Content' });
  });

  it('refresh() no propaga el error de red: cae a la cookie existente', () => {
    document.cookie = 'XSRF-TOKEN=previous; path=/';
    let token: string | null = null;
    let errored = false;
    service.refresh().subscribe({
      next: value => (token = value),
      error: () => (errored = true),
    });

    httpMock.expectOne('/api/v1/auth/csrf').error(new ProgressEvent('error'));

    expect(errored).toBe(false);
    expect(token).toBe('previous');
  });
});
