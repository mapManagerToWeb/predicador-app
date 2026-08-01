import { Injectable, Optional, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

/** Tracks only reactive UI auth state; the HMAC is held by an HttpOnly cookie. */
export type SessionRole = 'encargado' | 'admin';

@Injectable({ providedIn: 'root' })
export class AuthTokenService {
  private roleSignal = signal<SessionRole | null>(null);

  // Optional keeps this state service directly constructible in SSR/unit tests.
  // eslint-disable-next-line @angular-eslint/prefer-inject
  constructor(@Optional() private http?: HttpClient) {}

  readonly role = this.roleSignal.asReadonly();
  readonly hasToken = computed(() => this.roleSignal() !== null);
  readonly isAdmin = computed(() => this.roleSignal() === 'admin');

  set(role: SessionRole): void {
    this.roleSignal.set(role);
  }

  clear(): void {
    this.roleSignal.set(null);
  }

  logout(): void {
    this.clear();
    this.http?.post('/api/v1/auth/logout', {}).subscribe({
      error: () => undefined,
      complete: () => undefined,
    });
  }
}
