import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthTokenService } from '../services/auth-token';
import { Profile } from '../services/profile';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authToken: AuthTokenService;
  let profile: Profile;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    authToken = TestBed.inject(AuthTokenService);
    profile = TestBed.inject(Profile);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('en 401 fuera de rutas de auth: limpia token/profile y navega a /login', () => {
    authToken.set('encargado');
    profile.save({ name: 'X', lastName: 'Y', avatar: 0 });
    localStorage.setItem('isAdmin', 'true');
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.get('/api/v1/reports').subscribe({ error: () => void 0 });
    const req = httpMock.expectOne('/api/v1/reports');
    req.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authToken.role()).toBeNull();
    expect(profile.currentUser()).toBeNull();
    expect(localStorage.getItem('isAdmin')).toBeNull();
    expect(navSpy).toHaveBeenCalledWith(['/login']);
  });

  it('en 401 sobre rutas de login: NO limpia token ni redirige', () => {
    authToken.set('encargado');
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.post('/api/v1/encargados/login', {}).subscribe({ error: () => void 0 });
    const req = httpMock.expectOne('/api/v1/encargados/login');
    req.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authToken.role()).toBe('encargado');
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('propaga el error para que el caller pueda reaccionar', () => {
    let capturedStatus: number | undefined;
    http.get('/api/v1/reports').subscribe({
      error: (err: { status?: number }) => {
        capturedStatus = err.status;
      },
    });
    const req = httpMock.expectOne('/api/v1/reports');
    req.flush({}, { status: 500, statusText: 'Server' });

    expect(capturedStatus).toBe(500);
  });

  it('en 403 NO limpia la sesión ni redirige: el usuario sigue autenticado', () => {
    // 403 = autenticado pero sin permiso (o token CSRF rechazado). Tratarlo
    // como sesión expirada expulsaba al login al guardar un reporte.
    authToken.set('encargado');
    profile.save({ name: 'X', lastName: 'Y', avatar: 0 });
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.get('/api/v1/reports').subscribe({ error: () => void 0 });
    const req = httpMock.expectOne('/api/v1/reports');
    req.flush({}, { status: 403, statusText: 'Forbidden' });

    expect(authToken.hasToken()).toBe(true);
    expect(profile.currentUser()).not.toBeNull();
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('en 404 no redirige ni limpia sesión', () => {
    authToken.set('encargado');
    profile.save({ name: 'X', lastName: 'Y', avatar: 0 });
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.get('/api/v1/reports').subscribe({ error: () => void 0 });
    const req = httpMock.expectOne('/api/v1/reports');
    req.flush({}, { status: 404, statusText: 'Not Found' });

    expect(authToken.hasToken()).toBe(true);
    expect(profile.currentUser()).not.toBeNull();
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('en 429 no redirige ni limpia sesión', () => {
    authToken.set('encargado');
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.get('/api/v1/reports').subscribe({ error: () => void 0 });
    const req = httpMock.expectOne('/api/v1/reports');
    req.flush({}, { status: 429, statusText: 'Too Many Requests' });

    expect(authToken.hasToken()).toBe(true);
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('en error de red (status 0) no redirige', () => {
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.get('/api/v1/reports').subscribe({ error: () => void 0 });
    const req = httpMock.expectOne('/api/v1/reports');
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(navSpy).not.toHaveBeenCalled();
  });

  it('en 401 sobre buscar-crear: NO limpia token ni redirige', () => {
    authToken.set('encargado');
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.post('/api/v1/encargados/buscar-crear', {}).subscribe({ error: () => void 0 });
    const req = httpMock.expectOne('/api/v1/encargados/buscar-crear');
    req.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authToken.hasToken()).toBe(true);
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('en 401 sobre el probe de sesión: limpia token/profile y navega a /login', () => {
    // El probe solo suprime el toast genérico para 5xx/red (cold start). Un 401
    // ahí es una sesión genuinamente expirada y debe recibir la limpieza completa.
    authToken.set('encargado');
    profile.save({ name: 'X', lastName: 'Y', avatar: 0 });
    localStorage.setItem('isAdmin', 'true');
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.get('/api/v1/encargados/session').subscribe({ error: () => void 0 });
    const req = httpMock.expectOne('/api/v1/encargados/session');
    req.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authToken.role()).toBeNull();
    expect(profile.currentUser()).toBeNull();
    expect(localStorage.getItem('isAdmin')).toBeNull();
    expect(navSpy).toHaveBeenCalledWith(['/login']);
  });

  it('en 502 sobre el probe de sesión: NO limpia token ni redirige (cold start)', () => {
    // Durante el arranque en frío el gateway responde 502/503; el guard decide
    // mantener la sesión, así que el interceptor no debe tocar el estado local.
    authToken.set('encargado');
    profile.save({ name: 'X', lastName: 'Y', avatar: 0 });
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.get('/api/v1/encargados/session').subscribe({ error: () => void 0 });
    const req = httpMock.expectOne('/api/v1/encargados/session');
    req.flush({}, { status: 502, statusText: 'Bad Gateway' });

    expect(authToken.hasToken()).toBe(true);
    expect(profile.currentUser()).not.toBeNull();
    expect(navSpy).not.toHaveBeenCalled();
  });
});
