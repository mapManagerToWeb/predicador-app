import { TestBed } from '@angular/core/testing';
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
      req.flush({ success: true });

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
  });

  describe('logout', () => {
    it('should logout and clear admin state and user profile', () => {
      localStorage.setItem('isAdmin', 'true');
      localStorage.setItem('predicador_profile', JSON.stringify({ name: 'Test' }));
      component.isLoggedIn.set(true);

      component.logout();

      expect(component.isLoggedIn()).toBeFalsy();
      expect(localStorage.getItem('predicador_profile')).toBeNull();
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
    it('should be defined', () => {
      expect(component.goToMap).toBeDefined();
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
