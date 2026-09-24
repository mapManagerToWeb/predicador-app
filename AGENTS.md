# Repository Instructions

> Last verified: 2026-09-24. Whenever a fact here disagrees with the code, the code wins — fix this file.

## Codebase Memory (Knowledge Graph)

The repository is indexed into the codebase-memory knowledge graph under the project name **`predicador-app`** (indexed 2026-08-09).

- Prefer graph tools over grep/glob for code discovery (see the global `codebase-memory-mcp` instructions in `~/.config/opencode/AGENTS.md`).
- **Interactive graph UI**: `http://127.0.0.1:9749/` — the codebase-memory-mcp server exposes a persisted graph visualization on port 9749. Start it with `codebase-memory-mcp` (the MCP server auto-starts the UI when running). Use `lsof -nP -iTCP:9749` to check if it is up.
- After significant refactors or new features, refresh the index with `index_repository` (project name `predicador-app`, root is the repo root).

### Key graph facts (from `get_architecture`, 2026-08-09 index; counts from that index — refresh with `index_repository` after significant refactors)

- **Security hot path** lives in `backend/shared`: `SessionTokenService.verify` (41 callers), `TokenValidator.validate` (22), `SessionTokenService.issue` (19), `SessionAuthFilter` + its `Rule.any` (18). Shared is the architectural core (`reporting-service → shared` 89 calls, `api-gateway → reporting-service` 24) — treat changes here as high-risk.
- **Reporting owns WhatsApp**: `WhatsAppMessageClient.sendTemplateMessage` (15 callers), `WhatsAppSendService.getStatus` (19), `WhatsAppDelivery.getStatusCode` (23).
- **Frontend** is highly cohesive (~0.98–0.99) around `map-geometry.ts` (`snapToContour`, `pointInPolygon`, `projectOnSegment`) and `map-style.service.ts`, plus `profile.ProfilePage.save`.
- **Routes** (52 total): `/api/v1/territories*`, `/api/v1/encargados*`, `/api/v1/reports*`, `/api/v1/rum`; gateway has `/fallback/territory` and `/fallback/reporting` fallbacks.
- **ADRs**: `docs/adr/` holds versioned architecture decision records (0001–0005). The rest of `docs/` (`audit/`, `superpowers/`) is local-only and gitignored — along with `tasks/`, `CAPABILITY-MAP.md`, and `SPEC-map-*.md` — so only `docs/adr/` is tracked. Record new decisions under `docs/adr/` when they are made.

## Layout

- `backend/` is a Maven reactor (Java 25, Spring Boot **4.1.1** parent, Spring Cloud **2025.1.3**) with modules `shared`, `config-server`, `discovery-server`, `api-gateway`, `territory-service`, `reporting-service`; run Maven commands from this directory.
- `territory-frontend/` is a separate Angular 22 SSR/PWA app (note: the directory is `territory-frontend/`, not `predicador-frontend/`).
- `docker-compose.yml` builds the five backend services **plus a `imresamu/postgis:18-3.6` database and a `rabbitmq:4.3.4-management` broker** (territory and reporting depend on it; WhatsApp async sends flow through it via `publisher`/`listener`). Observability services (`otel-collector`, `jaeger`, `prometheus`, `grafana`) are opt-in via the `observability` profile.
- **Documentation**: `README.md` is the architecture overview (stack + diagram). `docs/audit/` has the Angular audit; `docs/superpowers/` stores past plans/specs; `openspec/` is the SDD workflow (`changes/` + `changes/archive/` + `specs/`); root `CAPABILITY-MAP.md` and `SPEC-map-*.md` are planning docs for the map geometry/rendering/hit-testing pipeline; `tasks/` holds current plan/todo; `tests/` has load (`api-gateway.js`) and smoke scripts.
- `backend/shared/` is the cross-service core: `security/` (HMAC tokens, `SessionAuthFilter`, `TokenValidator`, `SessionTokenService`, `SecurityRule(s)`), `exception/` (`GlobalExceptionHandler`, `ResourceNotFoundException`, `ForbiddenOperationException`), and `util/` (`PhoneUtil` — E.164 handling).

## Verification

