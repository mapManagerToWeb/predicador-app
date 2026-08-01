# Production Quality Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the documented critical/high risks and make the quality gates reflect verified backend, frontend, deployment, and integration behavior.

**Architecture:** Preserve the existing gateway plus service architecture. Enforce authentication and ownership at backend boundaries, keep internal services on the Compose network, and improve existing Controller → Service → Repository and Angular feature-based boundaries without introducing a new framework.

**Tech Stack:** Java 21, Spring Boot 4, Spring Cloud 2025.1, Maven, PostgreSQL/PostGIS, Flyway, Angular 22, TypeScript 6, Vitest, Docker Compose, GitHub Actions, Testcontainers, JaCoCo.

## Global Constraints

- Preserve unrelated existing working-tree changes; never reset or checkout them.
- Missing production secrets must fail closed; only an explicit local profile may allow local insecure configuration.
- The backend is the authority for roles and resource ownership; browser storage is never an authorization source.
- Flyway is the only production schema authority; Hibernate must validate rather than update.
- Browser-only APIs remain guarded for SSR execution.
- Do not introduce a full Clean Architecture/DDD rewrite or a new state-management framework.
- Run focused tests after each task and full verification before declaring completion.

---

### Task 1: Fail-Closed Session and Admin Configuration

**Files:**
- Modify: `backend/shared/src/main/java/com/predicador/shared/security/SessionTokenService.java`
- Modify: `backend/shared/src/main/java/com/predicador/shared/security/SessionAuthFilter.java`
- Modify: `backend/api-gateway/src/main/java/com/predicador/gateway/config/AuthController.java`
- Modify: `backend/config-server/src/main/resources/config/api-gateway.yml`
- Modify: `backend/config-server/src/main/resources/config/reporting-service.yml`
- Modify: `backend/config-server/src/main/resources/config/territory-service.yml`
- Modify: `docker-compose.yml`
- Test: `backend/shared/src/test/java/com/predicador/shared/security/SessionTokenServiceTest.java`
- Test: gateway authentication controller tests under `backend/api-gateway/src/test/`

**Interfaces:**
- `SessionTokenService` continues to expose `issue`, `verify`, and `isConfigured`, but construction rejects a missing/undersized secret outside the explicit local profile.
- `AuthController` accepts only configured admin credentials and still returns the existing session-token response shape on success.

- [ ] **Step 1: Add failing tests for missing and undersized secrets.**

  Assert that the service rejects an empty secret and a secret shorter than 32 bytes in strict mode, while a test-provided 32-byte secret can issue and verify a token.

- [ ] **Step 2: Add failing tests for insecure admin configuration.**

  Assert that blank credentials and the literal `admin/admin` fallback cannot authenticate, and that a configured BCrypt hash still authenticates successfully.

- [ ] **Step 3: Implement strict secret validation.**

  Add an explicit strict/local configuration flag with a secure default. Validate UTF-8 secret length during construction and remove the filter's request-time fail-open branch in strict mode. Keep `isConfigured()` for diagnostics and tests.

- [ ] **Step 4: Remove insecure defaults from config and Compose.**

  Replace `${SESSION_SECRET:-}`, `${ADMIN_USERNAME:-admin}`, and `${ADMIN_PASSWORD:-admin}` production fallbacks with required environment values. Keep local setup explicit in a documented local profile rather than silently accepting empty values.

- [ ] **Step 5: Run focused backend tests.**

  Run from `backend/`: `mvn -pl shared,api-gateway test`.

  Expected: all focused tests pass and no test depends on an implicit empty secret.

---

### Task 2: Owner Authorization and Internal Network Boundaries

