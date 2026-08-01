import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { csrfInterceptor } from './csrf.interceptor';

describe('csrfInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([csrfInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('sends credentials on own API requests', () => {
    http.get('/api/v1/territories').subscribe();

    const request = httpMock.expectOne('/api/v1/territories');

    expect(request.request.withCredentials).toBe(true);
    request.flush({});
  });

  it('adds the CSRF header to state-changing own API requests', () => {
    document.cookie = 'XSRF-TOKEN=csrf-token';
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

  it('seeds the CSRF cookie before the first state-changing request', async () => {
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
    const fetchMock = vi.fn().mockImplementation(() => {
      document.cookie = 'XSRF-TOKEN=seeded-token; path=/';
      return Promise.resolve({ ok: true, status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = firstValueFrom(http.post('/api/v1/encargados/buscar-crear', {}));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/csrf',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );

    const request = httpMock.expectOne('/api/v1/encargados/buscar-crear');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('X-XSRF-TOKEN')).toBe('seeded-token');
    request.flush({});
    await response;
  });
});