- Frontend setup: run `corepack enable` (once) then `pnpm install` in `territory-frontend/` (Node 22 is used by CI). The pnpm version is pinned in `package.json` (`packageManager: pnpm@9.15.0`).
- Frontend checks, in CI order: `pnpm run lint`, then one production build (`pnpm run build`, which also type-checks), then `pnpm test -- --run --coverage`.
- Run one frontend spec with `pnpm test -- src/path/to/file.spec.ts` from `territory-frontend/`; tests use Vitest, jsdom, and `src/test-setup.ts`. Coverage thresholds are low (30/30/30/20 in `vitest.config.ts`) — passing coverage does not mean good coverage.
- **Leaflet is pinned to `1.9.4`** in `package.json` (`leaflet: "1.9.4"`). The Leaflet `2.0.0-alpha.1` upgrade (commit `a534fba`) was reverted by commit `3a0f0ba`; do not assume 2.0-only APIs exist. Before perf work always reinstall with `pnpm install --frozen-lockfile` — a stale `node_modules` is the most common cause of local vs CI divergence.
- Backend full verification: from `backend/`, run `mvn verify -B`; local tests needing the database require PostgreSQL/PostGIS and `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD`.
- Backend focused checks can use `mvn -pl <module> test` from `backend/`; JaCoCo reports are generated with `mvn verify -Pcoverage` (40% line/instruction minimum enforced at verify).
- CI backend uses Java 25 and a `postgis/postgis:16-3.4` service with database `predicador_test` (user `predicador`), plus Testcontainers wired to the job's Docker socket (`TESTCONTAINERS_RYUK_DISABLED=true`).

## CI / Automation (`.github/workflows/`)

- `ci-backend.yml` — backend build/test with PostGIS service; runs `mvn verify -Pcoverage` (which also enforces the jacoco 40% LINE/INSTRUCTION gate) and uploads JaCoCo reports. On `main` pushes it additionally dumps the Neon production DB (`NEON_DATABASE_URL_DIRECT` secret) as an AGE-encrypted backup artifact (30-day retention; public key `.github/backup/age.pub`, decryptor key held by the owner, not in the repo). Backend dependency management overrides Tomcat `11.0.25` / Netty `4.2.17.Final` for the Trivy gate.
- `ci-frontend.yml` — pnpm 9.15.0 + Node 22; `pnpm install --frozen-lockfile --ignore-scripts`; lint → one production build (which also type-checks) → tests with coverage. Branches: `main`, `chore/production-quality-hardening`, `feat/redesign`.
- `docker.yml` — builds/pushes the 5 backend images to GHCR (`ghcr.io/<owner>/predicador-<service>`) on `main` and `v*` tags; PRs build without pushing. Branch pushes and PRs are path-filtered to `backend/**` (+ the workflow file); `v*` tags always build (path filters are not evaluated for tag pushes).
- `security.yml` — gitleaks (secrets), OWASP dependency-check (fails on CVSS ≥ 7, non-blocking), Trivy image scan on all 5 images (HIGH/CRITICAL, `ignore-unfixed`), Semgrep SAST (security-audit + owasp-top-ten + github-actions, uploads an ERROR-severity SARIF and gates on ERROR in one pass). gitleaks and semgrep skip dependabot-triggered runs (GitHub withholds repo secrets from them). Weekly cron Sun 03:00. Local config: `.gitleaks.toml`, `.semgrepignore`, `.trivyignore`.
- `sonarcloud.yml` — CI-based analysis (project key `mapManagerToWeb_predicador-app`): frontend coverage (lcov) + backend `mvn verify -Pcoverage`, then scanner (skips dependabot-triggered runs: no `SONAR_TOKEN` there). Settings in `sonar-project.properties` (Java 25, JaCoCo + lcov report paths).
- `opencode.yml` — triggers the opencode GitHub action when a comment starts with `/oc` or `/opencode` (model `opencode/mimo-v2.5-free`); only `OWNER`/`MEMBER`/`COLLABORATOR` author associations can trigger it (public repo).

## Runtime

