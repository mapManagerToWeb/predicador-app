# Repository Instructions

> Last verified: 2026-10-10. Whenever a fact here disagrees with the code, the code wins — fix this file.

## Layout

- Git repo root is `predicador-app/` (the parent `project-1/` holds no repo). Two independent stacks, no shared build tool.
- `backend/` — Maven reactor (Java 25, Spring Boot **4.1.1**, Spring Cloud **2025.1.3**), modules `shared`, `config-server`, `discovery-server`, `api-gateway`, `territory-service`, `reporting-service`. Run all Maven commands from `backend/`.
- `territory-frontend/` — Angular 22 zoneless SSR/PWA app. The directory is `territory-frontend/`, **not** `predicador-frontend/` (stale `.gitignore` entries still reference the old name; those paths no longer exist).
- `docker-compose.yml` runs the 5 backend services plus `postgres` (`imresamu/postgis:18-3.6`), `rabbitmq` (`rabbitmq:4.3.4-management`) and the one-shot `db-import`. `otel-collector`/`jaeger`/`prometheus`/`grafana` are opt-in via `--profile observability`; their configs live in `observability/`.
- Only `docs/adr/` is tracked (0001–0018). `docs/audit/`, `docs/superpowers/`, `tasks/`, `CAPABILITY-MAP.md`, `SPEC-map-*.md`, `backups/` are gitignored — local only. Record durable decisions as a new `docs/adr/NNNN-*.md`; ADR 0010 supersedes 0001 and 0002.
- `openspec/` is the SDD workflow (`changes/`, `changes/archive/`, `specs/`). `CHANGES.md` at the root is a plain-language PR review summary.

## Codebase Memory (Knowledge Graph)

Indexed under project name **`predicador-app`** (`index_repository`, root = repo root). Prefer graph tools over grep for discovery; refresh the index after significant refactors.

Hot-path fan-in (from the current index — verify with `query_graph` before quoting numbers):

| Symbol | Incoming edges |
|---|---|
| `shared.security.SessionTokenService.verify` | 70 |
| `shared.security.SecurityRule.any` | 40 |
| `reporting…WhatsAppDelivery.getStatusCode` | 31 |
| `shared.security.TokenValidator.validate` | 24 |
| `reporting…client.WhatsAppMessageClient.sendTemplateMessage` | 22 |
| `shared.security.SessionTokenService.issue` | 21 |

`backend/shared` is the architectural core — changes there are high-risk. 55 routes are indexed.

> ⚠️ This graph is **context, not truth**. It has gone stale before (Leaflet-era symbols survived an index refresh). Verify any graph claim against the source before acting on it.

## Verification

**Frontend** (from `territory-frontend/`, pnpm only — see below):

```bash
corepack enable                 # once
pnpm install
pnpm run lint                   # eslint + prettier
pnpm run build                  # production build; this is also the typecheck
pnpm test -- --run --coverage   # what CI runs
pnpm test src/path/to/file.spec.ts   # single spec
```

CI order is lint → build → test. `pnpm run build` type-checks, so there is no separate `tsc` step.

**Backend** (from `backend/`):

```bash
mvn verify -B                      # full build + tests
mvn verify -Pcoverage              # adds JaCoCo report + 40% LINE/INSTRUCTION gate
mvn -pl territory-service test     # one module
```

### Backend test gotchas (cost me real time — verify before you trust a green run)

