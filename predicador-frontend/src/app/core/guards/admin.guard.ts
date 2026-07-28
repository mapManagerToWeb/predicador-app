import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthTokenService } from '../services/auth-token';

/**
 * Route guard for the admin surface.
 *
 * <p>Currently permissive: the admin route hosts its own login form, so
 * blocking navigation here would break the "open the URL, log in, work"
 * flow. This guard exists as a hook so future stricter policies (require an
 * admin token before even rendering the form) can be flipped in one place.</p>
 *
 * <p>What it does today: exposes the token/legacy state as a side effect
 * of resolving. The value is always {@code true} to preserve the current
 * UX; return signature is kept as {@code CanActivateFn} so replacing the
 * body with a real check is a one-line change.</p>
 */
export const adminGuard: CanActivateFn = () => {
  const authToken = inject(AuthTokenService);
  // Touch the signal so DevTools show the current admin auth state next to
  // the route; still non-blocking.
  void authToken.isAdmin();
  return true;
};
