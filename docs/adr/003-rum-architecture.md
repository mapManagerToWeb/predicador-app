# ADR-003: Real User Monitoring (RUM) Architecture

**Date:** 2026-07-29
**Status:** Accepted
**Deciders:** Staff Engineer

## Context

Core Web Vitals (LCP, INP, CLS, FCP, TTFB) need to be collected from real users and exposed as Prometheus metrics for Grafana dashboards. The endpoint must be public (pre-login) but protected against abuse.

## Architecture

```
Browser (web-vitals) → sendBeacon/fetch → POST /api/v1/rum
    → RumController → Micrometer Timer/Summary → Prometheus scrape
```

### Frontend (rum.ts)
- Uses `web-vitals` library (onLCP, onINP, onCLS, onFCP, onTTFB)
- Reports via `navigator.sendBeacon()` with `fetch()` fallback
- Tags each metric with current route (normalized, max 40 chars)
- No-op on SSR (server context has no PerformanceObserver)
- Service is idempotent — safe to call `start()` multiple times

### Backend (RumController.java)
- Record `RumMetric(name, value, route)` with Bean Validation
- Metric name must be in allowlist: LCP, INP, CLS, FCP, TTFB
- Unknown names silently dropped (no meter created)
- Route sanitized: max 40 chars, special chars replaced with `_`
- CLS uses DistributionSummary (unitless), others use Timer (ms)

### Protection
- **Cardinality**: Route normalization collapses `/territories/123` → `/territories/:id`
- **Cardinality**: Max route length 40 chars prevents label explosion
- **Cardinality**: Unknown metric names dropped (no meter created)
- **Validation**: Rejects blank names, negative values
- **Rate limiting**: Inherited from gateway Bucket4j rate limiter

## Metrics Produced

| Metric | Type | Tags | Description |
|---|---|---|---|
| `web.vitals` | Timer | metric, route | LCP, INP, FCP, TTFB timing |
| `web.vitals.cls` | Summary | route | CLS layout shift score |

## Consequences

### Positive
- Zero-config metric collection from real browsers
- Route-based breakdown enables per-page performance analysis
- sendBeacon survives page unload (LCP often fires on visibilitychange)

### Negative
- No user-level attribution (by design — privacy)
- No geographic breakdown (could add via GeoIP if needed later)
- Browser support: sendBeacon not available in very old browsers (graceful fallback)
