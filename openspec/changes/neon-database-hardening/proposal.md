## Why

El backend comparte una base de datos PostgreSQL en Neon con dos servicios (`territory-service`, `reporting-service`). Hay dos defectos que bloquean el arranque correcto en producción: (1) merge conflict markers commiteados en la configuración de Flyway que rompen el parseo de YAML, y (2) ausencia de la variable `DB_URL_UNPOOLED` que hace que Flyway use la conexión pooleada de PgBouncer — PgBouncer en modo transacción no soporta DDL ni prepared statements, así que migraciones pueden fallar silenciosamente. Además, el esquema completo no está versionado en Flyway, lo que impide recrear la base desde cero (branches de Neon, restores, nuevos ambientes).

## What Changes

- **Resolver merge conflict en `reporting-service/application.yml`**: eliminar los markers `<<<<<<< HEAD / ======= / >>>>>>> feat/redesign` y dejar `flyway.enabled: true` como estado correcto.
- **Documentar `DB_URL_UNPOOLED` en `.env.example`**: agregar la variable con comentario que explique su rol (conexión directa para Flyway y migraciones, sin el sufijo `-pooler`).
- **Crear `V0__initial_schema.sql` en `territory-service`**: migrar el DDL existente de `manzanas_territorio`, `territory_settings` y `CREATE EXTENSION postgis` a una migración Flyway versionada, permitiendo reproducir el esquema en un Neon vacío.
- **Crear `V0__initial_schema.sql` en `reporting-service`**: migrar el DDL de `registro_predicacion`, `encargados`, `whatsapp_delivery_idempotency` a Flyway versionado.
- **Agregar backup en pipeline CI**: incluir `pg_dump` con la URL directa para proteger los datos de producción.

## Capabilities

### New Capabilities

- `backend/database-schema-versioning`: el esquema completo de la base de datos se gestiona mediante migraciones Flyway versionadas. Cada nuevo ambiente Neon (branch, staging, producción) puede ejecutar `flyway migrate` para recrear el esquema sin intervención manual. Las tablas existentes se incorporan mediante `baseline-on-migrate`.
- `backend/neon-deployment-config`: la configuración de despliegue documenta explícitamente la diferencia entre la conexión pooleada (aplicación normal) y la directa (migraciones/backup), evitando que operadores configure incorrectamente Neon para producción.

## Impact

- **Build/Arranque**: `reporting-service` no arranca hasta resolver el merge conflict en `application.yml`.
- **Migraciones Flyway**: con `flyway.enabled: false` (estado actual del conflict), ninguna migración de `reporting-service` se ejecuta en startup.
- **Multi-ambiente Neon**: branches de preview Neon necesitan el esquema completo para funcionar. Sin `V0__initial_schema.sql`, cada branch requiere intervención manual.
- **Restore/DR**: un restore de producción sin schema versionado requiere exportar/importar data dumps. Con Flyway versionado, un nuevo Postgres puede reproducir el esquema automáticamente.
- **CI/CD**: el pipeline de GitHub Actions actualmente no hace backup de la base de datos Neon.