- Local backend services must start in this order: `config-server` (`8888`), `discovery-server` (`8761`), `api-gateway` (`8080`), `territory-service` (`8081`), `reporting-service` (`8082`). Management ports: gateway `8090`, territory `8091`, reporting `8092`.
- Frontend dev: `ng serve` in `territory-frontend/` on `4200`, proxying `/api` → `localhost:8080` via `proxy.conf.json` (backend must be running).
- For Docker setup, copy `.env.example` to `.env` before `docker-compose up --build`; `.env` and `application-local.yml` are ignored and must not be committed. Compose fails fast (`:?` interpolation) unless `.env` sets `SESSION_SECRET` and `ADMIN_USERNAME`; the gateway additionally refuses to start outside the `local` profile without `ADMIN_PASSWORD_BCRYPT`.
- `SESSION_SECRET` must be shared by gateway, territory, and reporting services for HMAC token interoperability; use a real secret in deployed environments. Generate with `openssl rand -hex 32`; a BCrypt admin password with `htpasswd -bnBC 10 "" '<pass>' | tr -d ':\n'`.
- Auth is strict by default: outside the `local` profile the gateway and shared security throw at startup unless `SESSION_SECRET` is ≥32 bytes and `ADMIN_PASSWORD_BCRYPT` is set. Enforcement only soft-disables when the secret is empty AND the profile is non-strict/local.
- `config-server` serves config from its classpath (`native` profile, the compose default); don't point its `SPRING_PROFILES_ACTIVE` elsewhere or it will try a git repo with no URI.
- **Production DB is a self-hosted `postgres` container** (`imresamu/postgis:18-3.6`, volume `postgres_data`, port bound to `127.0.0.1:5432`) in `docker-compose.yml`, replacing Neon (ADR 0006). Only `DB_PASSWORD` is required in `.env`; `DB_URL`/`DB_USERNAME` default to the container. The one-shot `db-import` compose service (`scripts/db/import-from-neon.sh`) runs before territory/reporting (`service_completed_successfully`): if the DB is empty and `NEON_URL` is set in `.env`, it copies Neon in a single transaction and verifies row counts; if data already exists it does nothing. Dumps land in the gitignored `backups/`. The Neon-era tuning (HikariCP `minimum-idle: 0`, `management.health.db.enabled: false`, Eureka health on `/actuator/info`, Flyway via `DB_URL_UNPOOLED`; ADR 0003) is still in place but no longer required.
- **RabbitMQ broker** (`rabbitmq:4.3.4-management`, ports `5672`/`15672`, `guest/guest`): territory and reporting depend on it; WhatsApp async send flows via `publisher` → queue → `listener`.
- **WhatsApp (reporting-service, Meta Graph API v21.0)**: configured via `WHATSAPP_PHONE_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE` (default `asignacion_territorio`), `WHATSAPP_DESTINATION`, `WHATSAPP_LANG` (default `es_CL`). Empty by default in `.env.example` — WhatsApp sends are disabled without them.
- Start optional observability with `docker-compose --profile observability up -d` (otel-collector, jaeger, prometheus, grafana); OTLP export is disabled unless the relevant `OTEL_*` variables are set.

## API Gateway routes (`RouteConfig.java` — code, not YAML)

All downstream URIs use `lb://<service>` resolved through Eureka; each route has a Resilience4j circuit breaker with fallback and a retry on GET only. CORS origins come from `app.cors.allowed-origins` (env `CORS_ALLOWED_ORIGINS`).

| Route                             | Downstream        | Notes                                                |
| --------------------------------- | ----------------- | ---------------------------------------------------- |
| `/api/v1/territories/colors`      | territory-service | CB `territoryCB-colors`, 5s timeout                  |
| `/api/v1/territories/all/geojson` | territory-service | CB `territoryCB-geojson`, 30s timeout                |
| `/api/v1/territories/**`          | territory-service | CB `territoryCB-default`, 15s timeout               |
| `/api/v1/reports/**`              | reporting-service | CB `reportingCB`, 20s timeout                       |
| `/api/v1/encargados/**`           | reporting-service | CB `encargadosCB`, 10s timeout                      |
| `/api/v1/rum`                     | reporting-service | Public RUM sink, high volume, no retries, CB `rumCB`, 5s timeout |

Fallbacks: `forward:/fallback/territory` and `forward:/fallback/reporting`. CORS allows `X-XSRF-TOKEN` and `Idempotency-Key` headers; exposes `ETag`, `Location`; credentials allowed.

