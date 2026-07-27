import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { Profile } from '../services/profile';

export const profileGuard: CanActivateFn = () => {
  const profileService = inject(Profile);
  const router = inject(Router);

  if (profileService.hasProfile()) {
    return true;
  }

  void router.navigate(['/login']);
  return false;
};
