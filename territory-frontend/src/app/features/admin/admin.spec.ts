import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AdminPage } from './admin';
import { TerritorioService } from '../../core/services/territorio';
import { Toast } from '../../core/services/toast';
import { Profile } from '../../core/services/profile';
import { AuthTokenService } from '../../core/services/auth-token';
import { environment } from '../../../environments/environment';
import { provideRouter, Router } from '@angular/router';
import { AdminStore } from './services/admin-store';
import { AdminUi } from './services/admin-ui';

describe('AdminPage', () => {
  let component: AdminPage;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
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
  });

  describe('logout', () => {
    it('should logout and clear admin state and user profile', () => {
      localStorage.setItem('territory_profile', JSON.stringify({ name: 'Test' }));
      TestBed.inject(AuthTokenService).set('admin');
      TestBed.inject(AdminStore).encargados.set([]);
      expect(component.isLoggedIn()).toBeTruthy();

      component.logout();

      expect(component.isLoggedIn()).toBeFalsy();
      expect(localStorage.getItem('territory_profile')).toBeNull();
      expect(TestBed.inject(AdminStore).encargados()).toBeNull();
      expect(component.username()).toBe('');
      expect(component.password()).toBe('');
    });
  });

  describe('sesión', () => {
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

  describe('tema', () => {
    it('respeta el tema guardado y lo alterna', () => {
      localStorage.setItem('territory_theme', 'light');
      component.ngOnInit();
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');

      component.alternarTema();

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(localStorage.getItem('territory_theme')).toBe('dark');
    });
  });

  describe('confirmación', () => {
    it('resuelve la promesa según la respuesta y exige el texto cuando se pide', async () => {
      const ui = TestBed.inject(AdminUi);
      const pendiente = ui.confirmar({ titulo: 'Borrar', mensaje: '¿Seguro?', accion: 'Borrar', escribir: '12' });
      expect(ui.confirmacion()?.escribir).toBe('12');

      component.responder(true);

      await expect(pendiente).resolves.toBe(true);
      expect(ui.confirmacion()).toBeNull();
    });

    it('una confirmación nueva cancela la anterior', async () => {
      const ui = TestBed.inject(AdminUi);
      const primera = ui.confirmar({ titulo: 'A', mensaje: '', accion: 'A' });
      const segunda = ui.confirmar({ titulo: 'B', mensaje: '', accion: 'B' });

      await expect(primera).resolves.toBe(false);
      component.responder(false);
      await expect(segunda).resolves.toBe(false);
    });
  });

  describe('goToMap', () => {
    it('should be defined', () => {
      expect(component.goToMap).toBeDefined();
    });
  });

  describe('menú del celular', () => {
    @Component({ template: '' })
    class Vacia {}

    async function conRutas() {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter(['resumen', 'reportes', 's13', 'sistema'].map(r => ({ path: `admin/${r}`, component: Vacia }))),
        ],
      });
      TestBed.inject(AuthTokenService).set('admin');
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/admin/resumen');
      const fixture = TestBed.createComponent(AdminPage);
      fixture.detectChanges();
      return { fixture, router, el: fixture.nativeElement as HTMLElement };
    }

    it('la barra de abajo trae las secciones de todos los días, con su nombre, y «Más»', async () => {
      const { el } = await conRutas();
      const nombres = [...el.querySelectorAll('.adm-tabs .adm-tab span')].map(s => s.textContent?.trim());
      expect(nombres).toEqual(['Resumen', 'Registrar', 'Encargados', 'Reportes', 'Más']);
      expect(el.querySelector('.adm-mas')).toBeNull();
    });

    it('«Más» abre el resto de las secciones, el tema, el mapa y salir; elegir una lo cierra', async () => {
      const { fixture, router, el } = await conRutas();
      const mas = [...el.querySelectorAll<HTMLElement>('.adm-tabs .adm-tab')].at(-1)!;
      mas.click();
      fixture.detectChanges();
      const items = [...el.querySelectorAll('.adm-mas .adm-mas-item span')].map(s => s.textContent?.trim());
      expect(items).toEqual(['Territorios', 'Tarjetas', 'S-13 y ciclos', 'Sistema', expect.stringMatching(/^Tema/), 'Ir al mapa', 'Salir']);
      expect(mas.getAttribute('aria-expanded')).toBe('true');

      await router.navigateByUrl('/admin/s13');
      fixture.detectChanges();
      expect(fixture.componentInstance.masAbierto()).toBe(false);
      // Estando en una sección de «Más», ese botón queda marcado.
      expect(fixture.componentInstance.enOtras()).toBe(true);
      expect(mas.classList.contains('activo')).toBe(true);

      await router.navigateByUrl('/admin/reportes?x=1');
      expect(fixture.componentInstance.enOtras()).toBe(false);
    });

    it('tocar fuera del menú lo cierra', async () => {
      const { fixture, el } = await conRutas();
      fixture.componentInstance.masAbierto.set(true);
      fixture.detectChanges();
      el.querySelector<HTMLElement>('.adm-mas-fondo')!.click();
      fixture.detectChanges();
      expect(el.querySelector('.adm-mas')).toBeNull();
    });
  });
});