**Files:**
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/config/SecurityConfig.java`
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/controller/EncargadoController.java`
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/controller/ReportController.java`
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/service/ReportService.java`
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/service/EncargadoService.java`
- Test: reporting controller/service tests under `backend/reporting-service/src/test/`
- Modify: `docker-compose.yml`
- Modify: `.github/workflows/docker.yml`

**Interfaces:**
- Controllers read `SessionAuthFilter.ATTR_TOKEN` and pass `SessionToken` to authorization-aware service methods.
- Owner checks compare `String.valueOf(encargadoId)` with `token.subject()` for `ROLE_ENCARGADO`; `ROLE_ADMIN` bypasses owner restrictions.
- Unauthorized ownership attempts return `403` `ProblemDetail`, not an empty successful response.

- [ ] **Step 1: Add failing owner/admin tests.**

  Cover report reads filtered by another encargado, report creation with a mismatched `encargadoId`, encargado updates for another owner, and admin access to global operations.

- [ ] **Step 2: Implement a single authorization helper.**

  Add a focused service/helper method that accepts the token and target owner ID, returns for admin or matching owner, and throws a typed access exception otherwise. Do not duplicate string comparisons across controllers.

- [ ] **Step 3: Apply the helper to every protected reporting operation.**

  Enforce ownership for report list filters, report creation, WhatsApp sends, encargado updates, and owner-specific queries. Leave only login/registration endpoints public.

- [ ] **Step 4: Remove host ports for internal services.**

  In default Compose, retain `8080:8080` only for the gateway. Use service DNS names and internal `expose`/healthchecks for Config Server, Eureka, territory, and reporting.

- [ ] **Step 5: Fix Docker build context and verify it.**

  Change `.github/workflows/docker.yml` to `context: backend` while retaining `dockerfile: <service>/Dockerfile`, then run `docker compose config` and a representative `docker build` when Docker is available.

- [ ] **Step 6: Run focused reporting tests.**

  Run from `backend/`: `mvn -pl reporting-service test`.

  Expected: owner mismatch cases return `403`; admin and matching-owner cases remain successful.

---

### Task 3: Schema Authority, Bounded Queries, and External Delivery

**Files:**
- Modify: `backend/territory-service/src/main/resources/application.yml`
- Modify: `backend/reporting-service/src/main/resources/application.yml`
- Modify: `backend/config-server/src/main/resources/config/territory-service.yml`
- Modify: `backend/config-server/src/main/resources/config/reporting-service.yml`
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/repository/ReportRepository.java`
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/repository/EncargadoRepository.java`
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/service/ReportService.java`
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/service/EncargadoService.java`
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/service/ReportSendService.java`
- Modify: WhatsApp client classes under `backend/reporting-service/src/main/java/com/predicador/reporting/client/`
- Modify/Create: next Flyway migration under `backend/reporting-service/src/main/resources/db/migration/`
- Test: reporting repository/service/client tests under `backend/reporting-service/src/test/`

**Interfaces:**
- List methods use bounded `Pageable`/`Page<T>` or an explicit maximum batch size.
- External client methods return typed response records and throw typed integration exceptions on timeout or non-success responses.
- WhatsApp send service accepts an idempotency key and returns a stable result for repeated keys.

- [ ] **Step 1: Add failing tests for schema mode and bounded queries.**

  Assert production configuration resolves `ddl-auto=validate`, list requests reject oversized pages/batches, and repository methods receive the requested bounded pagination.

- [ ] **Step 2: Add the unique database constraint and race test.**

  Create a new migration for the natural encargado identity used by `buscarOCrear`. Test duplicate insertion handling and return the existing record after a unique-constraint collision.

- [ ] **Step 3: Implement pagination and batch limits.**

  Add validated page/size parameters with safe defaults and maximums. Limit `territorios` batch input before repository access and preserve deterministic ordering.

- [ ] **Step 4: Configure bounded HTTP clients.**

  Set connection and read timeouts in `RestClientConfig`, translate timeout/non-2xx responses to a typed exception, and remove broad exception catches from WhatsApp clients.

- [ ] **Step 5: Correct delivery status and add idempotency.**

  Persist or otherwise atomically reserve the idempotency key at the reporting boundary, return the prior result for duplicates, and map integration failures to `ProblemDetail` with a non-2xx status.

- [ ] **Step 6: Remove PII from logs and raw maps.**

  Replace phone/name/payload INFO logs with opaque IDs and structured outcome fields. Define records for stable external response bodies and parse unknown fields safely.

- [ ] **Step 7: Run focused backend tests.**

  Run from `backend/`: `mvn -pl reporting-service,territory-service test`.

  Expected: migrations validate, bounded requests are enforced, duplicate creation is safe, timeouts are deterministic, and failed sends are not reported as HTTP 200.

---

### Task 4: Frontend Session State, Capture Reliability, and Loading

**Files:**
- Modify: `predicador-frontend/src/app/core/services/profile.ts`
- Modify: `predicador-frontend/src/app/core/services/auth-token.ts`
- Modify: `predicador-frontend/src/app/core/guards/profile.guard.ts`
- Modify: `predicador-frontend/src/app/core/guards/admin.guard.ts`
- Modify: `predicador-frontend/src/app/features/map/services/map-data-persistence.service.ts`
- Modify: `predicador-frontend/src/app/features/map/services/map-capture.service.ts`
- Modify: `predicador-frontend/src/app/app.config.ts`
- Modify: `predicador-frontend/tsconfig.json`
- Modify: `predicador-frontend/eslint.config.js`
- Modify: relevant frontend specs beside the changed services

**Interfaces:**
- `Profile.load()` returns `UserProfile | null` after runtime shape validation and never throws for malformed storage.
- Guards use `AuthTokenService.hasToken()` for session presence; admin UI state never grants backend permission.
- Capture/send always restores its loading flag in a `finally` block.

