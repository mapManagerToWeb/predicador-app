# Implementation Plan — Production Quality Hardening

**Branch:** `chore/production-quality-hardening`
**Base:** `hotfix/big-archives`
**Date:** 2026-07-29

## Phase A — Audit & Baseline ✅

### Completed
- [x] Created working branch from `hotfix/big-archives`
- [x] Verified all existing tests pass (FE: 75, BE: 92)
- [x] Verified production build succeeds
- [x] Documented current architecture in `docs/architecture-baseline.md`
- [x] Created 4 ADRs in `docs/adr/`:
  - ADR-001: Observability Stack Selection
  - ADR-002: Prometheus Endpoint Security
  - ADR-003: RUM Architecture
  - ADR-004: MapRenderingService Decomposition
- [x] Updated Vitest coverage thresholds from 20% to 80% (lines/statements/functions) and 75% (branches)

### Version Matrix (verified)
| Component | Version | Compatible |
|---|---|---|
| Spring Boot | 4.0.0 | ✅ Already on latest |
| Spring Cloud | 2025.1.0 | ✅ Compatible with Boot 4 |
| SpringDoc | 2.8.6 | ✅ Compatible with Boot 4 |
| Java | 21 LTS | ✅ |
| Angular | 22.0.x | ✅ |
| TypeScript | 6.0.x | ✅ |
| Vitest | 4.1.x | ✅ |

## Phase B — Security & RUM ✅

### Completed
- [x] **ActuatorAccessFilter** — blocks `/actuator/**` at gateway level (allows only `/actuator/health`)
- [x] **RumController hardened**:
  - Explicit allowlist: LCP, INP, CLS, FCP, TTFB
  - Route allowlist with "unknown" fallback
  - NaN/Infinity rejection
  - Value capping per metric type
  - Body size limit (1 KB)
  - Route sanitization with dynamic segment collapse
- [x] **RUM rate limiting** — 30 req/min per IP in gateway RateLimitFilter
- [x] **RumService refactored**:
  - `start()` strictly idempotent (boolean guard)
  - `normalizeRoute` extracted as pure exported function
  - Router subscription uses `takeUntilDestroyed(destroyRef)`
- [x] **Tests added**: 23 RumController tests, 9 normalizeRoute/RumService tests

## Phase C — Map Service Split ✅

### Completed
- [x] **MapEngineService** (~50 lines) — L.Map lifecycle
- [x] **MapTileLayerService** (~90 lines) — tiles, satellite, theme MutationObserver
- [x] **MapTerritoryLayerService** (~250 lines) — GeoJSON, layers, indices, labels
- [x] **MapStyleService** (~130 lines) — styles, rAF batching, pure functions
- [x] **MapCaptureService** (~120 lines) — screenshot prep/restore
- [x] **MapPartialDrawService** (~140 lines) — partial points, markers, clipping
- [x] **MapRenderingFacade** (~200 lines) — backward-compatible coordinator
- [x] **Consumers migrated**: MapSelectionService, MapPartialMarkService, MapInitializationService, MapDataPersistenceService, MapPage

### Architecture
```
features/map/services/
├── map-engine.service.ts          (L.Map lifecycle)
├── map-tile-layer.service.ts      (tiles, satellite, theme)
├── map-territory-layer.service.ts (GeoJSON, layers, indices)
├── map-style.service.ts           (styles, rAF batching)
├── map-capture.service.ts         (screenshot prep/restore)
├── map-partial-draw.service.ts    (partial points, clipping)
├── map-rendering.facade.ts        (backward-compat coordinator)
├── map-state.service.ts           (UI signals — unchanged)
├── map-selection.service.ts       (uses facade)
├── map-interaction.service.ts     (uses facade)
├── map-initialization.service.ts  (uses facade)
└── map-data-persistence.service.ts(uses facade)
```

## Phase D — Backend Hardening ✅

### Completed
- [x] Verified all beans use constructor injection (no @Autowired field injection)
- [x] Added ProblemDetail error responses for all controllers:
  - AuthController: RFC 7807 for 401 auth failures
  - EncargadoController: RFC 7807 for 400 bad request and 404 not found
  - ReportController: RFC 7807 for empty report list
  - GlobalExceptionHandler: added `IllegalStateException` handler for 503
- [x] Added business metrics (Micrometer):
  - `territory.geojson.load.duration` — GeoJSON generation timer
  - `report.persistence.duration` — report save timer
  - `whatsapp.send.total/success/failure` — WhatsApp delivery counters
  - `whatsapp.send.duration` — WhatsApp send timer
  - `spring.cache.metrics.enabled: true` — Caffeine cache hit/miss metrics
- [x] Verified Flyway migrations are valid (index-only, no DDL conflicts with PostGIS)
- Testcontainers integration tests: deferred (requires PostGIS Testcontainer + H2 geometry workaround)

## Phase E — Observability ✅

### Completed
- [x] Prometheus alert rules in `observability/prometheus/rules/alerts.yml`:
  - Service health: ServiceDown, HighErrorRate, HighLatencyP95
  - Circuit breaker: CircuitBreakerOpen
  - JVM/GC: HighHeapUsage, FrequentFullGC
  - Business: WhatsAppSendFailureRateHigh, RUMIngestionStalled
  - Infrastructure: DataSourceConnectionPoolExhausted, PrometheusTargetDown
- [x] Updated Grafana dashboard with new panels:
  - Circuit breaker failure rate
  - WhatsApp sends/min, P95 send duration
  - Report persistence P95 duration
  - GC pause time, JVM threads live
  - Cache hits vs misses
  - GeoJSON load P95 duration
  - HikariCP active/max connections
- [x] Configured OTel Spring profiles for all services:
  - `observability` — enables OTLP trace export
  - `prod` — conservative 10% sampling, stricter health
- [x] Trace propagation smoke test at `tests/trace-propagation-smoke.sh`

## Phase F — QA & CI/CD ✅

### Completed
- [x] JaCoCo added to backend POM as `coverage` profile (`mvn verify -Pcoverage`)
- [x] GitHub Actions workflows:
  - `ci-frontend.yml` — lint, type-check, test, build (Node 22)
  - `ci-backend.yml` — build, test with Testcontainers PostgreSQL (Java 21)
  - `security.yml` — Gitleaks, OWASP dependency-check, Trivy Docker scan
  - `docker.yml` — multi-service Docker build & push to GHCR
- [x] Dependabot configuration for npm, Maven, and GitHub Actions
- [x] Lighthouse CI configuration at `predicador-frontend/lighthouserc.json`
- [x] k6 load test script at `tests/load/api-gateway.js`
