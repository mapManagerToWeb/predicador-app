import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthTokenService } from '../services/auth-token';
import { Profile } from '../services/profile';
import { Toast } from '../services/toast';
import { AuthService } from '../services/auth.service';

/**
 * Endpoints that issue tokens or bootstrap a session. Errors here are handled
 * by the caller (LoginPage/ProfilePage) so we do not surface a generic toast
 * that would step on their own messaging.
 */
const LOGIN_URL_PATTERNS = ['/encargados/login', '/encargados/buscar-crear', '/auth/login'];

/**
 * The session-validation probe (`/encargados/session`) is added on top of the
 * login endpoints: during a cold-starting stack its failure is a transient 5xx
 * from the gateway (services not yet registered in Eureka), not a session
 * error, and the guard decides how to react without a misleading
 * "Error del servidor" toast. A genuine 401 on the probe, however, IS a real
 * expired session and must keep the full logout hygiene below — so the 401
 * branch only excludes the login endpoints, not the probe.
 */
const AUTH_URL_PATTERNS = [...LOGIN_URL_PATTERNS, '/encargados/session'];

/**
 * Endpoints whose callers handle errors themselves (guardarYEnviar, etc.).
 * Showing a generic toast here would duplicate the caller's own messaging.
 */
const SELF_HANDLED_PATTERNS = ['/reports/send', '/reports?'];

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastService = inject(Toast);
  const authToken = inject(AuthTokenService);
  const profile = inject(Profile);
  const router = inject(Router);
  const authService = inject(AuthService, { optional: true });
  const path = req.url.split('?')[0];
  const isLoginRequest = LOGIN_URL_PATTERNS.some(p => path === p || path.endsWith(p));
  const isAuthRequest = AUTH_URL_PATTERNS.some(p => path === p || path.endsWith(p));
  const isSelfHandled = SELF_HANDLED_PATTERNS.some(p => req.url.includes(p));

  return next(req).pipe(
    catchError(error => {
      // 401 desde un endpoint protegido = sesión expirada o token inválido.
      // Limpiar credenciales locales y forzar re-login. No aplicamos esta
      // lógica a los propios endpoints de login (evita loop y sobrescribir
      // el mensaje del formulario).
      //
      // Un 403 NO entra aquí: significa "autenticado pero sin permiso para
      // este recurso" (o un token CSRF rechazado). Cerrar la sesión en ese
      // caso expulsaba al usuario al login por acciones que solo debían
      // mostrar un aviso.
      if (error.status === 401 && !isLoginRequest) {
        authToken.clear();
        profile.clear();
        authService?.invalidateCache();
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('isAdmin');
        }
        toastService.show('Sesión expirada. Iniciá sesión nuevamente.', 4000, 'warning');
        void router.navigate(['/login']);
        return throwError(() => error);
      }

      if (!isAuthRequest && !isSelfHandled) {
        let message = 'Error de conexion';

        if (error.status === 0) {
          message = 'Servidor no disponible';
        } else if (error.status === 403) {
          message = 'No tenés permisos para realizar esta acción';
        } else if (error.status === 404) {
          message = 'Recurso no encontrado';
        } else if (error.status === 429) {
          message = 'Demasiadas solicitudes. Esperá un momento.';
        } else if (error.status >= 500) {
          message = 'Error del servidor';
        }

        toastService.show(message);
      }
      return throwError(() => error);
    }),
  );
};
