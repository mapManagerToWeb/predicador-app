import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay } from 'rxjs';

/**
 * Acceso al token CSRF de double-submit.
 *
 * El gateway emite `XSRF-TOKEN` como cookie **legible por JS** (sin `HttpOnly`,
 * a propósito) y exige que las mutaciones la repitan en `X-XSRF-TOKEN`. Este
 * servicio es la única pieza que sabe leerla y refrescarla; el interceptor solo
 * la consume.
 */
@Injectable({ providedIn: 'root' })
export class CsrfTokenService {
  static readonly COOKIE_NAME = 'XSRF-TOKEN';
  static readonly HEADER_NAME = 'X-XSRF-TOKEN';
  private static readonly BOOTSTRAP_URL = '/api/v1/auth/csrf';

  /**
   * Cliente sin interceptores: el bootstrap no debe volver a entrar en la
   * cadena que lo invoca. `HttpBackend` es el último eslabón, así que la
   * petición sale directa y sigue siendo mockeable en tests.
   */
  private readonly http = new HttpClient(inject(HttpBackend));

  /** Refresco en vuelo, compartido para no disparar N bootstraps en paralelo. */
  private inFlight: Observable<string | null> | null = null;

  /** Token actual, o `null` si no hay cookie legible. */
  read(): string | null {
    if (typeof document === 'undefined') return null;
    const prefix = `${CsrfTokenService.COOKIE_NAME}=`;
    const raw = document.cookie
      .split('; ')
      .find(entry => entry.startsWith(prefix))
      ?.slice(prefix.length);
    return raw ? decodeURIComponent(raw) : null;
  }

  /**
   * Pide al gateway un token nuevo y resuelve con el que quede en la cookie.
   *
   * El endpoint rota siempre, así que también recupera el caso en que la cookie
   * existente es ilegible o quedó desincronizada del backend. Las llamadas
   * concurrentes comparten la misma petición.
   */
  refresh(): Observable<string | null> {
    this.inFlight ??= this.http
      .get(CsrfTokenService.BOOTSTRAP_URL, { responseType: 'text', withCredentials: true })
      .pipe(
        map(() => this.read()),
        // Si el bootstrap falla, aún puede haber una cookie válida de antes:
        // que decida quien llame, no este servicio.
        catchError(() => of(this.read())),
        finalize(() => {
          this.inFlight = null;
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
    return this.inFlight;
  }
}
