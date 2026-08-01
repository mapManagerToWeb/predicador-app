import { HttpInterceptorFn } from '@angular/common/http';
import { from, switchMap } from 'rxjs';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_ENDPOINT = '/api/v1/auth/csrf';

export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  const ownBackend = !/^https?:\/\//i.test(req.url);
  if (!ownBackend) return next(req);

  if (SAFE_METHODS.has(req.method)) {
    return next(req.clone({ withCredentials: true }));
  }

  const token = readCookie('XSRF-TOKEN');
  if (token) {
    return next(req.clone({
      withCredentials: true,
      setHeaders: { 'X-XSRF-TOKEN': token },
    }));
  }

  // Fresh session: seed the CSRF cookie through the gateway's dedicated
  // endpoint before sending a state-changing request, then echo it back.
  // This closes the login-CSRF gap on account-creating endpoints without
  // breaking first-time profile creation.
  return from(seedCsrfCookie()).pipe(
    switchMap(() =>
      next(req.clone({
        withCredentials: true,
        setHeaders: { 'X-XSRF-TOKEN': readCookie('XSRF-TOKEN') ?? '' },
      })),
    ),
  );
};

function seedCsrfCookie(): Promise<void> {
  if (typeof fetch === 'undefined') return Promise.resolve();
  return fetch(CSRF_ENDPOINT, { method: 'GET', credentials: 'include', cache: 'no-store' })
    .catch(() => undefined)
    .then(() => undefined);
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  return document.cookie.split('; ').find(value => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}
