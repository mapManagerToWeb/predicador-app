import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
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
});
