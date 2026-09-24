# ADR 0006: Self-hosted PostgreSQL/PostGIS container replaces Neon

## Status

Accepted (supersedes the Neon-specific motivation of ADR 0003)

## Context

The production database lived on Neon's free tier, which was about to run out
of quota. The backend already runs with `docker-compose` on an Oracle VPS with
spare capacity, and the database is small (~18 MB: 708 manzanas, reports,
encargados).

## Decision

- Add a `postgres` service to `docker-compose.yml` using
  `imresamu/postgis:18-3.6`, the same major versions Neon ran (PostgreSQL 18.6,
  PostGIS 3.6), with a named volume `postgres_data` mounted at
  `/var/lib/postgresql` (PG 18 image layout). The port is bound to
  `127.0.0.1` only; remote administration goes through an SSH tunnel.
- `territory-service` and `reporting-service` wait for `db-import` (which
  waits for a healthy `postgres`). `DB_URL`/`DB_USERNAME` default to the container; only
  `DB_PASSWORD` must be set in `.env`.
- Data is copied automatically by the one-shot `db-import` compose service
  (`scripts/db/import-from-neon.sh`), which territory and reporting wait for
  (`service_completed_successfully`). It only acts when the database is empty
  and `NEON_URL` is set, restores in a single transaction, and uses `pg_dump` 18
  (custom format, `--no-owner --no-privileges`) excluding the Neon-only
  `pg_session_jwt` extension (which owns the `auth` schema) and the `pgrst`
  schema. Everything else is copied as-is, including `neon_auth` (Neon Auth
  tables, unused by the app) and both Flyway history tables, so no migration
  re-runs. The script compares per-table row counts against Neon.

## Consequences

- No more Neon quota limits; the database shares the VPS with the services.
- Backups become our responsibility: the Neon dump job in `ci-backend.yml`
  stops being useful once Neon is decommissioned and must be replaced by a
  backup of the VPS container.
- The HikariCP/health-check tuning from ADR 0003 is no longer required but is
  harmless; it can be relaxed later (e.g. `minimum-idle > 0`, DB health check
  back on).