- [ ] **Step 1: Add failing profile and guard tests.**

  Cover malformed JSON, missing required profile fields, absent session token, and valid session/profile behavior. Confirm SSR execution does not access unavailable browser globals.

- [ ] **Step 2: Implement runtime profile validation.**

  Add a narrow type guard for `UserProfile`, catch JSON parse/storage errors, and clear invalid storage before returning `null`.

- [ ] **Step 3: Stop using stored role/profile as authorization.**

  Make route guards require actual session presence for protected application routes. Keep admin login navigation available, but rely on backend `403` responses for admin operations; clear stale role/profile state on logout or unauthorized responses.

- [ ] **Step 4: Add failing capture cleanup test and implement `try/finally`.**

  Force screenshot or send failure and assert `enviando` returns to `false` and capture preparation is restored.

- [ ] **Step 5: Replace eager module preloading.**

  Configure a selective preloading strategy or no preloading for the map route so the map and screenshot libraries load only when the route is opened.

- [ ] **Step 6: Enable strict TypeScript and fix compiler findings.**

  Turn on the repository’s required strict flags, correct nullability/indexing errors, remove newly exposed `any` values, centralize duplicate map constants, and move all ESLint ignores into flat config.

- [ ] **Step 7: Run frontend focused checks.**

  Run from `predicador-frontend/`: `npm test -- src/app/core/services/profile.spec.ts src/app/core/guards/profile.guard.spec.ts` and `npm run lint`.

  Expected: focused tests pass, SSR guards remain safe, and lint reports no new errors.

---

### Task 5: Cookie Session Transport and CSRF Protection

**Files:**
- Modify: `backend/api-gateway/src/main/java/com/predicador/gateway/config/AuthController.java`
- Modify: `backend/api-gateway/src/main/java/com/predicador/gateway/config/ActuatorAccessFilter.java`
- Modify: `backend/api-gateway/src/main/java/com/predicador/gateway/config/RouteConfig.java`
- Modify: `backend/shared/src/main/java/com/predicador/shared/security/SessionAuthFilter.java`
- Create: `backend/api-gateway/src/test/java/com/predicador/gateway/config/AuthCookieSecurityTest.java`
- Modify: `predicador-frontend/src/app/core/services/auth-token.ts`
- Modify: `predicador-frontend/src/app/core/interceptors/auth.interceptor.ts`
- Modify: `predicador-frontend/src/app/core/interceptors/error.interceptor.ts`
- Modify: `predicador-frontend/src/app/features/auth/login.ts`
- Create: `predicador-frontend/src/app/core/interceptors/csrf.interceptor.spec.ts`
- Modify: `predicador-frontend/src/app/core/services/auth-token.spec.ts`
- Modify: config-server YAML files and `docker-compose.yml` for cookie/CORS settings

**Interfaces:**
- Successful login sets an `HttpOnly`, `Secure`, `SameSite` session cookie; the response no longer requires the frontend to persist the token value.
- Requests mutate state only with a valid CSRF token/header pair.
- Logout clears the cookie and client signals.

- [ ] **Step 1: Add failing cookie and CSRF tests.**

  Assert login sets cookie attributes, cross-origin requests obey configured origins, missing/invalid CSRF tokens reject mutations, and logout expires the cookie.

- [ ] **Step 2: Implement cookie issuance and verification.**

  Reuse the existing HMAC token payload in the cookie, read it in the gateway/shared filter, and do not accept browser storage as a fallback in production.

- [ ] **Step 3: Implement CSRF token delivery and validation.**

  Issue a non-HttpOnly CSRF token through a safe endpoint/cookie and require the matching header for state-changing requests. Keep health/login bootstrap paths explicit.

- [ ] **Step 4: Migrate the Angular interceptor and logout flow.**

  Use credentialed requests to the gateway, attach the CSRF header for mutations, remove token persistence, and clear reactive auth state on `401/403`.

- [ ] **Step 5: Run focused auth checks.**

  Run gateway security tests and frontend auth specs, then verify a local login, protected GET, protected POST, logout, and rejected forged mutation.

---

### Task 6: Integration Coverage and Quality Gates