- **Four integration tests silently skip unless you pass `-Ddocker.available=true`.** They are gated on `@EnabledIfSystemProperty(named = "docker.available")`: `PostgisIntegrationTest`, `ReportRepositoryIntegrationTest` (reporting), `CicloServiceIntegrationTest`, `EstadoPublicoServiceIntegrationTest`. Nothing in `pom.xml` or any workflow sets that property, so a plain `mvn verify` — **including CI's `mvn verify -Pcoverage -B`** — reports them as skipped. To actually run them: `mvn verify -Pcoverage -Ddocker.available=true` (needs a working Docker socket; in this environment also set `TESTCONTAINERS_RYUK_DISABLED=true` — GHCR 404 on `testcontainers/ryuk:0.11.0`). ⚠️ Consequence: a plain local `mvn verify` skips the ITs and **`territory-service` drops below the JaCoCo 40% gate (~25–29%) → the build fails**. That is expected without the IT environment, not a regression signal.
- **`TerritoryAdminIntegrationTest`** is gated on `@EnabledIf("baseDisponible")`: either `-Ddocker.available=true` (Testcontainers) or `TERRITORY_IT_DB_URL` + `TERRITORY_IT_DB_USERNAME` / `TERRITORY_IT_DB_PASSWORD`. **It deletes every manzana**, so it refuses any DB whose name does not match `*_test`. This is the only test CI actually executes against its PostGIS service.
- **`EncargadoRaceConditionIT` never runs.** It is named `*IT`, which surefire's default includes (`*Test`, `Test*`, `*Tests`, `*TestCase`) do not match, and there is no failsafe plugin configured. No `target/surefire-reports` entry exists for it. Do not assume it is covered.
- There is **no surefire/failsafe configuration anywhere** in `backend/` — naming is the only filter, which is why the two points above matter.
- Run a single backend test with `-Dtest=ClassName` (e.g. `TESTCONTAINERS_RYUK_DISABLED=true mvn -pl reporting-service test -B -Ddocker.available=true -Dtest=ReportRepositoryIntegrationTest`).
- **Identity-id trap in reporting tests:** `Report.id` is `GenerationType.IDENTITY` — the DB sequence advances across tests even with rollback, so never assert absolute ids (`expected: 101L but was: 8L`); capture ids from `save()` returns instead.

## CI (`.github/workflows/`)

- `ci-backend.yml` — Java 25 + a `postgis/postgis:16-3.4` service on db `predicador_test`; runs `mvn verify -Pcoverage -B` with `DB_*`, `TERRITORY_IT_DB_*`, `TESTCONTAINERS_RYUK_DISABLED=true` and `DOCKER_HOST` set. Note the CI DB image (PostGIS 16) is **older** than the compose one (PostGIS 18).
- `ci-frontend.yml` — pnpm 9.15.0 + Node 22; `pnpm install --frozen-lockfile --ignore-scripts`; lint → build → `pnpm test -- --run --coverage`. Push branches: `main`, `chore/production-quality-hardening`, `feat/redesign`; PR base: `main`, `feat/redesign`.
- `respaldo-bdd.yml` — daily 07:30 UTC + manual. SSHes to the VPS with a key whose `authorized_keys` forces `scripts/db/respaldo.sh stdout`; the dump is age-encrypted for every recipient in `.github/backup/age.pub` **before** leaving the VPS (the repo is public). 90-day artifact. Restore with `scripts/db/restaurar.sh`.
- `docker.yml` — builds/pushes the 5 backend images to GHCR on `main` and `v*`; PRs build without pushing. Branch/PR events are path-filtered to `backend/**`; tag pushes are not.
- `security.yml` — gitleaks, OWASP dependency-check (`-DfailBuildOnCVSS=7`), Trivy image scan (`CRITICAL,HIGH`, `ignore-unfixed`), Semgrep SAST (ERROR gate + SARIF). gitleaks and Semgrep skip dependabot runs. Weekly Sun 03:00.
- `sonarcloud.yml` — project key `mapManagerToWeb_predicador-app`; settings in `sonar-project.properties` (lcov from `territory-frontend/coverage/lcov.info`, JaCoCo from `backend/**/target/site/jacoco/`).
- `opencode.yml` — `/oc` or `/opencode` comment triggers the opencode action (model `opencode/mimo-v2.5-free`), restricted to `OWNER`/`MEMBER`/`COLLABORATOR`.

## Frontend Conventions

