import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminPage } from './admin';
import { TerritorioService } from '../../core/services/territorio';
import { Toast } from '../../core/services/toast';

describe('AdminPage', () => {
  let component: AdminPage;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [AdminPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TerritorioService,
        Toast
      ]
    });

    const fixture = TestBed.createComponent(AdminPage);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('login', () => {
    it('should login with correct credentials', () => {
      component.username.set('admin');
      component.password.set('INVALID_REDACTED_CREDENTIAL');
      component.login();

      expect(component.isLoggedIn()).toBeTruthy();
      expect(localStorage.getItem('isAdmin')).toBe('true');
    });

    it('should show error with wrong credentials', () => {
      component.username.set('wrong');
      component.password.set('wrong');
      component.login();

      expect(component.isLoggedIn()).toBeFalsy();
      expect(component.loginError()).toBeTruthy();
    });

    it('should clear login error on successful login', () => {
      component.loginError.set(true);
      component.username.set('admin');
      component.password.set('INVALID_REDACTED_CREDENTIAL');
      component.login();

      expect(component.loginError()).toBeFalsy();
    });
  });

  describe('logout', () => {
    it('should logout and clear state', () => {
      localStorage.setItem('isAdmin', 'true');
      component.isLoggedIn.set(true);

      component.logout();

      expect(component.isLoggedIn()).toBeFalsy();
      expect(localStorage.getItem('isAdmin')).toBeNull();
      expect(component.username()).toBe('');
      expect(component.password()).toBe('');
    });
  });

  describe('ngOnInit', () => {
    it('should auto-login if isAdmin is stored', () => {
      localStorage.setItem('isAdmin', 'true');
      component.ngOnInit();

      expect(component.isLoggedIn()).toBeTruthy();
    });

    it('should not auto-login if isAdmin is not stored', () => {
      component.ngOnInit();

      expect(component.isLoggedIn()).toBeFalsy();
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
    it('should have 19 predefined colors', () => {
      expect(component.coloresPredefinidos.length).toBe(19);
    });

    it('should all be valid hex colors', () => {
      component.coloresPredefinidos.forEach(color => {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
      });
    });
  });
});
