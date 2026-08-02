import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthTokenService } from '../services/auth-token';
import { Profile } from '../services/profile';
import { Toast } from '../services/toast';

/**
 * Endpoints that issue tokens or bootstrap a session. Errors here are handled
 * by the caller (LoginPage/ProfilePage) so we do not surface a generic toast
 * that would step on their own messaging.
 */
const AUTH_URL_PATTERNS = ['/encargados/login', '/encargados/buscar-crear', '/auth/login'];

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastService = inject(Toast);
  const authToken = inject(AuthTokenService);
  const profile = inject(Profile);
  const router = inject(Router);
  const path = req.url.split('?')[0];
  const isAuthRequest = AUTH_URL_PATTERNS.some(p => path === p || path.endsWith(p));

  return next(req).pipe(
    catchError(error => {
      // 401 desde un endpoint protegido = sesión expirada o token inválido.
      // Limpiar credenciales locales y forzar re-login. No aplicamos esta
      // lógica a los propios endpoints de login (evita loop y sobrescribir
      // el mensaje del formulario).
      if ((error.status === 401 || error.status === 403) && !isAuthRequest) {
        authToken.clear();
        profile.clear();
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('isAdmin');
        }
        toastService.show('Sesión expirada. Iniciá sesión nuevamente.', 4000, 'warning');
        void router.navigate(['/login']);
        return throwError(() => error);
      }

      if (!isAuthRequest) {
        let message = 'Error de conexion';

        if (error.status === 0) {
          message = 'Servidor no disponible';
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
