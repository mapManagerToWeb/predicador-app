import { Injectable, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, NavigationEnd } from '@angular/router';
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { environment } from '../../../environments/environment';

/**
 * Collapses path segments that look like IDs so we do not blow the label
 * cardin ality on the Prometheus side.
 *
 * Pure function — exported for unit testing without Angular DI.
 *
 * @example
 * normalizeRoute('/territories/123/color') // '/territories/:id/color'
 * normalizeRoute('/map?q=test')            // '/map'
 */
export function normalizeRoute(path: string): string {
  return path
    .replace(/\?.*$/, '')
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .slice(0, 40);
}

/**
 * Real User Monitoring (RUM): captures Core Web Vitals in the browser and
 * ships them to the backend {@code /api/v1/rum} sink, which converts them
 * into Prometheus metrics.
 *
 * <p>Uses {@code navigator.sendBeacon} so the report survives page unload
 * (LCP is often reported on {@code visibilitychange = hidden}). Falls back
 * to {@code fetch(..., { keepalive: true })} when sendBeacon is unavailable
 * or refuses the payload.</p>
 *
 * <p>The service is a no-op on the server (SSR) since {@code web-vitals}
 * touches {@code PerformanceObserver} which only exists in the browser.</p>
 *
 * <p>{@code start()} is strictly idempotent — safe to call multiple times.
 * Subscriptions are cleaned up via {@code DestroyRef}.</p>
 */
@Injectable({ providedIn: 'root' })
export class RumService {
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private endpoint = `${environment.apiUrl}/rum`;
  private currentRoute = '/';
  private started = false;

  /**
   * Called once from {@code app.config.ts} or an APP_INITIALIZER. Idempotent
   * even if invoked twice by mistake; web-vitals debounces its own callbacks.
   */
  start(): void {
    if (this.started) return;
    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
      return;
    }
    this.started = true;

    // Track the current route so we can tag each metric with it.
    this.currentRoute = normalizeRoute(window.location.pathname);
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.currentRoute = normalizeRoute(event.urlAfterRedirects);
      }
    });

    const report = (metric: Metric): void => this.send(metric);

    onLCP(report);
    onINP(report);
    onCLS(report);
    onFCP(report);
    onTTFB(report);
  }

  private send(metric: Metric): void {
    const payload = JSON.stringify({
      name: metric.name,
      value: metric.value,
      route: this.currentRoute,
    });

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        const ok = navigator.sendBeacon(this.endpoint, blob);
        if (ok) return;
      }
      // Fallback: fetch with keepalive so it survives navigation.
      void fetch(this.endpoint, {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {
        /* silent: RUM must not disrupt UX */
      });
    } catch {
      /* silent: RUM must not disrupt UX */
    }
  }
}
