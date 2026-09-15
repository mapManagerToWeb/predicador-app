# ADR 0003: HikariCP pool tuned for Neon scale-to-zero

## Status

Accepted

## Context

The production database is Neon (serverless Postgres + PostGIS) with
scale-to-zero. With a minimum pool size > 0, HikariCP's HouseKeeper recreates
idle connections every 30 s, waking the Neon compute in a continuous cycle that
consumes CU-hours on the free plan. Additionally, the post-wake-up burst with a
pool of 3 connections exhausted the pool and produced intermittent 500/503
errors.

## Decision

- HikariCP tuned in the config-server sources
  (`backend/config-server/src/main/resources/config/territory-service.yml:14-24`
  and `reporting-service.yml:14-24`): `minimum-idle: 0`, `idle-timeout: 30000`,
  `maximum-pool-size: 6`, `max-lifetime: 300000`, `connection-timeout: 15000`,
  `keepalive-time: 0`.
- `management.health.db.enabled: false` so health checks never open DB
  connections (`backend/territory-service/src/main/resources/application.yml:85-93`,
  same in reporting-service).
- Eureka heartbeats use `/actuator/info` instead of `/actuator/health`
  (`config/territory-service.yml:65-68`, `config/reporting-service.yml:66-69`).
- `open-in-view: false` (no EntityManager held open during view rendering).
- Flyway connects through `DB_URL_UNPOOLED` (direct connection): PgBouncer in
  transaction mode does not support DDL/prepared statements.

## Consequences

- No latent connections in idle, so the Neon compute can actually sleep.
- The post-wake-up burst is absorbed by the 6-connection pool plus the 15 s
  connection timeout instead of surfacing as 500/503 to users.