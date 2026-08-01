import { AuthTokenService } from './auth-token';

describe('AuthTokenService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts with no token or role', () => {
    const svc = new AuthTokenService();
    expect(svc.token()).toBeNull();
    expect(svc.role()).toBeNull();
    expect(svc.hasToken()).toBe(false);
    expect(svc.isAdmin()).toBe(false);
  });

  it('set() persists to localStorage and updates signals', () => {
    const svc = new AuthTokenService();
    svc.set('abc.def', 'encargado');

    expect(svc.token()).toBe('abc.def');
    expect(svc.role()).toBe('encargado');
    expect(svc.hasToken()).toBe(true);
    expect(svc.isAdmin()).toBe(false);
    expect(localStorage.getItem('predicador_session_token')).toBe('abc.def');
    expect(localStorage.getItem('predicador_session_role')).toBe('encargado');
  });

  it('isAdmin true when role is admin', () => {
    const svc = new AuthTokenService();
    svc.set('token.sig', 'admin');
    expect(svc.isAdmin()).toBe(true);
  });

  it('clear() wipes signals and localStorage', () => {
    const svc = new AuthTokenService();
    svc.set('abc.def', 'admin');
    svc.clear();

    expect(svc.token()).toBeNull();
    expect(svc.role()).toBeNull();
    expect(svc.hasToken()).toBe(false);
    expect(localStorage.getItem('predicador_session_token')).toBeNull();
    expect(localStorage.getItem('predicador_session_role')).toBeNull();
  });

  it('rehydrates from localStorage when a fresh instance is created', () => {
    localStorage.setItem('predicador_session_token', 'stored.token');
    localStorage.setItem('predicador_session_role', 'admin');

    const svc = new AuthTokenService();
    expect(svc.token()).toBe('stored.token');
    expect(svc.role()).toBe('admin');
    expect(svc.isAdmin()).toBe(true);
  });

  it('does not consider an empty persisted token an active session', () => {
    localStorage.setItem('predicador_session_token', '');

    const svc = new AuthTokenService();

    expect(svc.hasToken()).toBe(false);
  });
});
