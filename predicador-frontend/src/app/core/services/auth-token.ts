import { Injectable, computed, signal } from '@angular/core';

/**
 * Persists the HMAC session token minted by the backend on successful login.
 *
 * <p>The token is opaque to the frontend: we do not decode the payload
 * (there is nothing sensitive we would trust anyway — the backend re-verifies
 * every request). We only need to remember two things:</p>
 * <ul>
 *   <li>The token string, sent as {@code X-Session-Token} by the auth interceptor.</li>
 *   <li>The role ({@code encargado} or {@code admin}), used only for local UI state.</li>
 * </ul>
 *
 * <p>Storing tokens in {@code localStorage} is a known XSS footgun. It is an
 * acceptable trade-off here because the app has no third-party scripts and
 * Angular's built-in sanitization covers the DOM sinks in use. Moving to
 * {@code httpOnly} cookies is planned but requires cross-origin CORS with
 * credentials which is out of scope for this pass.</p>
 */
export type SessionRole = 'encargado' | 'admin';

const TOKEN_KEY = 'predicador_session_token';
const ROLE_KEY = 'predicador_session_role';

@Injectable({ providedIn: 'root' })
export class AuthTokenService {
  private tokenSignal = signal<string | null>(this.readInitial(TOKEN_KEY));
  private roleSignal = signal<SessionRole | null>(
    this.readInitial(ROLE_KEY) as SessionRole | null,
  );

  readonly token = this.tokenSignal.asReadonly();
  readonly role = this.roleSignal.asReadonly();
  readonly hasToken = computed(() => this.tokenSignal() !== null);
  readonly isAdmin = computed(() => this.roleSignal() === 'admin');

  set(token: string, role: SessionRole): void {
    this.tokenSignal.set(token);
    this.roleSignal.set(role);
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ROLE_KEY, role);
  }

  clear(): void {
    this.tokenSignal.set(null);
    this.roleSignal.set(null);
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
  }

  private readInitial(key: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  }
}
