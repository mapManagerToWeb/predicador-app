import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProfilePage } from './profile';
import { Profile } from '../../core/services/profile';
import { EncargadoService } from '../../core/services/encargado';
import { Toast } from '../../core/services/toast';
import { ActivatedRoute, Router } from '@angular/router';

describe('ProfilePage', () => {
  let fixture: ComponentFixture<ProfilePage>;
  let component: ProfilePage;
  let profile: { hasProfile: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  let encargadoService: { buscarOCrear: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
    createUrlTree: ReturnType<typeof vi.fn>;
    serializeUrl: ReturnType<typeof vi.fn>;
    isActive: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    profile = { hasProfile: vi.fn().mockReturnValue(false), save: vi.fn() };
    encargadoService = { buscarOCrear: vi.fn() };
    toast = { show: vi.fn() };
    router = {
      navigate: vi.fn().mockResolvedValue(true),
      createUrlTree: vi.fn(),
      serializeUrl: vi.fn(),
      isActive: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [
        { provide: Profile, useValue: profile },
        { provide: EncargadoService, useValue: encargadoService },
        { provide: Toast, useValue: toast },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfilePage);
    component = fixture.componentInstance;
  });

  it('redirects to /map when a profile already exists', () => {
    profile.hasProfile.mockReturnValue(true);
    component.ngOnInit();

    expect(router.navigate).toHaveBeenCalledWith(['/map']);
  });

  it('does not redirect when no profile exists', () => {
    component.ngOnInit();

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('updates fields from input events', () => {
    component.onNameInput({ target: { value: 'Daniel' } } as unknown as Event);
    component.onLastNameInput({ target: { value: 'Uribe' } } as unknown as Event);
    component.onTelefonoInput({ target: { value: '912345678' } } as unknown as Event);

    expect(component.name()).toBe('Daniel');
    expect(component.lastName()).toBe('Uribe');
    expect(component.telefono()).toBe('912345678');
  });

  it('selects an avatar', () => {
    component.selectAvatar(4);
    expect(component.selectedAvatar()).toBe(4);
  });

  it('does not save when required fields are missing', async () => {
    component.name.set('');
    await component.save();

    expect(encargadoService.buscarOCrear).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('creates the encargado, saves the profile and navigates to /map', async () => {
    encargadoService.buscarOCrear.mockResolvedValue({
      id: 7,
      nombre: 'Daniel',
      apellido: 'Uribe',
      avatar: 3,
      telefono: '56912345678',
      activo: true,
    });
    component.name.set('Daniel');
    component.lastName.set('Uribe');
    component.telefono.set('912345678');
    component.selectAvatar(3);

    await component.save();

    expect(encargadoService.buscarOCrear).toHaveBeenCalledWith('Daniel', 'Uribe', '912345678');
    expect(profile.save).toHaveBeenCalledWith({
      name: 'Daniel',
      lastName: 'Uribe',
      avatar: 3,
      telefono: '56912345678',
      encargadoId: 7,
    });
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('exitosamente'), 2000, 'success');
    expect(router.navigate).toHaveBeenCalledWith(['/map']);
    expect(component.loading()).toBe(false);
  });

  it('falls back to a local profile when the backend is unavailable', async () => {
    encargadoService.buscarOCrear.mockRejectedValue(new Error('offline'));
    component.name.set('Daniel');
    component.lastName.set('Uribe');
    component.telefono.set('912345678');

    await component.save();

    expect(profile.save).toHaveBeenCalledWith({
      name: 'Daniel',
      lastName: 'Uribe',
      avatar: 0,
      telefono: '56912345678',
    });
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('guardado localmente'), 3000, 'warning');
    expect(router.navigate).toHaveBeenCalledWith(['/map']);
  });
});
