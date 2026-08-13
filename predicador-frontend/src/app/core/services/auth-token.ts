import { Injectable, Optional, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { TerritorioService } from './territorio';

/** Tracks only reactive UI auth state; the HMAC is held by an HttpOnly cookie. */
export type SessionRole = 'encargado' | 'admin';

const ROLE_KEY = 'predicador_role';

function loadRole(): SessionRole | null {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(ROLE_KEY);
  return value === 'encargado' || value === 'admin' ? value : null;
}

@Injectable({ providedIn: 'root' })
export class AuthTokenService {
  private roleSignal = signal<SessionRole | null>(loadRole());
  // Optional keeps this state service directly constructible in SSR/unit tests.
  /* eslint-disable @angular-eslint/prefer-inject */
  constructor(
    @Optional() private http?: HttpClient,
    @Optional() private authService?: AuthService,
    @Optional() private territorioService?: TerritorioService,
  ) {}
  /* eslint-enable @angular-eslint/prefer-inject */

  readonly role = this.roleSignal.asReadonly();
  readonly hasToken = computed(() => this.roleSignal() !== null);
  readonly isAdmin = computed(() => this.roleSignal() === 'admin');

  set(role: SessionRole): void {
    this.roleSignal.set(role);
    this.persist(role);
  }

  clear(): void {
    this.roleSignal.set(null);
    this.persist(null);
    this.authService?.invalidateCache();
    this.territorioService?.logout();
  }

  logout(): void {
    this.clear();
    this.http?.post('/api/v1/auth/logout', {}).subscribe({
      error: () => undefined,
      complete: () => undefined,
    });
  }

  /**
   * Persists the UI role so a page refresh keeps the user "logged in" at the
   * routing level. The authoritative session is still the HttpOnly HMAC
   * cookie; if that cookie is missing/expired the backend answers 401 and the
   * error interceptor clears this state and redirects to login.
   */
  private persist(role: SessionRole | null): void {
    if (typeof localStorage === 'undefined') return;
    try {
      if (role === null) {
        localStorage.removeItem(ROLE_KEY);
      } else {
        localStorage.setItem(ROLE_KEY, role);
      }
    } catch {
      // Storage can be unavailable (private mode); the in-memory signal still
      // carries the role for the current session.
    }
  }
}
