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

## Phase D — Backend Hardening (Pending)

### Planned
- [ ] Verify all beans use constructor injection (no @Autowired field injection)
- [ ] Add ProblemDetail error responses for all controllers
- [ ] Add business metrics (Micrometer): territory.geojson.load.duration, report.persistence.duration, whatsapp.send.total/success/failure, cache.hit/miss
- [ ] Verify Flyway migrations are valid with PostGIS
- [ ] Add Testcontainers integration tests with real PostgreSQL

## Phase E — Observability (Pending)

### Planned
- [ ] Add Prometheus alert rules in `observability/prometheus/rules/`
- [ ] Update Grafana dashboard with WhatsApp, cache, GC, circuit breaker panels
- [ ] Configure OTel profiles (local, test, observability, prod)
- [ ] Add trace propagation smoke test

## Phase F — QA & CI/CD (Pending)

### Planned
- [ ] Add JaCoCo to backend Maven
- [ ] Create GitHub Actions workflows (ci-frontend, ci-backend, security, e2e, docker)
- [ ] Add Dependabot configuration
- [ ] Add OWASP Dependency-Check
- [ ] Add Gitleaks for secret detection
- [ ] Add Trivy for Docker image scanning
- [ ] Configure Lighthouse CI
- [ ] Create k6 load test scripts
