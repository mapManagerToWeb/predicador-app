import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Carries session credentials on every request that hits our own API by
 * enabling {@code withCredentials}, so the browser sends the HttpOnly HMAC
 * session cookie established by the gateway. Requests to third-party origins
 * (tile servers) are ignored so credentials are never leaked.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Only attach to relative URLs (our backend is proxied through /api). Fully
  // qualified URLs to other origins (map tiles, images, WhatsApp media) must
  // never receive the token.
  const isOwnBackend = !/^https?:\/\//i.test(req.url);
  if (!isOwnBackend) {
    return next(req);
  }

  return next(req.clone({ withCredentials: true }));
};
