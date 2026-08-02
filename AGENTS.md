# Repository Instructions

## Layout

- `backend/` is a Maven reactor with `shared`, `config-server`, `discovery-server`, `api-gateway`, `territory-service`, and `reporting-service`; run Maven commands from this directory. `shared/` holds cross-service security (HMAC tokens, `SessionAuthFilter`) used by gateway, territory, and reporting.
- `predicador-frontend/` is a separate Angular 22 SSR/PWA app; its nested `AGENTS.md` contains frontend-specific guidance and applies to changes under that directory.
- `docker-compose.yml` builds the five backend services. Observability services are opt-in via the `observability` profile.

## Verification

- Frontend setup: run `npm ci` in `predicador-frontend/` (Node 22 is used by CI).
- Frontend checks, in CI order: `npm run lint`, `npx ng build --configuration=production`, `npm test -- --run --coverage`, then `npm run build`.
- Run one frontend spec with `npm test -- src/path/to/file.spec.ts` from `predicador-frontend/`; tests use Vitest, jsdom, and `src/test-setup.ts`.
- Backend full verification: from `backend/`, run `mvn verify -B`; local tests needing the database require PostgreSQL/PostGIS and `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD`.
- Backend focused checks can use `mvn -pl <module> test` from `backend/`; JaCoCo reports are generated with `mvn verify -Pcoverage`.
- CI backend uses Java 25 and a `postgis/postgis:16-3.4` service with database `predicador_test`.

## Runtime

- Local backend services must start in this order: `config-server` (`8888`), `discovery-server` (`8761`), `api-gateway` (`8080`), `territory-service` (`8081`), `reporting-service` (`8082`).
- For Docker setup, copy `.env.example` to `.env` before `docker-compose up --build`; `.env` and application-local configuration are ignored and must not be committed. Compose fails fast (`:?` interpolation) unless `.env` sets `SESSION_SECRET`, `ADMIN_USERNAME`, and (non-local) `ADMIN_PASSWORD_BCRYPT`.
- `SESSION_SECRET` must be shared by gateway, territory, and reporting services for HMAC token interoperability; use a real secret in deployed environments. Generate with `openssl rand -hex 32`; a BCrypt admin password with `htpasswd -bnBC 10 "" '<pass>' | tr -d ':\n'`.
- Auth is strict by default: outside the `local` profile the gateway and shared security throw at startup unless `SESSION_SECRET` is ≥32 bytes and `ADMIN_PASSWORD_BCRYPT` is set. Enforcement only soft-disables when the secret is empty AND the profile is non-strict/local.
- `config-server` serves config from its classpath (`native` profile, the default); don't point its `SPRING_PROFILES_ACTIVE` elsewhere or it will try a git repo with no URI.
- Start optional observability with `docker-compose --profile observability up -d`; OTLP export is disabled unless the relevant `OTEL_*` variables are set.

## Repository Rules

- Frontend production builds include SSR and the service worker; browser-only APIs must remain guarded for SSR execution.
- Flyway migrations live with the database-owning backend services; schema changes must be represented by a new migration rather than editing an applied migration.
- `territory-service` and `reporting-service` share one Postgres DB but version migrations separately: territory runs Flyway against history table `flyway_schema_history_territory`; reporting has Flyway **disabled**, so its `db/migration/*.sql` must be applied manually and a new migration there will NOT run at startup.
- Do not use generated/build output (`target/`, `dist/`, `coverage/`, `.scannerwork/`) as source files; these are ignored artifacts.
