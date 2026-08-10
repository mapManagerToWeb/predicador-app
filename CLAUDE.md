# CLAUDE.md

Predicador: territory tracking and reporting for door-to-door ministry. Angular 22 SSR/PWA frontend + Spring Boot microservices backend, sharing one PostgreSQL/PostGIS database.

## Layout

```
backend/              Maven reactor (Java 25, Spring Boot 4.0.0, Spring Cloud 2025.1.0)
  shared/             HMAC session security + global exception handler (jar, no app class)
  config-server/      Spring Cloud Config, native profile           :8888
  discovery-server/   Eureka                                        :8761
  api-gateway/        Spring Cloud Gateway (WebFlux), auth, CSRF    :8080 (mgmt :8090)
  territory-service/  Territories/manzanas GeoJSON, PostGIS         :8081 (mgmt :8091)
  reporting-service/  Reports, encargados, WhatsApp delivery, RUM   :8082 (mgmt :8092)
predicador-frontend/  Angular 22 SSR/PWA (see its own AGENTS.md)
observability/        Prometheus, Grafana, OTel collector configs (opt-in)
docs/                 ADRs, audit reports, superpowers plans/specs
tests/                k6 load test, trace-propagation smoke script
```

`AGENTS.md` (root and `predicador-frontend/`) carries the same guidance for other agent tools; keep the three consistent when rules change.

## Commands

**Backend** — run from `backend/`:
- `mvn verify -B` — full build + tests (CI uses Java 25)
- `mvn -pl <module> test` — focused module tests
- `mvn verify -Pcoverage` — JaCoCo reports (40% line/instruction minimum)

**Frontend** — run from `predicador-frontend/`:
- `pnpm install` then `pnpm start` (dev server :4200, proxies `/api` → :8080)
- `pnpm run lint` / `pnpm run lint:fix`
- `pnpm test` (Vitest run) / `pnpm run test:watch` / `pnpm run test:coverage`
- `pnpm test -- src/path/to/file.spec.ts` — single spec
- `pnpm run build` — production build (includes SSR + service worker)

**Docker**: copy `.env.example` → `.env`, then `docker-compose up --build`. Observability is opt-in: `docker-compose --profile observability up -d`.

## Runtime & configuration

Local startup order: `config-server` → `discovery-server` → `api-gateway` → `territory-service` → `reporting-service`.

- Compose fails fast (`:?` interpolation) unless `.env` sets `SESSION_SECRET`, `ADMIN_USERNAME`, and (non-local) `ADMIN_PASSWORD_BCRYPT`. Generate with `openssl rand -hex 32` and `htpasswd -bnBC 10 "" '<pass>' | tr -d ':\n'`.
- `SESSION_SECRET` must be identical across gateway, territory, and reporting — the HMAC tokens are only interoperable if it is.
- Auth is strict outside the `local` profile: startup throws unless the secret is ≥32 bytes and `ADMIN_PASSWORD_BCRYPT` is set. Enforcement soft-disables only when the secret is empty AND the profile is non-strict/local.
- `config-server` serves config from its classpath (`native` profile). Don't repoint its `SPRING_PROFILES_ACTIVE` — it will try to clone a git repo with no URI.
- Config lives at `backend/config-server/src/main/resources/config/{api-gateway,territory-service,reporting-service}.yml`. Territory and reporting import it via `spring.config.import`; the gateway has local defaults.
- `.env` and application-local config are gitignored and must not be committed.

## Security model

`shared/` owns it. `SessionTokenService` mints `base64url(subject|role|iat|exp).base64url(HMAC-SHA256)` — deliberately not JWT (no algorithm negotiation). Verification uses `MessageDigest.isEqual`; all failures collapse to `Optional.empty()`. Roles: `admin`, `encargado`. Default TTL 12h.

`SessionAuthFilter` (order `-100`, `/api/v1/*`) matches rules of (methods, path regex, required role) and reads the HttpOnly `predicador_session` cookie; `X-Session-Token` only when `allowHeaderAuth`. Failures return 401 `application/problem+json`.

- Public: all territory GETs, `POST /encargados/login`, `/encargados/buscar-crear`, `POST /encargados`, `POST /api/v1/rum`.
- Protected: `PUT /territories/{n}/color` (admin only); all `/reports` endpoints and most `/encargados` endpoints (any role).

