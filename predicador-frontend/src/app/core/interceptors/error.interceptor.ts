import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Toast } from '../services/toast';

const AUTH_URL_PATTERNS = ['/encargados/login', '/encargados/buscar-crear'];

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastService = inject(Toast);
  const isAuthRequest = AUTH_URL_PATTERNS.some(p => req.url.includes(p));

  return next(req).pipe(
    catchError((error) => {
      if (!isAuthRequest) {
        let message = 'Error de conexion';

        if (error.status === 0) {
          message = 'Servidor no disponible';
        } else if (error.status === 404) {
          message = 'Recurso no encontrado';
        } else if (error.status >= 500) {
          message = 'Error del servidor';
        }

        toastService.show(message);
      }
      return throwError(() => error);
    })
  );
};
