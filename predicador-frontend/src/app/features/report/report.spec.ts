import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ReportPage } from './report';
import { Profile } from '../../core/services/profile';
import { Toast } from '../../core/services/toast';

describe('ReportPage', () => {
  let component: ReportPage;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [ReportPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        Profile,
        Toast
      ]
    });

    const profileService = TestBed.inject(Profile);
    profileService.save({ name: 'Daniel', lastName: 'Uribe', avatar: 0 });

    const fixture = TestBed.createComponent(ReportPage);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('horario', () => {
    it('should have a default horario', () => {
      const horario = component.horario();
      expect(['morning', 'afternoon']).toContain(horario);
    });

    it('should set horario', () => {
      component.horario.set('morning');
      expect(component.horario()).toBe('morning');

      component.horario.set('afternoon');
      expect(component.horario()).toBe('afternoon');
    });
  });

  describe('perfil', () => {
    it('should return current user profile', () => {
      expect(component.perfil).toBeTruthy();
      expect(component.perfil?.name).toBe('Daniel');
      expect(component.perfil?.lastName).toBe('Uribe');
    });
  });

  describe('enviarReporte', () => {
    it('should add territory to session', () => {
      vi.spyOn<any>(component, 'enviarPorWhatsApp').mockResolvedValue(undefined);

      component.enviarReporte(1, 3, ['1.a', '1.b', '1.c'], [1, 2, 3]);

      expect(component.territoriosEnSesion().length).toBe(1);
      expect(component.territoriosEnSesion()[0].numero).toBe(1);
      expect(component.territoriosEnSesion()[0].manzanasMarcadas).toBe(3);
      expect(component.territoriosEnSesion()[0].estado).toBe('completed');
    });

    it('should mark as incomplete when no manzanas', () => {
      vi.spyOn<any>(component, 'enviarPorWhatsApp').mockResolvedValue(undefined);

      component.enviarReporte(1, 0, [], []);

      expect(component.territoriosEnSesion()[0].estado).toBe('incomplete');
    });

    it('should update existing territory in session', () => {
      vi.spyOn<any>(component, 'enviarPorWhatsApp').mockResolvedValue(undefined);

      component.enviarReporte(1, 0, [], []);
      component.enviarReporte(1, 5, ['1.a', '1.b', '1.c', '1.d', '1.e'], [1, 2, 3, 4, 5]);

      expect(component.territoriosEnSesion().length).toBe(1);
      expect(component.territoriosEnSesion()[0].manzanasMarcadas).toBe(5);
      expect(component.territoriosEnSesion()[0].estado).toBe('completed');
    });

    it('should support multiple territories', () => {
      vi.spyOn<any>(component, 'enviarPorWhatsApp').mockResolvedValue(undefined);

      component.enviarReporte(1, 3, ['1.a', '1.b', '1.c'], [1, 2, 3]);
      component.enviarReporte(2, 2, ['2.a', '2.b'], [4, 5]);

      expect(component.territoriosEnSesion().length).toBe(2);
    });
  });

  describe('cerrarCaptura', () => {
    it('should close capture modal', () => {
      component.mostrarCaptura.set(true);
      component.capturaUrl.set('data:image/png;base64,...');

      component.cerrarCaptura();

      expect(component.mostrarCaptura()).toBeFalsy();
      expect(component.capturaUrl()).toBeNull();
    });
  });

  describe('descargarCaptura', () => {
    it('should not fail when no capture URL', () => {
      component.capturaUrl.set(null);
      expect(() => component.descargarCaptura()).not.toThrow();
    });
  });

  describe('copiarMensaje', () => {
    it('should be defined', () => {
      expect(component.copiarMensaje).toBeDefined();
    });
  });

  describe('abrirWhatsApp', () => {
    it('should be defined', () => {
      expect(component.abrirWhatsApp).toBeDefined();
    });
  });
});
