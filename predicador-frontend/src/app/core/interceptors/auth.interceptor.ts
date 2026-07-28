import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthTokenService } from '../services/auth-token';

/**
 * Attaches the HMAC session token as {@code X-Session-Token} on every request
 * that hits our own API. Endpoints that mint tokens (login/register) are
 * excluded to avoid stamping stale tokens on a re-authentication attempt.
 *
 * <p>Requests to third-party origins (tile servers) are ignored so we do not
 * leak credentials.</p>
 */
const PUBLIC_SUFFIXES = [
  '/auth/login',
  '/encargados/login',
  '/encargados/buscar-crear',
];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authToken = inject(AuthTokenService);
  const token = authToken.token();

  if (!token) {
    return next(req);
  }

  // Only attach to relative URLs (our backend is proxied through /api). Fully
  // qualified URLs to other origins (map tiles, images, WhatsApp media) must
  // never receive the token.
  const isOwnBackend = !/^https?:\/\//i.test(req.url);
  if (!isOwnBackend) {
    return next(req);
  }

  if (PUBLIC_SUFFIXES.some(suffix => req.url.endsWith(suffix))) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: { 'X-Session-Token': token },
    }),
  );
};
