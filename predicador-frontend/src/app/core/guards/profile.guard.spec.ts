import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthTokenService } from '../services/auth-token';
import { profileGuard } from './profile.guard';

describe('profileGuard', () => {
  const router = { navigate: vi.fn() } as unknown as Router;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        AuthTokenService,
        { provide: Router, useValue: router },
      ],
    });
  });

  it('redirects when there is no session token even if a profile is stored', () => {
    const result = TestBed.runInInjectionContext(() => profileGuard({} as never, {} as never));

    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('allows a route when a session token exists', () => {
    TestBed.inject(AuthTokenService).set('session-token', 'encargado');

    const result = TestBed.runInInjectionContext(() => profileGuard({} as never, {} as never));

    expect(result).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('redirects when the persisted session token is empty', () => {
    localStorage.setItem('predicador_session_token', '');

    const result = TestBed.runInInjectionContext(() => profileGuard({} as never, {} as never));

    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