- Feature layout under `territory-frontend/src/app/`: `core/` (services, guards, interceptors, models, `map/`, `utils/`), `features/` (`auth`, `map`, `profile`, `admin`, `visor`). No `shared/` directory.
- Route guards: `profileGuard` → `/map`, `adminGuard` → `/admin`. `/visor` is **intentionally public**. `**` → `/login`. All routes lazy-load via `loadComponent`.
- Selector prefixes are enforced by ESLint: components `app-` (kebab-case), directives `app` (camelCase).
- Strict TypeScript: `strict`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`. `no-explicit-any` is `warn`; **`no-floating-promises` is `error`** — `await` or `void` every promise. `no-console` allows only `warn`/`error`.
- Zoneless (`provideZonelessChangeDetection`); state in plain signals in `providedIn: 'root'` services. HTTP via `HttpClient` + `firstValueFrom` — `httpResource`/`resource`/`linkedSignal` are deliberately unused.
- Interceptor order in `app.config.ts` is `[auth, error, csrf]`. The ordering is load-bearing: csrf is innermost so it can refresh the token and retry a CSRF 403 *before* `errorInterceptor` treats it as a real failure. Reordering silently breaks CSRF recovery.
- **Known layering debt — do not extend:** `features/admin/pages/territorios/territorios.ts` imports `TERRITORY_COLORS` from `features/map/utils/territory-colors`, and `features/admin/utils/correccion.ts` imports zone helpers from `features/map/utils/lados`. Both are feature→feature. Promote to `core/` rather than adding a third such import.
- `core/utils/http-retry.ts` retries only 502/503/504 (cold-start / upstream-down), with a longer backoff for mutations. 4xx and status 0 are never retried.

### Maps (all MapLibre GL 6 — ADR 0010 replaced Leaflet and `@turf/*`)

- **`maplibre-gl` 6 resolves its worker from `import.meta.url`, which breaks after bundling.** `angular.json` copies `maplibre-gl.css`, `maplibre-gl-worker.mjs`, `maplibre-gl-shared.mjs` to `/vendor/`; `core/map/base-map.ts` calls `setWorkerUrl(...)` and injects the CSS. Removing that asset glob breaks the map at runtime, not at build time.
- `core/map/base-map.ts` is shared by the field map, the viewer and the admin maps. `maxZoom` is 20; the satellite source is capped at `maxzoom` 18 (Esri serves a grey tile at 19 over Curanilahue, so MapLibre overzooms instead).
- In MapLibre 6 `GeoJSONSource.setData` returns a promise → prefix with `void`.
- Marking must only change `feature-state`; never re-upload geometry (ADR 0010 perf rule).
- `features/map/` split: `map.ts` wires the screen, `mapa.store.ts` holds the rules, `mapa-vista.ts` does all drawing, `utils/salida.ts` + `utils/lados.ts` + `utils/borrador.ts` are pure and tested without a map. **Nothing may discard marks or send a report without a `Pregunta` confirmation.**

### Frontend gotchas

- **Angular template identifiers must be ASCII — no `ñ`.** The template lexer rejects it. `ñ` is fine in text content (`Contraseña`, `Mañana`) but never in a binding, property or identifier.
- SSR is on in production builds: guard `window`/`document` behind platform checks or `afterNextRender()`.
- `styles.css` sets a global `min-height: 44px` on `button`/`input`/`select`; the admin shell resets it under `.adm`.
- Coverage thresholds in `vitest.config.ts` are low (30/30/30/20). Passing coverage ≠ good coverage.
- Vitest uses `pool: 'threads'` with `isolate` deliberately — the default `vmThreads` pool shares worker state and breaks TestBed. Don't "simplify" it back.
- `pnpm` only. `package.json` pins `packageManager: pnpm@9.15.0`, `angular.json` sets `cli.packageManager: "pnpm"`, `pnpm-lock.yaml` is the only lockfile and `package-lock.json` is gitignored. pnpm 9 has no `pnpm ci`.
- Before any perf work, `pnpm install --frozen-lockfile` — a stale `node_modules` is the usual cause of local-vs-CI divergence.

## Backend Conventions

- Layering: `controller/` → `service/` → `repository/` → `model/` + `dto/` (+ `geojson/` in territory; `publisher/` + `listener/` in reporting for the RabbitMQ WhatsApp flow).
- Cross-cutting lives in `backend/shared/`: `security/`, `exception/`, `util/PhoneUtil.java`. `GlobalExceptionHandler` already maps domain exceptions to HTTP — do not add ad-hoc handling in controllers.
- **Auth is strict by default.** `SessionTokenService` throws at startup unless `app.session.secret` is ≥32 bytes; the only escape is the `local` profile (or `app.session.strict=false`) with an empty secret. `ADMIN_PASSWORD_BCRYPT` is likewise mandatory outside `local`. Generate with `openssl rand -hex 32` and `htpasswd -bnBC 10 "" '<pass>' | tr -d ':\n'`.
- `SESSION_SECRET` must be **identical** across gateway, territory and reporting, or HMAC tokens won't verify between services.
- Phone numbers: `PhoneUtil.esCelularChileno` = 9 digits starting with 9, `+56` optional. Enforced on every create/edit/login with code `telefono_invalido`, mirrored client-side in `core/utils/phone.ts` `esCelularChileno`. Change one, change the other.
- Multi-write services are `@Transactional`; the WhatsApp send endpoint honours an `Idempotency-Key` header.
- Gateway routes live in **`api-gateway/…/config/RouteConfig.java`, not YAML**. All URIs are `lb://<service>` (Eureka), each with a Resilience4j circuit breaker + fallback, and a retry on GET only. `/api/v1/rum` deliberately has no retry.
- `SecurityRules.REPORTS_PATH` excludes `/api/v1/reports/public/**` — the only unauthenticated reports path. The public viewer (`/visor`) depends on it; do not widen the exclusion.
- Production DB is the self-hosted `postgres` compose container (ADR 0006, replaced Neon). Only `DB_PASSWORD` is required in `.env`; `DB_URL`/`DB_USERNAME` default to the container. `db-import` runs once before territory/reporting and is a no-op when data already exists.
- Start order matters: `config-server` (8888) → `discovery-server` (8761) → `api-gateway` (8080) → `territory-service` (8081) / `reporting-service` (8082). Management ports 8090/8091/8092. Frontend: `ng serve` on 4200, proxying `/api` → 8080.
- `config-server` serves from its classpath (`native` profile, the compose default). Pointing `SPRING_PROFILES_ACTIVE` elsewhere makes it try a git repo with no URI.
- Copy `.env.example` → `.env` before compose (it fails fast on `:?` interpolation). Both `.env` and `application-local.yml` are gitignored and must never be committed.
- WhatsApp (reporting, Meta Graph **v21.0**) is disabled unless `WHATSAPP_PHONE_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE` (default `asignacion_territorio`) and `WHATSAPP_DESTINATION` are set. **The report's WhatsApp goes to the logged-in encargado's registered phone** (`DestinoWhatsApp`: looked up in the DB from the session, never the client's `destinationNumber`, which stays ignored — ADR 0016); `WHATSAPP_DESTINATION` is only the fallback (admin session or no valid phone).

### Migrations

- Flyway runs at startup for both DB services with **separate history tables** (`flyway_schema_history_territory` / `flyway_schema_history_reporting`), `ddl-auto: none`. Territory: `V0`–`V2` in the repo; reporting: `V0`–`V9` plus `V1_1__deduplicate_encargado_identity`.
- ⚠️ **Do not add a territory migration yet.** The database has a territory `V3__add_s2_dissolved_and_meta` applied from unpushed work that is not in the repo; Flyway validation then fails on startup. Reporting migrations are unaffected — a new one there does run.
- Never edit an applied migration; add a new one.
- **Registration status is public**: `GET /api/v1/encargados/registro` → `{abierto}` (no session, only that flag). The login hides «Crear perfil» and `/profile` redirects to the login when the admin closed registration (Encargados page); the server still rejects sign-ups (`registro_cerrado`).
- The map tutorial opens only from the «?» button (never by itself). Territory numbers on the field map and the viewer use `TAMANO_NUMERO_TERRITORIO` (`core/map/base-map.ts`): large on purpose, for users with poor eyesight — do not shrink them.
- **Reports are never deleted to change a territory's state.** A territory's state is always its last report; a cycle close or an admin correction *adds* a report (ADR 0011). An admin annulment sets `anulado_en` + `reemplaza_a` (V8, ADR 0014) so history is preserved but ignored by state queries.
- **`fecha` is when a report was sent and orders the reports; `fecha_predicacion` + `turno` (V9, ADR 0018) are the day and shift preached**, chosen in the send dialog (today, yesterday or up to 7 days back; `features/map/utils/dia.ts`, validated by `DiaDePredicacion` in Chile time). The S-13, admin panel (`fechaDeTrabajo`), public state and WhatsApp show the preaching day. Never back-date `fecha`: it would reorder the cumulative state (ADR 0013).

## Verification Checklist

Before declaring work done:

1. Frontend: `pnpm run lint` && `pnpm run build` && `pnpm test -- --run` all pass.
2. Backend: `mvn verify -Pcoverage` passes. If you touched DB/migration/security code, run the full IT set: `TESTCONTAINERS_RYUK_DISABLED=true mvn verify -Pcoverage -B -Ddocker.available=true`. Note: a plain local run skips the docker-gated ITs and `territory-service` then fails the 40% gate — expected without the IT environment.
3. No new cross-feature imports from `features/admin` → `features/map`.
4. New architecture decision → new ADR under `docs/adr/`.
