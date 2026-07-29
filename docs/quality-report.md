# Quality Report — Production Quality Hardening

**Date:** 2026-07-29
**Branch:** `chore/production-quality-hardening`

## Changes Applied

### Phase A: Documentation & Baseline
| Change | Status |
|---|---|
| Architecture baseline document | ✅ `docs/architecture-baseline.md` |
| ADR-001: Observability Stack | ✅ `docs/adr/001-observability-stack.md` |
| ADR-002: Prometheus Security | ✅ `docs/adr/002-prometheus-security.md` |
| ADR-003: RUM Architecture | ✅ `docs/adr/003-rum-architecture.md` |
| ADR-004: Map Service Split | ✅ `docs/adr/004-map-service-split.md` |
| Coverage thresholds raised to 80% | ✅ `vitest.config.ts` |

### Phase B: Security & RUM
| Change | Status |
|---|---|
| ActuatorAccessFilter (gateway) | ✅ Blocks /actuator/** except /actuator/health |
| RumController allowlist | ✅ LCP, INP, CLS, FCP, TTFB only |
| RumController route allowlist | ✅ Known routes only, "unknown" fallback |
| NaN/Infinity rejection | ✅ Double.isFinite() check |
| Value capping | ✅ Per-metric max thresholds |
| RUM rate limiting | ✅ 30 req/min per IP in gateway |
| RumService idempotent start | ✅ Boolean guard |
| normalizeRoute pure function | ✅ Exported for unit testing |
| RumService DestroyRef cleanup | ✅ takeUntilDestroyed pattern |

### Phase C: Map Service Split
| Service | Lines | Responsibility |
|---|---|---|
| MapEngineService | ~50 | L.Map lifecycle |
| MapTileLayerService | ~90 | Tiles, satellite, theme |
| MapTerritoryLayerService | ~250 | GeoJSON, layers, indices |
| MapStyleService | ~130 | Styles, rAF batching |
| MapCaptureService | ~120 | Screenshot prep/restore |
| MapPartialDrawService | ~140 | Partial points, clipping |
| MapRenderingFacade | ~200 | Backward-compat coordinator |
| **Total** | **~980** | **Split from 921-line monolith** |

## Test Results

### Frontend (Vitest)
```
Test Files  12 passed (12)
Tests       81 passed (81)
Duration    1.66s
```

### Backend (Maven)
```
Tests run: 91, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

### Build
```
Frontend: Application bundle generation complete
Backend: BUILD SUCCESS
```

## Security Results

### Vulnerabilities Fixed
- `/actuator/prometheus` now blocked at gateway (defense-in-depth)
- `/actuator/env`, `/actuator/heapdump`, etc. blocked
- RUM endpoint hardened against cardinality explosion
- RUM rate limiting prevents abuse

### Remaining Risks
- No OWASP Dependency-Check in CI yet
- No Gitleaks secret scanning in CI yet
- No Trivy Docker image scanning in CI yet
- Admin credentials default to admin/admin in docker-compose

## Coverage

### Frontend
- **Threshold**: 80% lines/statements/functions, 75% branches
- **Current**: Coverage report generation configured, actual % TBD after full test run

### Backend
- **No JaCoCo configured yet** — planned for Phase F

## Compatibility

### Spring Boot 4.0.0
- ✅ Already on latest stable
- ✅ Spring Cloud 2025.1.0 compatible
- ✅ SpringDoc 2.8.6 compatible
- ✅ No migration needed

### Java 21
- ✅ Virtual threads enabled (benefit unverified under load)
- ✅ LTS version

## Risks & Tech Debt

### Resolved
- MapRenderingService monolith → split into 7 focused services
- RUM endpoint exposed to cardinality attacks → allowlisted and rate-limited
- Actuator endpoints publicly accessible → gateway-level blocking

### Pending
| Risk | Severity | Phase |
|---|---|---|
| No CI/CD pipeline | High | F |
| No E2E tests | High | F |
| ddl-auto: update in production | Medium | D |
| H2 in tests (not PostGIS) | Medium | D |
| No idempotency key for WhatsApp | Medium | D |
| No business metrics (Micrometer) | Medium | D |
| No Prometheus alert rules | Medium | E |
| No Grafana dashboard updates | Medium | E |
| No Dependabot/Renovate | Medium | F |
| Virtual threads benefit unverified | Low | D |

## Manual Deployment Steps

1. Ensure PostgreSQL with PostGIS extension is running
2. Set environment variables:
   - `SESSION_SECRET` (>= 32 bytes entropy)
   - `DB_PASSWORD`
   - `WHATSAPP_ACCESS_TOKEN`
   - `ADMIN_PASSWORD_BCRYPT` (production)
3. Run `docker compose --profile observability up -d`
4. Verify Prometheus scrapes all services at `localhost:9090/targets`
5. Verify Grafana dashboards at `localhost:3000`
6. Verify `/actuator/prometheus` returns 403 from outside the docker network