## Frontend Conventions & Patterns

### Scaffolding & Architecture

- Feature-based structure under `territory-frontend/src/app/`:
  - `core/` — Cross-cutting singleton services (Profile, TerritorioService, Toast, EncargadoService, ReportCacheService, AuthTokenService, AuthService, CsrfTokenService, RumService), guards (`profileGuard`, `adminGuard`), interceptors (`auth`, `csrf`, `error`), models. There is no `shared/` directory; the toast lives in `core/services/toast.ts`.
  - `features/` — Standalone lazy-loaded page components (auth/login, map, profile, admin). Feature-exclusive services live inside their feature: `features/map/services/` holds the map engine services plus `whatsapp.ts` (only used by map reporting).
  - `features/admin/` — desktop admin panel (ADR 0007). `admin.ts` is the shell (own login + sidebar, `ViewEncapsulation.None`: its stylesheet holds the shared `.adm-*` UI kit and `.viz-*` chart styles); child routes in `admin.routes.ts` (`resumen`, `territorios`, `encargados`, `reportes`). `services/admin-api.ts` (all calls send `ngsw-bypass`), `services/admin-store.ts` (shared signals), `services/admin-ui.ts` (confirm dialog), `utils/analytics.ts` (pure analytics, tested), `charts/` (hand-rolled SVG/HTML charts, no chart library), `map/` (MapLibre + terra-draw, loaded on demand).
  - **Known layering debt (do not extend)**: `core/services/map-draft.ts` is map-only but lives in core and imports types from `features/map/types/map.types` (inverted core→feature dependency); `features/admin/pages/territorios/territorios.ts` imports `TERRITORY_COLORS` from `features/map/utils/territory-colors` (feature→feature). Planned: move draft storage into the map feature and promote `TERRITORY_COLORS` to `core/models/`.
- Selector prefixes: Component `app-` (kebab-case), Directive `app` (camelCase).
- Standalone components (no NgModule).
- Route guards: `canActivate: [profileGuard]` protects `/map`; `canActivate: [adminGuard]` protects `/admin`; `**` redirects to `/login`.
- Lazy loading: `loadComponent: () => import('./features/...').then(m => m.PageComponent)`.

### TypeScript & ESLint Rules

- `strict: true` (implies `noImplicitAny`), `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature` — type-safe property access. `@ts-expect-error` should only be used if strictly necessary.
- `@typescript-eslint/no-explicit-any`: warn.
- `@typescript-eslint/no-floating-promises`: error — Must `await` Promises or handle them.
- `no-console`: warn (allow warn/error) — Debug logs should use `console.warn` or `console.error`.
- Prettier enforced — Use `pnpm run lint:fix` to auto-format.

### State & Reactivity

- Angular 22, **zoneless** (using `provideZonelessChangeDetection`).
- State is managed via plain signals in `providedIn: 'root'` services.
- `HttpClient` + `firstValueFrom` is used for HTTP communication; `httpResource`/`resource`/`linkedSignal` are not used.
- Interceptor order in `app.config.ts`: `[authInterceptor, errorInterceptor, csrfInterceptor]` — csrf runs innermost so it can refresh the token and retry a CSRF 403 before the error interceptor treats it as a real failure.
- RUM: `RumService.start()` runs in a `provideAppInitializer` (noop on SSR) and reports Core Web Vitals to `/api/v1/rum`.

### Testing

- Vitest + jsdom (setup file: `src/test-setup.ts`; pool `threads` with `isolate` to avoid TestBed state bleed; `globals: true`).
- Spec files: `*.spec.ts` co-located with source files.
- Mock services with `vi.spyOn` or `vi.mock`.

### Common Gotchas

- **MapLibre in the admin panel**: `maplibre-gl` 6 resolves its worker from `import.meta.url`, which breaks after bundling. `angular.json` copies `maplibre-gl.css`, `maplibre-gl-worker.mjs` and `maplibre-gl-shared.mjs` to `/vendor/`, and `features/admin/map/base-map.ts` calls `setWorkerUrl('vendor/maplibre-gl-worker.mjs')` and injects the CSS on demand. CARTO basemaps now return an "API KEY REQUIRED" watermark; the admin uses OSM tiles dimmed in dark mode.
- **Angular template identifiers must be ASCII** (no `ñ`): the template lexer rejects them.
- **Global touch sizing**: `styles.css` sets `min-height: 44px` on `button`/`input`/`select`; the admin panel resets it under `.adm`.

