# Repository Instructions

> Last verified: 2026-11-10. Whenever a fact here disagrees with the code, the code wins — fix this file.

## Layout

- Git repo root is `predicador-app/` (the parent `project-1/` holds no repo). Two independent stacks, no shared build tool.
- `backend/` — Maven reactor (Java 25, Spring Boot **4.1.1**, Spring Cloud **2025.1.3**), modules `shared`, `config-server`, `discovery-server`, `api-gateway`, `territory-service`, `reporting-service`. Run all Maven commands from `backend/`.
- `territory-frontend/` — Angular 22 zoneless SSR/PWA app. The directory is `territory-frontend/`, **not** `predicador-frontend/` (stale `.gitignore` entries still reference the old name; those paths no longer exist).
- `docker-compose.yml` runs the 5 backend services plus `docker-lectura` (read-only Docker proxy for the panel's «Sistema» module, ADR 0020) and `postgres` (`imresamu/postgis:18-3.6`), `rabbitmq` (`rabbitmq:4.3.4-management`) and the one-shot `db-import`. `otel-collector`/`jaeger`/`prometheus`/`grafana` are opt-in via `--profile observability`; their configs live in `observability/`.
- Tracked docs are `docs/adr/` (0001–0018, 0020, 0021) and `docs/ai/` (AI support pack, ADR 0017 — progressive disclosure from `docs/ai/README.md`; `docs/ai/support/references/code-map.md` is a topic → file index, faster than grep for orientation but it lags the code). `tasks/`, `CAPABILITY-MAP.md`, `SPEC-map-*.md`, `backups/`, `.agents/`, `.atl/`, `.claude/`, `.opencode/` are gitignored — local only, never commit them. Record durable decisions as a new `docs/adr/NNNN-*.md`; ADR 0010 supersedes 0001 and 0002.
- `openspec/` is the SDD workflow (`changes/`, `changes/archive/`, `specs/`). `CHANGES.md` at the root is a plain-language PR review summary.

## Codebase Memory (Knowledge Graph)

No graph index is committed (`.codegraph/` is absent at the repo root), so graph tools must index first and their output is a hint, not truth. The durable fact an index encodes: `backend/shared/` is the architectural core — `security/` (`SessionTokenService`, `SecurityRules`, `TokenValidator`, `AuthorizationService`) is consumed by gateway, territory and reporting, so changes there are high-risk.

> The index has gone stale before (Leaflet-era symbols survived a refresh). Verify every graph claim against the source before acting on it.

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

`tests/` at the repo root holds a manual k6 load script (`tests/load/api-gateway.js`) and `tests/trace-propagation-smoke.sh`. Neither runs in CI.

**Backend** (from `backend/`):

```bash
mvn verify -B                      # full build + tests
mvn verify -Pcoverage              # adds JaCoCo report + 40% LINE/INSTRUCTION gate
mvn -pl territory-service test     # one module
```

### Backend test gotchas (cost me real time — verify before you trust a green run)

- **The integration tests only run when `-Ddocker.available=true` is passed *and* Docker actually answers.** They are gated on `@EnabledIf("dockerDisponible")`: `PostgisIntegrationTest`, `ReportRepositoryIntegrationTest` (reporting), `CicloServiceIntegrationTest`, `EstadoPublicoServiceIntegrationTest` and `EncargadoRaceConditionTest`. The check runs `DockerClientFactory.instance().isDockerAvailable()` inside a `try/catch (RuntimeException | LinkageError)`; if Docker is unreachable the test **skips instead of failing the build** — an environment failure must never red the build, because it hides the failures that matter. `ci-backend.yml` passes that property, so **CI runs all of them**; a plain local `mvn verify` still reports them as skipped. To run them locally: `mvn verify -Pcoverage -Ddocker.available=true` (needs a working Docker socket; in this environment also set `TESTCONTAINERS_RYUK_DISABLED=true` — GHCR 404 on `testcontainers/ryuk:0.11.0`). ⚠️ Consequence: a plain local `mvn verify` skips the ITs and **`territory-service` drops below the JaCoCo 40% gate (~25–29%) → the build fails**. That is expected without the IT environment, not a regression signal.
- **`TerritoryAdminIntegrationTest`** is gated on `@EnabledIf("baseDisponible")`: `TERRITORY_IT_DB_URL` + `TERRITORY_IT_DB_USERNAME` / `TERRITORY_IT_DB_PASSWORD` first, otherwise `-Ddocker.available=true` **plus a Docker probe**. **It deletes every manzana**, so it refuses any DB whose name does not match `*_test`. CI sets `-Ddocker.available=true`, so it runs there through Testcontainers; `sonarcloud.yml` sets `TERRITORY_IT_DB_*` instead, and that alone is what keeps `territory-service` above the 40% gate there.
- **`EncargadoRaceConditionTest` runs only with `-Ddocker.available=true` and Docker reachable.** It used to be `EncargadoRaceConditionIT`, a name surefire's default includes (`*Test`, `Test*`, `*Tests`, `*TestCase`) never matched, so it silently never ran. The `Test` suffix is deliberate — do not rename it back.
- **`maven-enforcer-plugin` guards dependency floors at `validate`.** A `bannedDependencies` rule in `backend/pom.xml` fails fast on every CVE pin (`com.rabbitmq:amqp-client:[,5.37.0)` and nine more). When you pin a transitive dependency for a CVE, add the Enforcer entry too: the pin alone is only a promise. **Prove the floor bites before adding it** — the rule only sees compile scope, so `org.postgresql:postgresql` (runtime) and `tools.jackson.core:jackson-core` were tried and removed. Raise the ceiling one version and require the `banned via the exclude/include list` failure. Note Dependabot's `first_patched_version` can name a release that was never published (`amqp-client` 5.36.1 does not exist on Maven Central; 5.37.0 is the first release with the fix) — check `maven-metadata.xml` before trusting it.
- **A `dependencyManagement` pin does not reach Trivy.** The image scan parses the `pom.xml` embedded in the jar, which has no `<parent>` and therefore no root overrides, so it resolves the vulnerable transitive version again. `guava` 33.0.0-jre arrived through Eureka Server and kept failing the scan until it was declared as a **direct dependency with an explicit version** in `discovery-server/pom.xml`. That also moves it to compile scope, which is what lets the Enforcer guard it.
- There is **no surefire/failsafe configuration anywhere** in `backend/` — naming is the only filter, which is why the points above matter.
- Run a single backend test with `-Dtest=ClassName` (e.g. `TESTCONTAINERS_RYUK_DISABLED=true mvn -pl reporting-service test -B -Ddocker.available=true -Dtest=ReportRepositoryIntegrationTest`).
- **Identity-id trap in reporting tests:** `Report.id` is `GenerationType.IDENTITY` — the DB sequence advances across tests even with rollback, so never assert absolute ids (`expected: 101L but was: 8L`); capture ids from `save()` returns instead.

## CI (`.github/workflows/`)

- `ci-backend.yml` — Java 25 + a `postgis/postgis:16-3.4` service on db `predicador_test`; runs `mvn verify -Pcoverage -B` with `DB_*`, `TERRITORY_IT_DB_*`, `TESTCONTAINERS_RYUK_DISABLED=true` and `DOCKER_HOST` set. Note the CI DB image (PostGIS 16) is **older** than the compose one (PostGIS 18).
- `ci-frontend.yml` — pnpm 9.15.0 + Node 22; `pnpm install --frozen-lockfile --ignore-scripts`; **`pnpm audit --prod --audit-level=high`** → lint → build → `pnpm test -- --run --coverage`. Push branches: `main`, `chore/production-quality-hardening`, `feat/redesign`; PR base: `main`, `feat/redesign`. The audit step is the gate: `--prod` skips dev-only advisories, which never ship.
- Every workflow declares minimal `permissions:` and lists its own file in `pull_request.paths`.
- `respaldo-bdd.yml` — daily 07:30 UTC + manual. SSHes to the VPS with a key whose `authorized_keys` forces `scripts/db/respaldo.sh stdout`; the dump is age-encrypted for every recipient in `.github/backup/age.pub` **before** leaving the VPS (the repo is public). 90-day artifact. Restore with `scripts/db/restaurar.sh`.
- `docker.yml` — builds/pushes the 5 backend images to GHCR on `main` and `v*`; PRs build without pushing. Branch/PR events are path-filtered to `backend/**`; tag pushes are not.
- `security.yml` — gitleaks, OWASP dependency-check (`-DfailBuildOnCVSS=7`), Trivy image scan (`CRITICAL,HIGH`, `ignore-unfixed`), Semgrep SAST (ERROR gate + SARIF). gitleaks and Semgrep skip dependabot runs. Weekly Sun 03:00.
- `sonarcloud.yml` — project key `mapManagerToWeb_predicador-app`; settings in `sonar-project.properties` (lcov from `territory-frontend/coverage/lcov.info`, JaCoCo from `backend/**/target/site/jacoco/`). It runs `mvn verify -Pcoverage -B` **with `TERRITORY_IT_DB_*`**: without them `TerritoryAdminIntegrationTest` skips, `territory-service` lands at ~0.25 lines against the 0.40 gate, and the whole workflow goes red.
- `opencode.yml` — `/oc` or `/opencode` comment triggers the opencode action (model `opencode/mimo-v2.5-free`), restricted to `OWNER`/`MEMBER`/`COLLABORATOR`.

## Frontend Conventions

- Feature layout under `territory-frontend/src/app/`: `core/` (services, guards, interceptors, models, `map/`, `utils/`), `features/` (`auth`, `map`, `profile`, `admin`, `visor`). No `shared/` directory.
- Route guards: `profileGuard` → `/map`, `adminGuard` → `/admin`. `/visor` and `/practice` are **intentionally public**. `/practice` is the field map with the `MODO_PRACTICA` token (`core/map/modo-practica.ts`): real territories, but nothing is sent or saved server-side; marks live in `PracticeDraftService` (local storage, wiped after 7 days). `**` → `/login`. All routes lazy-load via `loadComponent`.
- Selector prefixes are enforced by ESLint: components `app-` (kebab-case), directives `app` (camelCase).
- Strict TypeScript: `strict`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`. `no-explicit-any` is `warn`; **`no-floating-promises` is `error`** — `await` or `void` every promise. `no-console` allows only `warn`/`error`.
- Zoneless (`provideZonelessChangeDetection`); state in plain signals in `providedIn: 'root'` services. HTTP via `HttpClient` + `firstValueFrom` — `httpResource`/`resource`/`linkedSignal` are deliberately unused.
- Interceptor order in `app.config.ts` is `[auth, error, csrf]`. The ordering is load-bearing: csrf is innermost so it can refresh the token and retry a CSRF 403 *before* `errorInterceptor` treats it as a real failure. Reordering silently breaks CSRF recovery.
- **Known layering debt — do not extend:** `features/admin/pages/territorios/territorios.ts` imports `TERRITORY_COLORS` from `features/map/utils/territory-colors` (feature→feature). The street/side geometry (`core/map/lados.ts`) and the WhatsApp sender (`core/services/whatsapp.ts`) were promoted to `core/` because the field map and the panel both use them; do the same rather than adding a new feature→feature import.
- `core/utils/http-retry.ts` retries only 502/503/504 (cold-start / upstream-down), with a longer backoff for mutations. 4xx and status 0 are never retried.

### Maps (all MapLibre GL 6 — ADR 0010 replaced Leaflet and `@turf/*`)

- **`maplibre-gl` 6 resolves its worker from `import.meta.url`, which breaks after bundling.** `angular.json` copies `maplibre-gl.css`, `maplibre-gl-worker.mjs`, `maplibre-gl-shared.mjs` to `/vendor/`; `core/map/base-map.ts` calls `setWorkerUrl(...)` and injects the CSS. Removing that asset glob breaks the map at runtime, not at build time.
- `core/map/base-map.ts` is shared by the field map, the viewer and the admin maps. The «my location» control (`core/map/ubicacion.ts`) and the heading cone (`core/map/rumbo.ts`, iOS asks for permission) are shared by the field map and the viewer; the field map's offline data cache lives in `features/map/mapa.datos.ts`. `maxZoom` is 20; the satellite source is capped at `maxzoom` 18 (Esri serves a grey tile at 19 over Curanilahue, so MapLibre overzooms instead).
- In MapLibre 6 `GeoJSONSource.setData` returns a promise → prefix with `void`.
- Marking must only change `feature-state`; never re-upload geometry (ADR 0010 perf rule).
- **The report's WhatsApp image is always the map, with every territory of the outing whole** (`core/map/captura.ts`, used by the field map and «Registrar salida»). Nearby territories go in one shot; if the outing spans more than `LADO_MAXIMO_M` (1.4 km) the territories are grouped and each group is shot up close, then joined into **one** JPEG (2 per row, max 4 parts, each labelled «Territorio N»). It lifts `maxBounds` and draws at pixel ratio ≥ 2 while shooting, then restores the camera. There is no fixed «territorio completado» image any more: the server uses `WHATSAPP_DEFAULT_IMAGE_URL` only when no capture arrives.
- `features/map/` split: `map.ts` wires the screen, `mapa.store.ts` holds the rules, `mapa-vista.ts` does all drawing, `utils/salida.ts` + `utils/borrador.ts` (and `core/map/lados.ts`) are pure and tested without a map. **Nothing may discard marks or send a report without a `Pregunta` confirmation.**

### Frontend gotchas

- **Angular template identifiers must be ASCII — no `ñ`.** The template lexer rejects it. `ñ` is fine in text content (`Contraseña`, `Mañana`) but never in a binding, property or identifier.
- **New versions reach the phones by themselves** (`core/services/actualizacion.ts`, started from `app.config.ts`): the service worker keeps the app on the phone, and an installed PWA is resumed rather than reopened, so without this an old version stayed for days and brothers had to clear site data. It checks on start, when the app comes back to the foreground and every 30 min; a downloaded version reloads by itself if the user has not touched the app since opening it or since coming back after ≥1 min, otherwise the root shows a «Hay una versión nueva — Actualizar» banner (never reloads mid-task; at most one automatic reload per 5 min; `unrecoverable` always reloads). Map drafts are saved within 300 ms, so a reload loses nothing.
- SSR is on in production builds: guard `window`/`document` behind platform checks or `afterNextRender()`.
- **The app is called «Territorios»** (title, manifest, login). **Every screen is light unless the brother chose dark**: `:root` in `styles.css` is the dark palette, so `index.html` carries `data-theme="light"` and the login, sign-up and viewer call `aplicarTemaGuardado()` (`core/utils/tema.ts`, key `CLAVE_TEMA`); the field map and the panel set it themselves. A new public screen that skips it comes out black.
- **The browser bar follows the theme.** Change the theme only through `ponerTema()` (`core/utils/tema.ts`): it sets `data-theme` and the `theme-color` meta (`COLOR_BARRA`). An inline script in `index.html` does the same before the app boots, so a brother who chose dark never sees a white flash — it repeats the `territory_theme` key and both colours, so change them together. The iOS status bar style is `default` (`black-translucent` gave a white clock on a white screen).
- **The typeface is Inter, served by the app itself** (`public/fonts/inter-latin.woff2`, variable 100–900, latin subset, OFL licence beside it): `@font-face` in `styles.css`, preloaded in `index.html` and prefetched by the service worker (`/fonts/*.woff2` in the `app` group of `ngsw-config.json`), so it also works without signal. Nothing is requested from Google Fonts — do not add that link back. `--font-mono` is the system monospace.
- **Every button answers the finger** (`styles.css`): an enabled `button`, or anything with class `.tocable` (for links that look like buttons), shrinks to `scale: 0.97` and dims while pressed. `--toque` is the shared transition: a component that sets its own `transition` on a button must include `var(--toque)` or the release is abrupt. It uses the individual `scale`/`translate` properties, never `transform`, so it composes with elements that are already transformed. Exception: MapLibre markers (`.maplibregl-marker.lado-badge`) get `scale: none`, because `scale` multiplies the marker's own positioning translate and the badge jumps. `<body ontouchstart="">` is what makes `:active` work in iOS Safari — keep it.
- **Motion is short and shared**: global keyframes `aparecer` / `desaparecer` / `subir` / `bajar` / `caer` in `styles.css` (panels, dialogs, suggestion lists, ≤0.3 s); what leaves the screen uses `animate.leave="saliendo"` plus a `.saliendo` rule that must set `pointer-events: none`. `prefers-reduced-motion` turns it all off. `medirPanel` (`map.ts`) measures with `offsetTop`/`offsetWidth`, not `getBoundingClientRect`, on purpose: the rect includes the entry animation's translate and gave the map wrong margins.
- **Screens cross-fade** (`withViewTransitions` in `app.config.ts`), but only between top-level screens: `soloEntrePantallas` (`core/utils/transicion.ts`) skips it inside `/admin`. In dev mode Angular logs `AbortError: Transition was skipped` for each skipped one — expected; production does not log it.
- **Login and sign-up (`features/auth/auth.css`, shared) must fit one screen without scrolling**, down to 320×568: big type (fields 20 px, 56 px tall), compact rules under `max-height: 700px`, and sign-up drops the logo under 600 px. Field font sizes are set on `.field`, not on the `<input>` (the touch rule below overrides the input's own size).
- The practice notice (`.aviso-practica` in `map.css`) sits between the left buttons and the zoom, **below** the search bar's `z-index` and with `pointer-events: none`: as a full-width card it covered the search results, «Mi ubicación» and the zoom «+».
- `styles.css` sets a global `min-height: 44px` on `button`/`input`/`select`; the admin shell resets it under `.adm`.
- On touch screens (`pointer: coarse`) `styles.css` forces `input`/`select`/`textarea` to at least 16px (`!important`): below 16px iOS zooms in on focus and the zoom stays for the rest of the app. Don't lower it, and don't "fix" it with `maximum-scale=1` — brothers with poor eyesight need pinch zoom.
- Coverage thresholds in `vitest.config.ts` are `60/58/55/50` (lines/statements/functions/branches), about five points under the measured baseline. Passing coverage ≠ good coverage.
- `angular.json` budgets: initial bundle warns at **320 kB** and errors at 600 kB; component styles warn at 12 kB and error at 16 kB. A budget **warning** does not fail CI — don't chase it as a bug.
- Vitest uses `pool: 'threads'` with `isolate` deliberately — the default `vmThreads` pool shares worker state and breaks TestBed. Don't "simplify" it back.
- **`@analogjs/vite-plugin-angular` is pinned at 2.8.1 and must not be raised to 2.9.x without re-measuring.** Angular 22.2 changed `SourceFileCache` from a `Map` to a class with `typeScriptFileCache`, so 2.6.x dies with `cache.has is not a function`; 2.8.1 is the minimum that handles it. But 2.9.x made `mapa.store.spec.ts` fail intermittently (**4 of 10 runs**, at both Angular 22.2.5 and 22.2.1) on real timestamps in `localStorage` snapshots despite `vi.useFakeTimers()`; 2.8.1 gave **0 of 7**. Verify with at least 7 consecutive `pnpm test -- --run --coverage` runs before moving.
- `pnpm` only. `package.json` pins `packageManager: pnpm@9.15.0`, `angular.json` sets `cli.packageManager: "pnpm"`, `pnpm-lock.yaml` is the only lockfile and `package-lock.json` is gitignored. pnpm 9 has no `pnpm ci`.
- Before any perf work, `pnpm install --frozen-lockfile` — a stale `node_modules` is the usual cause of local-vs-CI divergence.

## Backend Conventions

- Layering: `controller/` → `service/` → `repository/` → `model/` + `dto/` (+ `geojson/` in territory; `publisher/` + `listener/` in reporting for the RabbitMQ WhatsApp flow).
- Cross-cutting lives in `backend/shared/`: `security/`, `exception/`, `util/PhoneUtil.java`. `GlobalExceptionHandler` already maps domain exceptions to HTTP — do not add ad-hoc handling in controllers.
- **Auth is strict by default.** `SessionTokenService` throws at startup unless `app.session.secret` is ≥32 bytes; the only escape is the `local` profile (or `app.session.strict=false`) with an empty secret. `ADMIN_PASSWORD_BCRYPT` is likewise mandatory outside `local`. Generate with `openssl rand -hex 32` and `htpasswd -bnBC 10 "" '<pass>' | tr -d ':\n'`.
- `SESSION_SECRET` must be **identical** across gateway, territory and reporting, or HMAC tokens won't verify between services.
- Phone numbers: `PhoneUtil.esCelularChileno` = 9 digits starting with 9, `+56` optional. Enforced on every create/edit/login with code `telefono_invalido`, mirrored client-side in `core/utils/phone.ts` `esCelularChileno`. Change one, change the other.
- Multi-write services are `@Transactional`. The async WhatsApp send **requires** an `Idempotency-Key` header — 400 without it, and a replayed completed key returns the stored delivery instead of resending.
- **«Sistema» module (ADR 0020):** `api-gateway/…/sistema/` serves `/api/v1/sistema/**` itself (not routed): admin session + the admin password again (`PaseSistema`, 15 min idle / 1 h max, 403 `sistema_bloqueado`, never 401). It reads containers only through `docker-lectura` (`docker-lectura/haproxy.cfg` allows just `GET /containers/json` and `/containers/<id>/stats`; never widen it to inspect — env vars hold the passwords), host metrics from `/proc`, and backups from GitHub's public API. It never commands Docker; Portainer (`PORTAINER_URL`) does that.
- Gateway routes live in **`api-gateway/…/config/RouteConfig.java`, not YAML**. All URIs are `lb://<service>` (Eureka), each with a Resilience4j circuit breaker + fallback, and a retry on GET only. `/api/v1/rum` deliberately has no retry.
- `SecurityRules.REPORTS_PATH` excludes `/api/v1/reports/public/**` — the only unauthenticated reports path. The public viewer (`/visor`) depends on it; do not widen the exclusion.
- Production DB is the self-hosted `postgres` compose container (ADR 0006, replaced Neon). `docker-compose.yml` refuses to start without `DB_PASSWORD`, `SESSION_SECRET` and `ADMIN_USERNAME`; `DB_URL`/`DB_USERNAME` default to the container. `db-import` runs once before territory/reporting and is a no-op when data already exists.
- Start order matters: `config-server` (8888) → `discovery-server` (8761) → `api-gateway` (8080) → `territory-service` (8081) / `reporting-service` (8082). Management ports 8090/8091/8092. Frontend: `ng serve` on 4200, proxying `/api` → 8080.
- `config-server` serves from its classpath (`native` profile, the compose default). Pointing `SPRING_PROFILES_ACTIVE` elsewhere makes it try a git repo with no URI.
- Copy `.env.example` → `.env` before compose (it fails fast on `:?` interpolation). Both `.env` and `application-local.yml` are gitignored and must never be committed.
- WhatsApp (reporting, Meta Graph **v21.0**) is disabled unless `WHATSAPP_PHONE_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE` (default `asignacion_territorio`) and `WHATSAPP_DESTINATION` are set. **The report's WhatsApp goes to the logged-in encargado's registered phone** (`DestinoWhatsApp`: looked up in the DB from the session, never the client's `destinationNumber`, which stays ignored — ADR 0016); `WHATSAPP_DESTINATION` is only the fallback (admin session or no valid phone).

### Migrations

- Flyway runs at startup for both DB services with **separate history tables** (`flyway_schema_history_territory` / `flyway_schema_history_reporting`), `ddl-auto: none`. Territory: `V0`–`V2` in the repo; reporting: `V0`–`V9` plus `V1_1__deduplicate_encargado_identity`.
- ⚠️ **Do not add a territory migration yet.** The database has a territory `V3__add_s2_dissolved_and_meta` applied from unpushed work that is not in the repo; Flyway validation then fails on startup. Reporting migrations are unaffected — a new one there does run.
- Never edit an applied migration; add a new one.
- **Loading a list of brothers (Encargados → «Cargar lista»):** pasted from Excel, a CSV or typed (`features/admin/utils/lista-hermanos.ts` parses it); `POST /api/v1/encargados/admin/importar` with `simular: true` only reports what each row would do (`crear` / `existe` / `error` + reason), same rules as creating one (Chilean mobile, name and phone not used by someone else); without it, creates the valid rows and leaves existing ones untouched. The self sign-up page no longer asks for an avatar (it was never shown); the `avatar` column stays and defaults to 1.
- **Registration status is public**: `GET /api/v1/encargados/registro` → `{abierto}` (no session, only that flag). The login hides «Crear perfil» and `/profile` redirects to the login when the admin closed registration (Encargados page); the server still rejects sign-ups (`registro_cerrado`).
- The map tutorial opens only from the «?» button (never by itself). Territory numbers on the field map and the viewer share `DISENO_NUMEROS` / `TAMANO_NUMERO_TERRITORIO` (`core/map/base-map.ts`): large on purpose, for users with poor eyesight — do not shrink them from zoom 15 in; below that they scale down and the pill's fixed border is narrow so more numbers fit when zoomed out. The pill color is the territory's situation (`situacionDe` in `core/map/estado-publico.ts`, same rule as the viewer): green completed, yellow in progress, white not worked this cycle (never, or since a cycle close).
- **Registering an outing from the panel (ADR 0021):** «Registrar salida» (`/admin/registrar`, `POST /api/v1/reports/admin/salidas`) records what a brother reported (e.g. by WhatsApp) as a normal `salida` in his name — one or several territories per outing (`POST …/salidas/varias`, all or nothing, one WhatsApp with all of them, like the app) — summed like the app's (`ReportService.registrarDelAdministrador`), any non-future day, `nota` starts with «Registrado desde el panel». No account is created; a name matching an encargado links his id. The summary WhatsApp goes to the number set in the panel (`app_config.whatsapp_administrador`, `DestinoWhatsApp` for admin sessions), falling back to `WHATSAPP_DESTINATION`. Closing a cycle can start the new one on an earlier day (`desde`, e.g. a campaign start); it is refused if reports were already sent since that day. If the cycle was already closed, «Cambiar el día en que empezó» (`POST …/ciclos/inicio`) moves the open cycle's start (and the previous one's end and the last close's reset `fecha_predicacion`) without closing another one or reordering reports; it reports how many reports sent between that day and the close stayed in the previous cycle.
- **Printable territory cards** (panel → «Tarjetas», `/admin/tarjetas`): one A4 sheet per territory (map captured with `CorreccionMap.capturarAlTerminar()` + block checklist with what is already preached this cycle; a completed territory prints blank for the new cycle). Pure helpers in `features/admin/utils/tarjeta.ts`; printed from a hidden `srcdoc` iframe (no pop-up). Frontend only.
- **Reports are never deleted to change a territory's state.** A territory's state is always its last report; a cycle close or an admin correction *adds* a report (ADR 0011). An admin annulment sets `anulado_en` + `reemplaza_a` (V8, ADR 0014) so history is preserved but ignored by state queries.
- **`fecha` is when a report was sent and orders the reports; `fecha_predicacion` + `turno` (V9, ADR 0018) are the day and shift preached**, chosen in the send dialog (today, yesterday or up to 7 days back; `features/map/utils/dia.ts`, validated by `DiaDePredicacion` in Chile time). The S-13, admin panel (`fechaDeTrabajo`), public state and WhatsApp show the preaching day. Never back-date `fecha`: it would reorder the cumulative state (ADR 0013).

## Verification Checklist

Before declaring work done:

1. Frontend: `pnpm run lint` && `pnpm run build` && `pnpm test -- --run` all pass.
2. Backend: `mvn verify -Pcoverage` passes. If you touched DB/migration/security code, run the full IT set locally: `TESTCONTAINERS_RYUK_DISABLED=true mvn verify -Pcoverage -B -Ddocker.available=true` (CI already runs it with `-Ddocker.available=true`). Note: a plain local run skips the docker-gated ITs and `territory-service` then fails the 40% gate — expected without the IT environment.
3. No new cross-feature imports from `features/admin` → `features/map`.
4. New architecture decision → new ADR under `docs/adr/`.
