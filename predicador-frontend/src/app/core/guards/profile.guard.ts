import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthTokenService } from '../services/auth-token';
import { AuthService } from '../services/auth.service';

export const profileGuard: CanActivateFn = async () => {
  const authToken = inject(AuthTokenService);
  const authService = inject(AuthService);
  const router = inject(Router);

  // Primero verificar que exista el token UI (localStorage)
  if (!authToken.hasToken()) {
    void router.navigate(['/login']);
    return false;
  }

  // Luego validar que la sesión del backend sea válida
  const isSessionValid = await authService.validateSession();
  if (!isSessionValid) {
    // Sesión inválida: limpiar estado local y redirigir a login
    authToken.clear();
    void router.navigate(['/login']);
    return false;
  }

  return true;
};
