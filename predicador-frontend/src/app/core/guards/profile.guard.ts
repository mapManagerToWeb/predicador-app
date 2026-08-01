import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthTokenService } from '../services/auth-token';

export const profileGuard: CanActivateFn = () => {
  const authToken = inject(AuthTokenService);
  const router = inject(Router);

  if (authToken.hasToken()) {
    return true;
  }

  void router.navigate(['/login']);
  return false;
};
