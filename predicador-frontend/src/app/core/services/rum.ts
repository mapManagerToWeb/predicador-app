import { Injectable, inject } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { environment } from '../../../environments/environment';

/**
 * Real User Monitoring (RUM): captures Core Web Vitals in the browser and
 * ships them to the backend {@code /api/v1/rum} sink, which converts them
 * into Prometheus metrics.
 *
 * <p>Uses {@code navigator.sendBeacon} so the report survives page unload
 * (LCP is often reported on {@code visibilitychange = hidden}). Falls back
 * to {@code fetch(..., { keepalive: true })} when sendBeacon is unavailable
 * or refuses the payload (e.g. sync XHR blocked in some browsers).</p>
 *
 * <p>The service is a no-op on the server (SSR) since {@code web-vitals}
 * touches {@code PerformanceObserver} which only exists in the browser.</p>
 */
@Injectable({ providedIn: 'root' })
export class RumService {
  private router = inject(Router);
  private endpoint = `${environment.apiUrl}/rum`;
  private currentRoute = '/';

  /**
   * Called once from {@code app.config.ts} or an APP_INITIALIZER. Idempotent
   * even if invoked twice by mistake; web-vitals debounces its own callbacks.
   */
  start(): void {
    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
      return;
    }

    // Track the current route so we can tag each metric with it. This lets
    // the Grafana panels break LCP/INP down by /map vs /profile vs /login.
    this.currentRoute = this.normalizeRoute(window.location.pathname);
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.currentRoute = this.normalizeRoute(event.urlAfterRedirects);
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

  /**
   * Collapse path segments that look like IDs so we do not blow the label
   * cardinality on the Prometheus side. {@code /territories/123/color} →
   * {@code /territories/:id/color}.
   */
  private normalizeRoute(path: string): string {
    return path
      .replace(/\?.*$/, '')
      .replace(/\/\d+(?=\/|$)/g, '/:id')
      .slice(0, 40);
  }
}
