# Production Quality Hardening Design

**Date:** 2026-07-31  
**Scope:** Backend, frontend, Docker/CI y documentación de calidad

## Context

The audit identifies deployment-critical risks in authentication and default
credentials, direct exposure of internal services, incomplete owner
authorization, mutable schemas, unbounded backend operations, fragile external
integration handling, frontend state trusted as authorization, and coverage
gates that do not reflect the current test suite. Existing working-tree
changes are outside this design and must not be reverted.

## Goals

- Make security configuration fail closed outside an explicitly local setup.
- Ensure authorization is enforced by the backend using the signed token
  subject and role.
- Keep internal services behind the gateway and remove insecure Compose defaults.
- Make persistence, external HTTP calls, WhatsApp delivery, and batch APIs
  bounded and observable.
- Remove frontend trust in mutable browser storage while preserving SSR safety.
- Add focused regression, integration, CI, and documentation coverage.

## Non-goals

- No complete Clean Architecture or DDD rewrite.
- No replacement of the existing HMAC token format unless required by the
  cookie migration.
- No broad state-management framework introduction.
- No modification of unrelated user changes already present in the worktree.

## Design

### Security and deployment

`SessionTokenService` and the security configuration will reject missing or
undersized secrets in non-local environments. Tests provide explicit secrets;
local insecure behavior, if retained, is enabled only by an explicit local
profile. Admin credentials will not default to `admin/admin`; production will
require a BCrypt password configuration.

Reporting endpoints will use the authenticated `SessionToken` request
attribute. Encargados may access only resources associated with their subject;
admins may perform global operations. Authentication/registration endpoints
remain public only where required to establish a session.

Compose will publish only the gateway by default. Config Server, Eureka,
territory, reporting, and management interfaces remain on the internal
network. Observability interfaces are local/admin-only and require configured
credentials. The Docker workflow will build with `backend/` as context.

The frontend will not use `localStorage` values as an authorization authority.
The session transport will be migrated to an `HttpOnly`, `Secure`,
`SameSite`-appropriate cookie with matching CORS and CSRF handling. Until that
transport is complete, backend validation remains authoritative and stored role
or profile values are treated as UI hints only.

### Backend correctness and performance

Flyway becomes the sole schema authority; Hibernate uses `validate` outside
tests/local development. Unique constraints and collision handling close the
search/create race. List and batch endpoints receive explicit limits and
pagination where applicable.

External WhatsApp clients receive connection and read timeouts. Delivery
failures map to appropriate non-2xx `ProblemDetail` responses. Idempotency
prevents duplicate sends on retries. Logs exclude phone numbers, names, and
message payloads. External response maps become typed records and broad
exception catches are narrowed.

### Frontend and performance

Profile JSON is parsed through validation and invalid data is discarded.
Capture/send operations restore UI state in `finally`. Route preloading is
selective so the map and screenshot dependencies are not eagerly loaded.
TypeScript strictness is enabled incrementally with type-safe fixes, and
duplicated constants plus obsolete ESLint ignore configuration are removed.
All browser APIs remain guarded for SSR.

### Testing, CI, and documentation

Regression tests cover fail-closed authentication, owner/admin authorization,
pagination and limits, external failures, idempotency, capture cleanup, and
profile validation. PostgreSQL/PostGIS Testcontainers cover spatial/database
behavior. JaCoCo and frontend coverage become intentional, staged quality
gates rather than permanently failing thresholds.

CI verifies lint, builds, tests, Docker builds, secret scanning, dependency
scanning, and image scanning. Architecture, implementation, quality, ADR, and
roadmap documents are updated to reflect verified status and remaining risks.

## Delivery order

1. Security configuration, authorization, Compose exposure, and Docker CI.
2. Schema authority, constraints, pagination, timeouts, error mapping, and
   idempotency.
3. Frontend session/profile safety, capture cleanup, strictness, and preload
   behavior.
4. Integration tests, coverage gates, security CI, and documentation updates.

Each stage must pass its focused tests before the next stage is started. Full
verification follows the repository instructions in `AGENTS.md`.

## Success criteria

- Missing production secrets prevent insecure startup or authentication.
- Direct host access to internal services is unavailable in default Compose.
- An encargado cannot read or mutate another encargado's reports.
- Schema changes are represented by Flyway migrations only.
- External calls have bounded latency and failures are visible as failures.
- Frontend guards and UI state do not grant backend permissions.
- Focused tests and the documented full verification commands pass.
- Documentation accurately distinguishes completed work from deferred risk.
