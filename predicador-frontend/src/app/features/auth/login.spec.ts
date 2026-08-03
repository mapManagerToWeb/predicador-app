import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoginPage } from './login';
import { Profile } from '../../core/services/profile';
import { AuthTokenService } from '../../core/services/auth-token';
import { EncargadoService } from '../../core/services/encargado';
import { Toast } from '../../core/services/toast';
import { ActivatedRoute, Router } from '@angular/router';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let component: LoginPage;
  let encargadoService: { loginByPhone: ReturnType<typeof vi.fn> };
  let profile: { save: ReturnType<typeof vi.fn>; hasProfile: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
    createUrlTree: ReturnType<typeof vi.fn>;
    serializeUrl: ReturnType<typeof vi.fn>;
    isActive: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    localStorage.clear();
    encargadoService = { loginByPhone: vi.fn() };
    profile = { save: vi.fn(), hasProfile: vi.fn().mockReturnValue(false) };
    toast = { show: vi.fn() };
    router = {
      navigate: vi.fn().mockResolvedValue(true),
      createUrlTree: vi.fn(),
      serializeUrl: vi.fn(),
      isActive: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        AuthTokenService,
        { provide: EncargadoService, useValue: encargadoService },
        { provide: Profile, useValue: profile },
        { provide: Toast, useValue: toast },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
  });

  it('redirects to /map when an encargado session is already present (refresh case)', () => {
    TestBed.inject(AuthTokenService).set('encargado');
    (profile.hasProfile as ReturnType<typeof vi.fn>).mockReturnValue(true);

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    component.ngOnInit();

    expect(router.navigate).toHaveBeenCalledWith(['/map']);
  });

  it('does nothing when the phone is empty', async () => {
    component.telefono.set('   ');
    await component.login();

    expect(encargadoService.loginByPhone).not.toHaveBeenCalled();
    expect(component.loading()).toBe(false);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('logs in by phone, saves the profile and navigates to /map', async () => {
    encargadoService.loginByPhone.mockResolvedValue({
      id: 7,
      nombre: 'Daniel',
      apellido: 'Uribe',
      avatar: 3,
      telefono: '56912345678',
      activo: true,
    });
    component.telefono.set('912345678');

    await component.login();

    expect(encargadoService.loginByPhone).toHaveBeenCalledWith('56912345678');
    expect(profile.save).toHaveBeenCalledWith({
      name: 'Daniel',
      lastName: 'Uribe',
      avatar: 3,
      telefono: '56912345678',
      encargadoId: 7,
    });
    expect(router.navigate).toHaveBeenCalledWith(['/map']);
    expect(component.loading()).toBe(false);
  });

  it('shows a warning toast when the user is not found (404)', async () => {
    encargadoService.loginByPhone.mockRejectedValue({ status: 404 });
    component.telefono.set('912345678');

    await component.login();

    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('no encontrado'), 4000, 'warning');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('shows an error toast when the server is unavailable (status 0)', async () => {
    encargadoService.loginByPhone.mockRejectedValue({ status: 0 });
    component.telefono.set('912345678');

    await component.login();

    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('Servidor no disponible'), 4000, 'error');
  });

  it('shows a generic error toast for any other failure', async () => {
    encargadoService.loginByPhone.mockRejectedValue(new Error('boom'));
    component.telefono.set('912345678');

    await component.login();

    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('iniciar sesión'), 3000, 'error');
    expect(component.loading()).toBe(false);
  });
});
