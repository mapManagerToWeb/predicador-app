import { retry, throwError, timer, type Observable } from 'rxjs';

/**
 * 502/503/504 del gateway casi siempre indican que la instancia destino aún no
 * está registrada (arranque en frío) o que el upstream está transitoriamente
 * caído: el fallback se produjo antes del ruteo al servicio, por lo que un
 * reintento corto con backoff es seguro. Los 4xx y la falta de red (status 0)
 * no se reintentan.
 */
export const TRANSIENT_STATUSES = new Set([502, 503, 504]);

/** Backoff base para GETs de revalidación en segundo plano (rápidos). */
export const REVALIDATION_RETRY_DELAY_MS = 1000;

/** Backoff base para operaciones de mutación (login, guardado, compensación). */
export const MUTATION_RETRY_DELAY_MS = 1500;

export function isTransientStatus(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return typeof status === 'number' && TRANSIENT_STATUSES.has(status);
}

/** Reintenta con backoff lineal solo cuando el error es un 502/503/504. */
export function retryTransient(count: number, delayMs: number): <T>(source: Observable<T>) => Observable<T> {
  return (source) =>
    source.pipe(
      retry({
        count,
        delay: (error, attempt) =>
          isTransientStatus(error) ? timer(delayMs * attempt) : throwError(() => error),
      }),
    );
}