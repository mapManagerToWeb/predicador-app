import { HttpInterceptorFn } from '@angular/common/http';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  const ownBackend = !/^https?:\/\//i.test(req.url);
  if (!ownBackend) return next(req);

  const token = SAFE_METHODS.has(req.method) ? null : readCookie('XSRF-TOKEN');
  return next(req.clone({
    withCredentials: true,
    ...(token ? { setHeaders: { 'X-XSRF-TOKEN': token } } : {}),
  }));
};

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  return document.cookie.split('; ').find(value => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}
