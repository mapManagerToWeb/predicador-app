import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, switchMap, throwError } from 'rxjs';
import { CsrfTokenService } from '../services/csrf-token';

/**
 * Protección CSRF de double-submit en el cliente: copia la cookie `XSRF-TOKEN`
 * al header `X-XSRF-TOKEN` en cada mutación contra nuestra API.
 *
 * <p>Si no hay token todavía lo pide al gateway antes de enviar, y si el gateway
 * rechaza por CSRF (token rotado tras un login, o caducado) lo refresca y
 * reintenta **una** vez. Así un desajuste transitorio no se le presenta al
 * usuario como sesión caída.</p>
 *
 * <p>Requiere ejecutarse por dentro de `errorInterceptor` (ver `app.config.ts`)
 * para que el reintento ocurra antes de que un 403 se interprete como error.</p>
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * `type` con el que el gateway marca un rechazo por CSRF. Distinguirlo de un
 * 403 de autorización es lo que permite reintentar en lugar de fallar.
 */
const CSRF_PROBLEM_TYPE = 'https://api.predicador.com/errors/csrf-token-invalid';

export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  // Orígenes ajenos (tiles del mapa, imágenes) nunca reciben credenciales.
  if (/^https?:\/\//i.test(req.url)) return next(req);

  const withCredentials = req.clone({ withCredentials: true });
  if (SAFE_METHODS.has(req.method)) return next(withCredentials);

  const csrf = inject(CsrfTokenService);
  const send = (token: string | null) => sendWithToken(withCredentials, token, next);
  const token = csrf.read();

  const attempt = token ? send(token) : csrf.refresh().pipe(switchMap(send));

  return attempt.pipe(
    catchError((error: unknown) =>
      isCsrfRejection(error)
        ? csrf.refresh().pipe(switchMap(send))
        : throwError(() => error),
    ),
  );
};

function sendWithToken(
  req: HttpRequest<unknown>,
  token: string | null,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  if (!token) {
    // Enviar el header vacío devolvería un 403 indistinguible de "sin
    // permisos"; es más útil fallar aquí, nombrando la causa real.
    return throwError(
      () =>
        new Error(
          `No se pudo obtener el token CSRF: la cookie ${CsrfTokenService.COOKIE_NAME} no es legible.`,
        ),
    );
  }
  return next(req.clone({ setHeaders: { [CsrfTokenService.HEADER_NAME]: token } }));
}

function isCsrfRejection(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 403) return false;
  const body: unknown = error.error;
  if (typeof body === 'string') return body.includes(CSRF_PROBLEM_TYPE);
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { type?: unknown }).type === CSRF_PROBLEM_TYPE
  );
}
