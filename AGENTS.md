# Repository Instructions

## Codebase Memory (Knowledge Graph)

The repository is indexed into the codebase-memory knowledge graph under the project name **`predicador-app`** (indexed 2026-08-09).

- Prefer graph tools over grep/glob for code discovery (see the global `codebase-memory-mcp` instructions in `~/.config/opencode/AGENTS.md`).
- **Interactive graph UI**: `http://127.0.0.1:9749/` — the codebase-memory-mcp server exposes a persisted graph visualization on port 9749. Start it with `codebase-memory-mcp` (the MCP server auto-starts the UI when running). Use `lsof -nP -iTCP:9749` to check if it is up.
- After significant refactors or new features, refresh the index with `index_repository` (project name `predicador-app`, root is the repo root).

### Key graph facts (from `get_architecture`)

- **Security hot path** lives in `backend/shared`: `SessionTokenService.verify` (41 callers), `TokenValidator.validate` (22), `SessionTokenService.issue` (19), `SessionAuthFilter` + its `Rule.any` (18). Shared is the architectural core (`reporting-service → shared` 89 calls, `api-gateway → reporting-service` 24) — treat changes here as high-risk.
- **Reporting owns WhatsApp**: `WhatsAppMessageClient.sendTemplateMessage` (15 callers), `WhatsAppSendService.getStatus` (19), `WhatsAppDelivery.getStatusCode` (23).
- **Frontend** is highly cohesive (~0.98–0.99) around `map-geometry.ts` (`snapToContour`, `pointInPolygon`, `projectOnSegment`) and `map-style.service.ts`, plus `profile.ProfilePage.save`.
- **Routes** (52 total): `/api/v1/territories*`, `/api/v1/encargados*`, `/api/v1/reports*`, `/api/v1/rum`; gateway has `/fallback/territory` and `/fallback/reporting` fallbacks.
- **ADRs** live in `docs/adr/` (001–004).

## Layout

- `backend/` is a Maven reactor (Java 25, Spring Boot 4.0, Spring Cloud 2025.1) with `shared`, `config-server`, `discovery-server`, `api-gateway`, `territory-service`, and `reporting-service`; run Maven commands from this directory. `shared/` holds cross-service security (HMAC tokens, `SessionAuthFilter`) used by gateway, territory, and reporting.
- `predicador-frontend/` is a separate Angular 22 SSR/PWA app; its nested `AGENTS.md` contains frontend-specific guidance and applies to changes under that directory.
- `docker-compose.yml` builds the five backend services **plus a `rabbitmq` broker** (territory and reporting depend on it; WhatsApp async sends flow through it). Observability services are opt-in via the `observability` profile.
- `CLAUDE.md` holds the deeper context (security model, WhatsApp async flow, frontend conventions/gotchas); keep the two consistent when rules change.

## Verification

- Frontend setup: run `corepack enable` (once) then `pnpm install` in `predicador-frontend/` (Node 22 is used by CI). The pnpm version is pinned in `package.json` (`packageManager: pnpm@9.15.0`).
- Frontend checks, in CI order: `pnpm run lint`, `npx ng build --configuration=production`, `pnpm test -- --run --coverage`, then `pnpm run build`.
- Run one frontend spec with `pnpm test -- src/path/to/file.spec.ts` from `predicador-frontend/`; tests use Vitest, jsdom, and `src/test-setup.ts`. Coverage thresholds are low (30/30/30/20) — passing coverage does not mean good coverage.
- Backend full verification: from `backend/`, run `mvn verify -B`; local tests needing the database require PostgreSQL/PostGIS and `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD`.
- Backend focused checks can use `mvn -pl <module> test` from `backend/`; JaCoCo reports are generated with `mvn verify -Pcoverage` (40% line/instruction minimum enforced at verify).
- CI backend uses Java 25 and a `postgis/postgis:16-3.4` service with database `predicador_test`.

## Runtime

- Local backend services must start in this order: `config-server` (`8888`), `discovery-server` (`8761`), `api-gateway` (`8080`), `territory-service` (`8081`), `reporting-service` (`8082`). Management ports: gateway `8090`, territory `8091`, reporting `8092`.
- For Docker setup, copy `.env.example` to `.env` before `docker-compose up --build`; `.env` and `application-local.yml` are ignored and must not be committed. Compose fails fast (`:?` interpolation) unless `.env` sets `SESSION_SECRET` and `ADMIN_USERNAME`; the gateway additionally refuses to start outside the `local` profile without `ADMIN_PASSWORD_BCRYPT`.
- `SESSION_SECRET` must be shared by gateway, territory, and reporting services for HMAC token interoperability; use a real secret in deployed environments. Generate with `openssl rand -hex 32`; a BCrypt admin password with `htpasswd -bnBC 10 "" '<pass>' | tr -d ':\n'`.
- Auth is strict by default: outside the `local` profile the gateway and shared security throw at startup unless `SESSION_SECRET` is ≥32 bytes and `ADMIN_PASSWORD_BCRYPT` is set. Enforcement only soft-disables when the secret is empty AND the profile is non-strict/local.
- `config-server` serves config from its classpath (`native` profile, the compose default); don't point its `SPRING_PROFILES_ACTIVE` elsewhere or it will try a git repo with no URI.
- Start optional observability with `docker-compose --profile observability up -d`; OTLP export is disabled unless the relevant `OTEL_*` variables are set.

## Repository Rules

- Frontend production builds include SSR and the service worker; browser-only APIs must remain guarded for SSR execution.
- Flyway migrations live with the database-owning backend services; schema changes must be represented by a new migration rather than editing an applied migration.
- `territory-service` and `reporting-service` share one Postgres DB but version migrations separately: territory runs Flyway against history table `flyway_schema_history_territory`; reporting has Flyway **disabled**, so its `db/migration/*.sql` must be applied manually and a new migration there will NOT run at startup.
- Do not use generated/build output (`target/`, `dist/`, `coverage/`, `.scannerwork/`) as source files; these are ignored artifacts.
- **Frontend uses pnpm exclusively**: `package.json` pins `packageManager: pnpm@9.15.0` (via Corepack), `angular.json` sets `cli.packageManager: "pnpm"`, CI runs `pnpm install --frozen-lockfile` (pnpm 9 has no `pnpm ci`), and `pnpm-lock.yaml` is the only committed lockfile (`package-lock.json` is removed). Always use `pnpm` (never npm) for frontend installs and scripts.
