import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AdminPage } from './admin';
import { TerritorioService } from '../../core/services/territorio';
import { Toast } from '../../core/services/toast';
import { Profile } from '../../core/services/profile';
import { AuthTokenService } from '../../core/services/auth-token';
import { environment } from '../../../environments/environment';

describe('AdminPage', () => {
  let component: AdminPage;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TerritorioService,
        Toast,
        Profile
      ]
    });

    const fixture = TestBed.createComponent(AdminPage);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
    httpMock.match(() => true);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('login', () => {
    it('should call auth endpoint and set isLoggedIn on success', async () => {
      component.username.set('admin');
      component.password.set('correct_password');

      const loginPromise = component.login();

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ username: 'admin', password: 'correct_password' });
      req.flush({ success: true, token: 'mock-token' });

      await loginPromise;

      expect(component.isLoggedIn()).toBeTruthy();
      expect(localStorage.getItem('isAdmin')).toBeNull();
    });

    it('should show error with wrong credentials', async () => {
      component.username.set('wrong');
      component.password.set('wrong');

      const loginPromise = component.login();

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
      req.flush({ success: false }, { status: 401, statusText: 'Unauthorized' });

      await loginPromise;

      expect(component.isLoggedIn()).toBeFalsy();
      expect(component.loginError()).toBeTruthy();
    });

    it('should show error on network failure', async () => {
      component.username.set('admin');
      component.password.set('password');

      const loginPromise = component.login();

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
      req.error(new ErrorEvent('Network error'));

      await loginPromise;

      expect(component.isLoggedIn()).toBeFalsy();
      expect(component.loginError()).toBeTruthy();
    });

    it('should show error when the backend responds success: false', async () => {
      component.username.set('admin');
      component.password.set('bad');

      const loginPromise = component.login();

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
      req.flush({ success: false });

      await loginPromise;

      expect(component.isLoggedIn()).toBeFalsy();
      expect(component.loginError()).toBeTruthy();
      expect(component.logging()).toBe(false);
    });

    it('should reset loginError before a new attempt', async () => {
      component.loginError.set(true);
      component.username.set('admin');
      component.password.set('pw');

      const loginPromise = component.login();
      expect(component.loginError()).toBe(false);

      httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush({ success: false });
      await loginPromise;
      expect(component.loginError()).toBe(true);
    });
  });

  describe('input handlers', () => {
    it('onUsernameInput reads the input value', () => {
      const target = { value: 'admin2' };
      component.onUsernameInput({ target } as unknown as Event);
      expect(component.username()).toBe('admin2');
    });

    it('onPasswordInput reads the input value', () => {
      const target = { value: 'secret' };
      component.onPasswordInput({ target } as unknown as Event);
      expect(component.password()).toBe('secret');
    });
  });

  describe('cargarDatos', () => {
    it('loads territory numbers and colors', async () => {
      const svc = TestBed.inject(TerritorioService);
      vi.spyOn(svc, 'getNumerosTerritorios').mockResolvedValue([1, 2, 3]);
      vi.spyOn(svc, 'getColores').mockResolvedValue({ 1: '#ff0000' });

      await component.cargarDatos();

      expect(component.numerosTerritorios()).toEqual([1, 2, 3]);
      expect(component.colores()).toEqual({ 1: '#ff0000' });
    });

    it('shows a toast when loading fails', async () => {
      const svc = TestBed.inject(TerritorioService);
      vi.spyOn(svc, 'getNumerosTerritorios').mockRejectedValue(new Error('boom'));
      const toast = TestBed.inject(Toast);
      const showSpy = vi.spyOn(toast, 'show');

      await component.cargarDatos();

      expect(showSpy).toHaveBeenCalledWith('Error al cargar territorios');
      expect(component.numerosTerritorios()).toEqual([]);
    });
  });

  describe('cambiarColor', () => {
    it('persists the new color and confirms with a toast', async () => {
      const svc = TestBed.inject(TerritorioService);
      const asignar = vi.spyOn(svc, 'asignarColor').mockResolvedValue(undefined);
      const toast = TestBed.inject(Toast);
      const showSpy = vi.spyOn(toast, 'show');

      await component.cambiarColor(5, '#123456');

      expect(component.colores()[5]).toBe('#123456');
      expect(asignar).toHaveBeenCalledWith(5, '#123456');
      expect(showSpy).toHaveBeenCalledWith('Color del territorio 5 actualizado');
    });

    it('keeps the optimistic color and warns when saving fails', async () => {
      const svc = TestBed.inject(TerritorioService);
      vi.spyOn(svc, 'asignarColor').mockRejectedValue(new Error('down'));
      const toast = TestBed.inject(Toast);
      const showSpy = vi.spyOn(toast, 'show');

      await component.cambiarColor(7, '#654321');

      expect(component.colores()[7]).toBe('#654321');
      expect(showSpy).toHaveBeenCalledWith('Error al guardar color');
    });
  });

  describe('logout', () => {
    it('should logout and clear admin state and user profile', () => {
      localStorage.setItem('isAdmin', 'true');
      localStorage.setItem('territory_profile', JSON.stringify({ name: 'Test' }));
      component.isLoggedIn.set(true);

      component.logout();

      expect(component.isLoggedIn()).toBeFalsy();
      expect(localStorage.getItem('territory_profile')).toBeNull();
      expect(component.username()).toBe('');
      expect(component.password()).toBe('');
    });
  });

  describe('ngOnInit', () => {
    it('should not auto-login if only the legacy isAdmin flag is stored', () => {
      localStorage.setItem('isAdmin', 'true');
      component.ngOnInit();

      expect(component.isLoggedIn()).toBeFalsy();
    });

    it('should auto-login with an admin session role', () => {
      TestBed.inject(AuthTokenService).set('admin');
      component.ngOnInit();

      expect(component.isLoggedIn()).toBeTruthy();
    });
  });

  describe('getColor', () => {
    it('should return color from colores map if available', () => {
      component.colores.set({ 1: '#ff0000', 2: '#3cb44b' });

      expect(component.getColor(1)).toBe('#ff0000');
      expect(component.getColor(2)).toBe('#3cb44b');
    });

    it('should return predefined color if not in map', () => {
      component.colores.set({});

      const color = component.getColor(1);
      expect(color).toBeTruthy();
      expect(color.startsWith('#')).toBeTruthy();
    });

    it('should cycle through predefined colors', () => {
      component.colores.set({});

      const color1 = component.getColor(1);
      const color2 = component.getColor(2);

      expect(color1).not.toBe(color2);
    });
  });

  describe('goToMap', () => {
    it('navigates to the map', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.goToMap();

      expect(navSpy).toHaveBeenCalledWith(['/map']);
    });
  });

  describe('coloresPredefinidos', () => {
    it('should have 30 predefined colors', () => {
      expect(component.coloresPredefinidos.length).toBe(30);
    });

    it('should all be valid hex colors', () => {
      component.coloresPredefinidos.forEach(color => {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
      });
    });
  });
});
