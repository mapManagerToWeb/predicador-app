import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';

export const adminGuard: CanActivateFn = () => {
  const router = inject(Router);

  if (localStorage.getItem('isAdmin') === 'true') {
    return true;
  }

  router.navigate(['/admin']);
  return false;
};
