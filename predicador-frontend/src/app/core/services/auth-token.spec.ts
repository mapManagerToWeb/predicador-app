import { HttpClient } from '@angular/common/http';
import { AuthTokenService } from './auth-token';

describe('AuthTokenService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts with no role', () => {
    const svc = new AuthTokenService();
    expect(svc.role()).toBeNull();
    expect(svc.hasToken()).toBe(false);
    expect(svc.isAdmin()).toBe(false);
  });

  it('set() updates reactive role state without persisting the session', () => {
    const svc = new AuthTokenService();
    svc.set('encargado');

    expect(svc.role()).toBe('encargado');
    expect(svc.hasToken()).toBe(true);
    expect(svc.isAdmin()).toBe(false);
    expect(localStorage.getItem('predicador_session_token')).toBeNull();
    expect(localStorage.getItem('predicador_session_role')).toBeNull();
  });

  it('isAdmin true when role is admin', () => {
    const svc = new AuthTokenService();
    svc.set('admin');
    expect(svc.isAdmin()).toBe(true);
  });

  it('clear() wipes signals without touching session storage', () => {
    const svc = new AuthTokenService();
    svc.set('admin');
    svc.clear();

    expect(svc.role()).toBeNull();
    expect(svc.hasToken()).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('does not rehydrate a session from localStorage', () => {
    localStorage.setItem('predicador_session_token', 'stored.token');
    localStorage.setItem('predicador_session_role', 'admin');

    const svc = new AuthTokenService();
    expect(svc.role()).toBeNull();
    expect(svc.isAdmin()).toBe(false);
  });

  it('set() with admin role makes isAdmin true', () => {
    const svc = new AuthTokenService();
    svc.set('admin');
    expect(svc.isAdmin()).toBe(true);
    expect(svc.role()).toBe('admin');
    expect(svc.hasToken()).toBe(true);
  });

  it('set() with encargado role makes isAdmin false', () => {
    const svc = new AuthTokenService();
    svc.set('encargado');
    expect(svc.isAdmin()).toBe(false);
    expect(svc.role()).toBe('encargado');
  });

  it('clear() then set() restores role state', () => {
    const svc = new AuthTokenService();
    svc.set('admin');
    svc.clear();
    expect(svc.hasToken()).toBe(false);
    svc.set('encargado');
    expect(svc.role()).toBe('encargado');
    expect(svc.hasToken()).toBe(true);
  });

  it('logout() clears role state and calls auth endpoint', () => {
    const postSpy = vi.fn().mockReturnValue({ subscribe: vi.fn() });
    const svc = new AuthTokenService({ post: postSpy } as unknown as HttpClient);
    svc.set('admin');
    svc.logout();

    expect(svc.role()).toBeNull();
    expect(svc.hasToken()).toBe(false);
    expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/logout', {});
  });

  it('logout() clears role even when http is not available', () => {
    const svc = new AuthTokenService();
    svc.set('encargado');
    svc.logout();

    expect(svc.hasToken()).toBe(false);
    expect(svc.role()).toBeNull();
  });
});