**Files:**
- Modify: `backend/pom.xml`
- Create: `backend/territory-service/src/test/java/com/predicador/territory/integration/PostgisIntegrationTest.java`
- Create: `backend/reporting-service/src/test/java/com/predicador/reporting/integration/ReportingSecurityIntegrationTest.java`
- Modify: `predicador-frontend/vitest.config.ts`
- Modify: `predicador-frontend/src/app/core/services/profile.spec.ts`
- Modify: `predicador-frontend/src/app/core/services/auth-token.spec.ts`
- Modify: `predicador-frontend/src/app/core/interceptors/auth.interceptor.spec.ts`
- Modify: `predicador-frontend/src/app/core/interceptors/error.interceptor.spec.ts`
- Create: `predicador-frontend/src/app/core/guards/profile.guard.spec.ts`
- Create: `predicador-frontend/src/app/core/guards/admin.guard.spec.ts`
- Create: `.github/workflows/ci-backend.yml`
- Create: `.github/workflows/ci-frontend.yml`
- Modify: `backend/reporting-service/pom.xml`
- Modify: `docker-compose.yml` or test-specific Compose configuration as needed

**Interfaces:**
- Integration tests use `postgis/postgis:16-3.4` through Testcontainers for spatial behavior.
- JaCoCo check and Vitest thresholds are explicit, staged gates backed by measured coverage.

- [ ] **Step 1: Add Testcontainers PostgreSQL/PostGIS integration tests.**

  Start a PostgreSQL/PostGIS container, run Flyway, and cover geometry persistence/query behavior that H2 cannot represent. Keep unit tests independent from Docker.

- [ ] **Step 2: Add gateway and controller integration tests.**

  Cover filter ordering, public login paths, owner/admin authorization, `ProblemDetail`, rate-limited RUM, and actuator blocking.

- [ ] **Step 3: Add missing frontend behavior tests.**

  Cover login success/failure, profile validation, guards, unauthorized interceptor handling, capture cleanup, and report persistence error paths.

- [ ] **Step 4: Configure JaCoCo enforcement.**

  Add `jacoco:check` to the coverage profile with an initial threshold supported by measured backend coverage, document the number, and increase it only after coverage is added.

- [ ] **Step 5: Reconcile Vitest thresholds with measured coverage.**

  Run `npm test -- --run --coverage`, add tests for high-risk paths, and set thresholds that pass intentionally rather than leaving an unreachable 80/80/80/75 gate.

- [ ] **Step 6: Run CI-equivalent verification locally.**

  Run frontend lint/build/test commands from `AGENTS.md` and `mvn verify -B` from `backend/` with the required database variables or Testcontainers enabled.

---

### Task 7: Infrastructure Hardening and Documentation Reconciliation

**Files:**
- Modify: `backend/api-gateway/Dockerfile`
- Modify: `backend/config-server/Dockerfile`
- Modify: `backend/discovery-server/Dockerfile`
- Modify: `backend/territory-service/Dockerfile`
- Modify: `backend/reporting-service/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `observability/otel-collector/otel-collector-config.yaml`
- Modify: `observability/prometheus/prometheus.yml`
- Modify: Grafana provisioning files if credentials/bindings require it
- Modify: `.github/workflows/security.yml`
- Modify: `docs/architecture-baseline.md`
- Modify: `docs/implementation-plan.md`
- Modify: `docs/quality-report.md`
- Modify: `docs/audit/09-deuda-y-roadmap.md`
- Modify: relevant ADRs

**Interfaces:**
- Images run as non-root users and security scans fail the workflow on configured severity thresholds.
- Documentation reports only verified results and explicitly lists deferred risks.

- [ ] **Step 1: Add non-root Docker users and safe bindings.**

  Create an unprivileged runtime user in each application image, bind observability ports to localhost/admin interfaces, disable collector debug export outside development, and remove Prometheus lifecycle exposure unless explicitly enabled.

- [ ] **Step 2: Make security scans effective.**

  Configure Gitleaks, OWASP Dependency-Check, Trivy, and npm audit steps so findings fail CI according to documented thresholds; do not claim vulnerability results without executing the scanners.

- [ ] **Step 3: Validate Compose and image builds.**

  Run `docker compose config`, build every service with the corrected context, and inspect exposed ports, users, healthchecks, and required environment variables.

- [ ] **Step 4: Reconcile all quality documents.**

  Mark completed items only after test/build evidence, remove contradictions between the audit and implementation plan, update ADR status, and retain a maximum-ten-item prioritized roadmap for remaining work.

- [ ] **Step 5: Run final verification.**

  Run `npm run lint`, `npx ng build --configuration=production`, `npm test -- --run --coverage`, `npm run build`, and `mvn verify -B` from their prescribed directories. Record failures caused by unavailable external services separately from code failures.

## Review checkpoints

- After Task 1: no missing secret or default admin credential can produce an authenticated production session.
- After Task 2: direct service access is removed and owner/admin authorization tests pass.
- After Task 3: schema, query bounds, HTTP timeout, and delivery failure behavior are deterministic.
- After Task 4: frontend SSR, profile, guard, and capture tests pass.
- After Task 6: coverage gates are measurable and CI-equivalent tests pass.
- After Task 7: Compose, Docker, scans, documents, and full verification agree.
