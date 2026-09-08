## Context

El backend es una arquitectura de microservicios Spring Boot 4 sobre Maven, con `territory-service` y `reporting-service` compartiendo una sola base de datos PostgreSQL en Neon. La aplicación ya tiene muchas decisiones bien pensadas para Neon (scale-to-zero, pool mínimo, health checks no DB-tocantes, Flyway con conexión directa). Sin embargo, dos defectos rompen el arranque correcto y un riesgo estructural impide la reproducibilidad del esquema. Ver `proposal.md` para la motivación completa.

## Goals / Non-Goals

**Goals:**
- Hacer que `reporting-service` arranque sin errores de parseo YAML.
- Documentar y propagar correctamente la variable `DB_URL_UNPOOLED` para que las migraciones Flyway usen conexión directa (no PgBouncer).
- Versionar el esquema completo de la base en Flyway para que cualquier ambiente Neon pueda recrearlo desde cero.
- Mantener compatibilidad con el patrón de historial Flyway separado por servicio (`flyway_schema_history_territory` y `_reporting`).

**Non-Goals:**
- No refactorizar entidades JPA existentes.
- No cambiar la arquitectura de Flyway (mantener tablas de historial separadas, no unificar).
- No migrar lógica de aplicación fuera de scope (transacciones, validación, excepciones — eso está cubierto por `backend-correctness-hardening`).
- No agregar Pool PgBouncer propio (Neon ya lo provee vía `-pooler`).
- No configurar restore automatizado (PITR de Neon es responsabilidad del operador).

## Decisions

### Decision 1: Merge conflict resolution — eliminar markers y dejar `flyway.enabled: true`

**Elección:** Eliminar los markers `<<<<<<< HEAD` / `=======` / `>>>>>>> feat/redesign` y mantener el bloque que dice `flyway.enabled: true` con todas las propiedades de Flyway (tabla de historial separada, URL unpooled, etc.).

**Rationale:** La rama `feat/redesign` agregó el bloque completo de configuración Flyway con tabla de historial separada y conexión unpooled — todo eso es lo correcto. La rama `HEAD` (main) solo tiene `enabled: false`, lo que rompe la migración automática.

### Decision 2: Conexión unpooled — una sola variable compartida

**Elección:** Definir `DB_URL_UNPOOLED` como variable de ambiente independiente en `.env.example`, con comentario explicando que es la URL sin el sufijo `-pooler`. La config de Spring Boot la usa como fallback a `DB_URL` para evitar fallos en desarrollo local sin pooler.

### Decision 3: Schema inicial con `V0__initial_schema.sql` en cada servicio

**Elección:** Crear `V0__initial_schema.sql` en `territory-service` (con `CREATE EXTENSION postgis`) y otro en `reporting-service`. Usar `CREATE TABLE IF NOT EXISTS` e `IF NOT EXISTS` en todos los DDL para garantizar idempotencia. `baseline-on-migrate: true` + `baseline-version: 0` ya está configurado para detectar bases no-vacías.

### Decision 4: Backup automatizado en CI

**Elección:** Agregar un job de backup en `ci-backend.yml` que corra `pg_dump` contra la URL unpooled de Neon después de los tests, guardando el dump como artifact de 30 días. Solo se ejecuta en push a `main`.

### Decision 5: Documentar configuración `.env.example`

**Elección:** Modificar `.env.example` para documentar `DB_URL_UNPOOLED` con comentario claro. No modificar CI secrets ni `.env` real.

## Risks / Trade-offs

**[Risk] PostGIS no disponible en Neon free tier** → Mitigation: verificar que el plan Neon incluye PostGIS. La migración V0 fallará con error claro si no está.

**[Risk] `baseline-version: 0` salta V0 en bases existentes** → Con `baseline-on-migrate: true` y `baseline-version: 0`, Flyway marca V0 como baseline en bases existentes y **no ejecuta V0**. Si la base ya tiene las tablas, esto es correcto. Si falta algo (ej. PostGIS extension), V0 no lo crea automáticamente. **Regla: V0 solo debe usar `CREATE TABLE/INDEX IF NOT EXISTS` y `CREATE EXTENSION IF NOT EXISTS` — nada que modifique esquema existente.**

**[Risk] Conflict entre V0 y migraciones existentes** → Mitigation: `CREATE INDEX IF NOT EXISTS` hace las migraciones idempotentes. `baseline-on-migrate` evita re-ejecución contra base existente.

**[Risk] Backup en CI consume minutos de GitHub Actions** → Mitigation: ejecutar solo en push a `main`, no en PRs.

## Migration Plan

1. Resolver merge conflict en `reporting-service/application.yml`.
2. Documentar `DB_URL_UNPOOLED` en `.env.example`.
3. Crear `V0__initial_schema.sql` en ambos servicios. Probar primero en un branch Neon.
4. Agregar job de backup en `ci-backend.yml`. Requiere agregar secrets de Neon en GitHub.

**Rollback:** Si V0 falla, revertir el commit. Flyway detectará el checksum igual y será no-op.

## Open Questions

Ninguna — las decisiones técnicas están verificadas con docs oficiales de Spring Boot 4.0, Flyway y Neon.