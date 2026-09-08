## 1. Resolve merge conflict in reporting-service config

- [x] 1.1 Open `backend/reporting-service/src/main/resources/application.yml`, delete the `<<<<<<< HEAD / ======= / >>>>>>> feat/redesign` markers, keep the block with `flyway.enabled: true` and full Flyway properties (baseline, locations, validate, separate history table, unpooled url/user/password). Verify by running `mvn -pl reporting-service compile -B` from `backend/` — compilation must succeed.
- [x] 1.2 Same file: delete the `<<<<<<< HEAD / ======= / >>>>>>> feat/redesign` markers around `default-image-url` in the whatsapp config. Verify `mvn -pl reporting-service test -B` passes.

## 2. Document DB_URL_UNPOOLED in .env.example

- [x] 2.1 Add `DB_URL_UNPOOLED=jdbc:postgresql://<host>/predicador` to `.env.example` under the PostgreSQL section, with a comment explaining the role: "Direct connection (sin -pooler) — required by Flyway for migrations because PgBouncer in transaction mode doesn't support DDL/prepared statements". Verify by reading the file and confirming the variable appears with comment.
- [ ] 2.2 (Operator action, not code) Update the deployment `.env` and CI/CD secrets to set `DB_URL_UNPOOLED` to the Neon endpoint without `-pooler`. Verify by checking `application.yml` resolves `${DB_URL_UNPOOLED}` to the unpooled string at boot (logs will show the URL).

## 3. Create V0__initial_schema.sql for territory-service

- [x] 3.1 Create `backend/territory-service/src/main/resources/db/migration/V0__initial_schema.sql` containing: `CREATE EXTENSION IF NOT EXISTS postgis;` plus `CREATE TABLE IF NOT EXISTS manzanas_territorio (...)` and `CREATE TABLE IF NOT EXISTS territory_settings (...)`. Use the column definitions that match the JPA entities `ManzanaTerritorio` and `TerritoryColor` (geometry as `geometry(GeometryZ, 4326)` for manzanas). Verify by running `mvn -pl territory-service test -B` from `backend/` against the postgis test container (the test DB must accept the migration).
- [x] 3.2 Verify migration is idempotent: re-run the test suite a second time. Verify Flyway doesn't fail (uses `IF NOT EXISTS`).

## 4. Create V0__initial_schema.sql for reporting-service

- [x] 4.1 Create `backend/reporting-service/src/main/resources/db/migration/V0__initial_schema.sql` containing `CREATE TABLE IF NOT EXISTS` for `registro_predicacion`, `encargados`, and `whatsapp_delivery_idempotency`. Column definitions must match JPA entities `Report`, `Encargado`, `WhatsAppDelivery`. Note: `V2__production_quality_hardening.sql` already creates `whatsapp_delivery_idempotency` with `IF NOT EXISTS` — both V0 and V2 can safely coexist because V2 is already idempotent; V0 is the canonical source for the table definition, V2 adds the unique index. Verify by running `mvn -pl reporting-service test -B` from `backend/` against the postgis test container.
- [x] 4.2 Verify migration is idempotent against existing schema: locally run the test twice. Verify no duplicate table errors.

## 5. Backup Neon database in CI

- [x] 5.1 Modify `.github/workflows/ci-backend.yml`: add a new job `backup` that runs `only-on-push-to-main` (not PRs), depends on `test` succeeding, runs `pg_dump` against `${NEON_DATABASE_URL_DIRECT}` using `actions/checkout@v4` setup, then uploads the gzipped dump as artifact with 30-day retention. Verify by reading the workflow file and confirming the job structure is correct.
- [ ] 5.2 (Operator action) Add GitHub Secrets `NEON_DATABASE_URL_DIRECT`, `NEON_DATABASE_USER`, `NEON_DATABASE_PASSWORD`. Verify by triggering the workflow on main and confirming the artifact appears in the Actions run.

## 6. End-to-end verification

- [ ] 6.1 Spin up local stack with `docker-compose up --build`. Verify all five backend services start without errors. Verify the log lines for `territory-service` and `reporting-service` show `Flyway Community Edition X.Y.Z by Redgate` and successful migration execution.
- [ ] 6.2 Smoke-test the API: hit `GET /api/v1/territories` and `GET /api/v1/reports` through the gateway. Verify both return 200 with data (or empty list, not 500).
- [ ] 6.3 (Documentation) Update `README.md` (or `.env.example` comment) to note that the Neon plan must include PostGIS, or document the manual step `CREATE EXTENSION postgis` before first deploy if not in the plan. Verify by reading the updated docs.