The gateway adds `CsrfProtectionFilter` (stateless double-submit; it is the sole owner of the readable `XSRF-TOKEN` cookie, header `X-XSRF-TOKEN`, bootstrap `GET /api/v1/auth/csrf`), `RateLimitFilter` (auth 6/min, register 20/min, RUM 30/min), `SecurityHeadersFilter`, and Resilience4j circuit breakers over `lb://` routes.

## Database

Both services share one Postgres DB with `ddl-auto: none` and separate Flyway histories.

- `territory-service`: Flyway **enabled**, history table `flyway_schema_history_territory`. Tables `manzanas_territorio` (`geometry(GeometryZ,4326)`, hibernate-spatial + native `ST_AsGeoJSON` queries) and `territory_settings`.
- `reporting-service`: Flyway **disabled**. Its `db/migration/*.sql` files do NOT run at startup and must be applied manually — a new migration there will silently do nothing. Tables: `registro_predicacion`, `encargados`, `whatsapp_delivery_idempotency`.

Schema changes always go in a new migration; never edit one that has been applied.

## WhatsApp async sends (reporting-service)

`POST /api/v1/reports/whatsapp/async` (auth + mandatory `Idempotency-Key`) → `WhatsAppSendPublisher` → durable direct exchange `whatsapp.send.exchange` / queue `whatsapp.send.queue` / routing key `whatsapp.send` → `WhatsAppSendListener` → `WhatsAppSendService` → Meta Graph API. Responds 202 `IN_PROGRESS`; clients poll `GET /api/v1/reports/send/{idempotencyKey}`. Broker settings come only from env (`SPRING_RABBITMQ_HOST`), not from any yml.

## Frontend notes

Angular 22, **zoneless**, standalone components, all routes lazy. State is plain signals in `providedIn: 'root'` services — no NgRx and no `AppStore`. HTTP is `HttpClient` + `firstValueFrom`; `httpResource`/`resource`/`linkedSignal` are not used anywhere.

- Interceptor order in `app.config.ts` is load-bearing: `authInterceptor` → `errorInterceptor` → `csrfInterceptor` (CSRF innermost so it can refresh and retry a 403 before the error interceptor sees it).
- SSR guarding uses `afterNextRender()`, not `isPlatformBrowser`/`PLATFORM_ID`. Leaflet is imported statically in `map.ts` and the map services; `html2canvas` is dynamically imported in `map-report.service.ts`.
- The map feature is split into ~13 single-responsibility services under `features/map/services/` (engine, tile layer, territory layer, selection, partial draw, capture, style, …). Put new map behavior in one of these, not in `MapPage`.
- Vitest + jsdom, `src/test-setup.ts`, co-located `*.spec.ts`. Coverage thresholds are low (lines/statements/functions 30, branches 20) — don't read passing coverage as good coverage.
- ESLint: `no-floating-promises` is an error (hence `void router.navigate(...)`), `no-explicit-any` and `no-console` are warnings. Prettier is enforced.

## Gotchas

- **Frontend uses pnpm exclusively.** `package.json` pins `packageManager: pnpm@9.15.0` (Corepack), `angular.json` declares `cli.packageManager: "pnpm"`, `.github/workflows/ci-frontend.yml` runs `pnpm install --frozen-lockfile` (pnpm 9 has no `pnpm ci`), and `pnpm-lock.yaml` is the only committed lockfile (`package-lock.json` was removed). Never use npm for frontend commands.
- **`docs/ARCHITECTURE.md` in the frontend is aspirational, not descriptive.** It prescribes Clean Architecture layers, repositories, use cases, and a `shared/` folder — none of which exist. Read it as a proposal; read the code for reality.
- `whatsapp-simulation/` sits at `src/app/` top level rather than under `features/`, has no spec, and is missing from `app.routes.server.ts` (it falls through to `**`).
- `Reporte` is declared twice: `core/models/models.ts` and `features/map/types/map.types.ts`.
- `admin.guard.ts` currently returns `true` unconditionally — a documented placeholder, not real protection.
- Only `PostgisIntegrationTest` uses Testcontainers (gated on `-Ddocker.available=true`); other integration tests are Docker-free MockMvc/WebTestClient. Unit tests run on H2 in PostgreSQL mode.
- Never treat `target/`, `dist/`, `coverage/`, or `.scannerwork/` as source.
