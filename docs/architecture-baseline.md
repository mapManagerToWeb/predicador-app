# Architecture Baseline — Predicador App

**Date:** 2026-07-29
**Branch:** hotfix/big-archives
**Status:** Current

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | Angular | 22.0.x |
| Language | TypeScript | 6.0.x |
| Testing (FE) | Vitest | 4.1.x |
| Mapping | Leaflet | 1.9.4 |
| SSR | Angular SSR + Express | 5.1.x |
| PWA | Angular Service Worker (ngsw) | — |
| Backend | Spring Boot | 4.0.0 |
| Language (BE) | Java | 21 LTS |
| Cloud | Spring Cloud | 2025.1.0 |
| API Gateway | Spring Cloud Gateway (WebFlux) | — |
| Discovery | Netflix Eureka | — |
| Config | Spring Cloud Config Server (Native) | — |
| Database | PostgreSQL + PostGIS | — |
| ORM | Hibernate Spatial (JPA) | — |
| Migrations | Flyway | — |
| Caching | Caffeine + Spring Cache | — |
| Rate Limiting | Bucket4j | 8.10.1 |
| Circuit Breaker | Resilience4j | — |
| Observability | OpenTelemetry + Micrometer + Prometheus | OTel 1.64.0 |
| Tracing | Jaeger | 1.76.0 |
| Dashboards | Grafana | 11.3.0 |
| API Docs | SpringDoc OpenAPI | 2.8.6 |
| Logging | Logstash Logback Encoder | 8.0 |
| Build | Maven | 3.9 |
| Containers | Docker + Docker Compose | — |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Angular 22 SPA (PWA)                 │
│  Signals, Zoneless, Leaflet, SSR, Service Worker        │
│  Vitest, Playwright (planned)                           │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP/HTTPS
┌──────────────────────▼──────────────────────────────────┐
│              Spring Cloud Gateway (WebFlux)              │
│  Bucket4j rate limiting, Resilience4j circuit breakers  │
│  Session auth filter, CORS, security headers            │
└───────┬──────────────┬──────────────────┬──────────────┘
        │              │                  │
┌───────▼──────┐ ┌─────▼────────┐ ┌──────▼──────────────┐
│  territory-  │ │  reporting-  │ │   config-server     │
│  service     │ │  service     │ │   (Native profile)  │
│  (8081)      │ │  (8082)      │ │   (8888)            │
│  PostGIS     │ │  WhatsApp    │ │                     │
│  Flyway      │ │  Flyway      │ │                     │
│  Caffeine    │ │  H2 (test)   │ │                     │
└───────┬──────┘ └──────┬───────┘ └─────────────────────┘
        │               │
┌───────▼───────────────▼──────┐
│   PostgreSQL + PostGIS       │
│   (shared database)          │
└──────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│              Observability Stack (opt-in profile)         │
│  Prometheus (9090) · Grafana (3000) · Jaeger (16686)    │
│  OpenTelemetry Collector (4317/4318)                     │
└──────────────────────────────────────────────────────────┘
```

## Microservices

### api-gateway (port 8080)
- Spring Cloud Gateway (WebFlux/Netty)
- Bucket4j rate limiting per IP/session
- Resilience4j circuit breakers (territoryCB, reportingCB)
- Session-based auth filter
- CORS configuration
- Exposes: health, info, gateway, circuitbreakers, metrics, prometheus

### territory-service (port 8081)
- Spring MVC (Tomcat) with virtual threads
- JPA + Hibernate Spatial + PostGIS
- Flyway migrations (baseline-on-migrate)
- Caffeine caching
- Eureka client + Spring Cloud Config
- Exposes: health, info, metrics, prometheus

### reporting-service (port 8082)
- Spring MVC (Tomcat) with virtual threads
- JPA + Flyway
- WhatsApp API integration (Meta Graph API v21.0)
- RUM metrics endpoint (POST /api/v1/rum)
- Eureka client + Spring Cloud Config
- Exposes: health, info, metrics, prometheus

### config-server (port 8888)
- Spring Cloud Config Server (Native profile)
- File-based configuration in classpath:/config

### discovery-server (port 8761)
- Netflix Eureka Server
- Self-preservation enabled

## Frontend Structure

```
src/app/
├── core/
│   ├── guards/          (profileGuard, adminGuard)
│   ├── interceptors/    (auth, error)
│   ├── models/          (UserProfile, Reporte, etc.)
│   └── services/        (Profile, TerritorioService, Toast, WhatsApp, etc.)
├── features/
│   ├── auth/login/
│   ├── map/             (MapPage + services/ subdirectory)
│   │   ├── services/    (MapRenderingService, MapStateService, etc.)
│   │   ├── utils/       (map-constants, territory-colors, report-utils)
│   │   └── types/       (map.types.ts)
│   ├── admin/
│   └── profile/
└── shared/
    └── components/      (avatar-selector, screenshot-modal, toast)
```

## Key Metrics

| Metric | Value |
|---|---|
| Frontend tests | 75 passing |
| Backend tests | 92 passing |
| Frontend bundle (main) | ~250 kB (map chunk) |
| MapRenderingService | 921 lines (monolith, refactoring target) |
| ADRs | 0 (this baseline creates 4) |
| CI/CD | None configured |
| Coverage thresholds | 20% (FE Vitest) |

## Security Posture

### Current State
- **Actuator endpoints**: health, info, metrics, prometheus exposed on all services
- **Prometheus access**: `unrestricted` on all services — **needs hardening**
- **No network-level isolation** for /actuator/prometheus
- **Admin credentials**: fallback defaults (admin/admin) in docker-compose
- **Secrets**: SESSION_SECRET, DB_PASSWORD, WHATSAPP_ACCESS_TOKEN via env vars (not hardcoded)
- **No Dependabot/Renovate** configured
- **No OWASP/Gitleaks/Trivy** in pipeline
- **No CI/CD pipeline** exists

### RUM Endpoint
- POST /api/v1/rum accepts LCP, INP, CLS, FCP, TTFB
- Route sanitization in place (regex cleanup, max 40 chars)
- Unknown metric names silently dropped
- No rate limiting specific to RUM (inherits gateway rate limit)
- No body size limit on RUM endpoint specifically

## Known Technical Debt

1. **MapRenderingService** (921 lines) — monolithic service handling map init, tiles, territories, styles, capture, partial drawing, clipping, markers, labels, and extra layers
2. **ddl-auto: update** in production — should migrate to validate with baseline SQL
3. **H2 in tests** — not testing against real PostgreSQL/PostGIS
4. **No Testcontainers** — integration tests don't use real databases
5. **No E2E tests** — no Playwright or Cypress
6. **No CI/CD** — no GitHub Actions workflows
7. **Virtual threads enabled unconditionally** — should verify benefit under load
8. **No ProblemDetail** — error responses may expose internal details
9. **No idempotency key** for WhatsApp sends
10. **No Flyway baseline SQL** — schema managed by Hibernate

## Compatibility Notes

- Spring Boot 4.0.0 is already in use with Spring Cloud 2025.1.0
- SpringDoc OpenAPI 2.8.6 is compatible with Spring Boot 4
- No version migration needed at this time — the stack is already on latest stable
- Java 21 LTS is correct; virtual threads enabled but benefit unverified for I/O patterns
