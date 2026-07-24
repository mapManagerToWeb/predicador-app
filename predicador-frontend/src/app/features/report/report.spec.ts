import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ReportPage } from './report';
import { Profile } from '../../core/services/profile';

describe('ReportPage', () => {
  let component: ReportPage;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [ReportPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        Profile
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
});