- **SSR Differences:** `window` / `document` don't exist in server context; wrap DOM access in platform/browser guards or use `afterNextRender()`.
- **Map UI split:** The map feature is split into multiple single-responsibility services under `features/map/services/` (engine, tile layer, territory layer, selection, partial draw, capture, style, state, interaction, rendering facade, data persistence, initialization, location, mark restoration, report, whatsapp, spatial index, etc.). Put new map behavior in one of these services, not in `MapPage`.
- **Map perf (status 2026-09-14):** `map-engine.service.ts` uses Leaflet 1.9's standard `Canvas` renderer (`padding: 0.3`) — pan moves the canvas with a GPU transform and paths repaint only on `moveend` (no per-frame redraw; the `ContinuousCanvas` hack is gone). Hit-testing is **not** linear: `map-interaction.service.ts` uses `queryManzanasAt` (O(1) on average) and `queryManzanasNear` (3×3 cell window) through `map-rendering.facade.ts` → `map-territory-layer.service.ts`, which instantiates `manzana-spatial-index.ts` (uniform grid, cell 0.002° ≈ 200 m). Remaining known debt: `map-territory-layer.service.ts` computes turf `simplify`(highQuality)+`union` on the main thread per session (result cached in `sessionStorage`).

## Backend Conventions

- Layered Spring MVC: `controller/` → `service/` → `repository/` → `model/` + `dto/` (+ `geojson/` in territory-service; `publisher/` + `listener/` in reporting-service for the RabbitMQ WhatsApp flow).
- Cross-cutting concerns live in `backend/shared/`: security (HMAC session tokens, `SessionAuthFilter`), exceptions (`GlobalExceptionHandler` turns domain exceptions into HTTP errors — do not duplicate ad-hoc exception handling in controllers), and `PhoneUtil` (E.164 normalization, used for login/encargado identity).
- Multi-write services use `@Transactional` (TerritoryService, ReportService, EncargadoService, WhatsAppDeliveryRepository). The WhatsApp send endpoint supports an `Idempotency-Key` header.
- Spatial data is stored via PostGIS (hibernate-spatial) and served as GeoJSON; the frontend parses geometry with its own byte-level code (no GeoTools).

## Repository Rules

- Frontend production builds include SSR and the service worker; browser-only APIs must remain guarded for SSR execution.
- Flyway migrations live with the database-owning backend services; schema changes must be represented by a new migration rather than editing an applied migration.
- `territory-service` and `reporting-service` share one Postgres DB (the `postgres` container) but both run Flyway at startup with **separate history tables** (`flyway_schema_history_territory` / `flyway_schema_history_reporting`), `ddl-auto: none`. Territory migrations: `V0`–`V2` in the repo (the database also has a territory `V3__add_s2_dissolved_and_meta` applied from unpushed MapLibre work — Flyway ignores it as a future migration); reporting: `V0`–`V6` (incl. WhatsApp delivery leases, latest-report index, geometry column conversion; V6 = admin panel: `registro_predicacion.inicio_sesion`, encargado PIN/lockout/last-access columns, `app_config`). **Do not add territory migrations until the V3 file is in the repo**: with V3 applied but missing locally, Flyway validation fails on startup. A new migration in either service DOES run at startup.
- Do not use generated/build output (`target/`, `dist/`, `coverage/`, `.scannerwork/`) as source files; these are ignored artifacts.
- **Frontend uses pnpm exclusively**: `package.json` pins `packageManager: pnpm@9.15.0` (via Corepack), `angular.json` sets `cli.packageManager: "pnpm"`, CI runs `pnpm install --frozen-lockfile` (pnpm 9 has no `pnpm ci`), and `pnpm-lock.yaml` is the only committed lockfile (`package-lock.json` is removed). Always use `pnpm` (never npm) for frontend installs and scripts.
