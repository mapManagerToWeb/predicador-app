import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthTokenService } from '../services/auth-token';
import { AuthService } from '../services/auth.service';
import { profileGuard } from './profile.guard';

describe('profileGuard', () => {
  const router = { navigate: vi.fn() } as unknown as Router;
  let authService: { validateSession: ReturnType<typeof vi.fn>; invalidateCache: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    authService = { validateSession: vi.fn(), invalidateCache: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        AuthTokenService,
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: authService },
      ],
    });
  });

  it('redirects when there is no session token even if a profile is stored', async () => {
    const result = await TestBed.runInInjectionContext(() => profileGuard({} as never, {} as never));

    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(authService.validateSession).not.toHaveBeenCalled();
  });

  it('allows a route when a session token exists and backend validates it', async () => {
    TestBed.inject(AuthTokenService).set('encargado');
    authService.validateSession.mockResolvedValue(true);

    const result = await TestBed.runInInjectionContext(() => profileGuard({} as never, {} as never));

    expect(result).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(authService.validateSession).toHaveBeenCalled();
  });

  it('redirects when backend session validation fails', async () => {
    TestBed.inject(AuthTokenService).set('encargado');
    authService.validateSession.mockResolvedValue(false);

    const result = await TestBed.runInInjectionContext(() => profileGuard({} as never, {} as never));

    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(authService.validateSession).toHaveBeenCalled();
  });

  it('redirects when the persisted session token is empty', async () => {
    localStorage.setItem('predicador_role', '');

    const result = await TestBed.runInInjectionContext(() => profileGuard({} as never, {} as never));

    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(authService.validateSession).not.toHaveBeenCalled();
  });
});
