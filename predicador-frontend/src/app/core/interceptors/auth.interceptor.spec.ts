import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AuthTokenService } from '../services/auth-token';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authToken: AuthTokenService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    authToken = TestBed.inject(AuthTokenService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('sends credentials without exposing a session token header', () => {
    http.get('/api/v1/territories').subscribe();
    const req = httpMock.expectOne('/api/v1/territories');
    expect(req.request.headers.has('X-Session-Token')).toBe(false);
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('does not send a browser-held session token header', () => {
    authToken.set('abc.def', 'encargado');

    http.get('/api/v1/reports').subscribe();
    const req = httpMock.expectOne('/api/v1/reports');
    expect(req.request.headers.has('X-Session-Token')).toBe(false);
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('sends credentials to login without a session token header', () => {
    authToken.set('abc.def', 'encargado');

    http.post('/api/v1/encargados/login', {}).subscribe();
    const req = httpMock.expectOne('/api/v1/encargados/login');
    expect(req.request.headers.has('X-Session-Token')).toBe(false);
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('no envía token a URLs de otros orígenes (tiles/media)', () => {
    authToken.set('abc.def', 'encargado');

    http.get('https://tile.openstreetmap.org/0/0/0.png').subscribe();
    const req = httpMock.expectOne('https://tile.openstreetmap.org/0/0/0.png');
    expect(req.request.headers.has('X-Session-Token')).toBe(false);
    req.flush({});
  });
});
