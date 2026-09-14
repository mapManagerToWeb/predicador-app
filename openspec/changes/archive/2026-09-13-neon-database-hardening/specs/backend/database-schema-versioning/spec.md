## Purpose

Permite que cualquier nuevo ambiente de base de datos Neon (branch de preview, staging, producción) reproduzca el esquema completo ejecutando migraciones Flyway, sin intervención manual ni exportación de dumps.

## ADDED Requirements

### Requirement: Flyway ejecuta al arrancar cada servicio

`territory-service` y `reporting-service` SHELL ejecutar Flyway al startup. Las migraciones se aplican en orden de versión (`V1__*`, `V2__*`, etc.). Si la base está vacía, todas las migraciones se ejecutan. Si la base tiene datos existentes, Flyway detecta que las tablas ya existen y las incorpora mediante `baseline-on-migrate`.

#### Scenario: Territorio service arranca en Neon vacío

- **WHEN** `territory-service` arranca por primera vez en un branch Neon sin tablas
- **THEN** Flyway ejecuta `V0__initial_schema.sql` (crea tablas + PostGIS) y `V1__add_indexes.sql`, `V2__add_geometry_gist_index.sql` exitosamente; la aplicación responde requests

#### Scenario: Reporting service arranca en Neon vacío

- **WHEN** `reporting-service` arranca por primera vez en un branch Neon sin tablas
- **THEN** Flyway ejecuta `V0__initial_schema.sql` (crea tablas) y las migraciones `V1__*` a `V5__*` exitosamente; la aplicación responde requests

#### Scenario: Servicio arranca contra base existente con datos

- **WHEN** el servicio arranca contra una base Neon que ya tiene tablas y datos (estado post-baseline)
- **THEN** Flyway detecta la tabla `flyway_schema_history` y no re-ejecuta migraciones aplicadas; no hay pérdida de datos; solo se aplican migraciones pendientes de versión superior

### Requirement: Migrations son idempotentes

Cada script de migración SHELL poder ejecutarse múltiples veces sin efectos colaterales ni errores. Se usan `CREATE INDEX IF NOT EXISTS` y `CREATE TABLE IF NOT EXISTS` para garantizar re-ejecución segura.

#### Scenario: Migración re-ejecutada manualmente

- **WHEN** un operador ejecuta `flyway migrate` dos veces contra la misma base
- **THEN** la segunda ejecución no produce errores y el resultado es idéntico al primero

### Requirement: Extensión PostGIS disponible antes de crear tablas espaciales

La extensión `postgis` DEBE crearse antes de cualquier tabla que use columnas `geometry`. La migración `V0__initial_schema.sql` SHALL incluir `CREATE EXTENSION IF NOT EXISTS postgis;` como primera instrucción.

#### Scenario: Neon sin PostGIS instalado

- **WHEN** `V0__initial_schema.sql` se ejecuta en un Neon donde PostGIS no está instalado
- **THEN** la migración falla con un mensaje de error que indica que PostGIS no está disponible; la solución es crear la extensión manualmente antes de migrar o verificar que el plan Neon incluye PostGIS

#### Scenario: Neon con PostGIS ya instalado

- **WHEN** `CREATE EXTENSION IF NOT EXISTS postgis;` se ejecuta contra un Neon donde ya existe
- **THEN** la instrucción succeeds sin error y no modifica el estado existente

### Requirement: Historial de migraciones separado por servicio

`territory-service` y `reporting-service` SHALL usar tablas de historial Flyway distintas (`flyway_schema_history_territory` y `flyway_schema_history_reporting`) para evitar colisiones en el historial compartido.

#### Scenario: Los dos servicios arrancan concurrentemente

- **WHEN** `territory-service` y `reporting-service` arrancan al mismo tiempo contra la misma base Neon
- **THEN** cada uno registra sus migraciones en su propia tabla de historial; no hay conflicto de clave primaria ni race condition en `flyway_schema_history`

### Requirement: Conexión directa (no pooleada) para migraciones

Las migraciones Flyway DEBEN ejecutarse sobre una conexión PostgreSQL directa, no sobre PgBouncer. La configuración SHALL usar `flyway.url` apuntando a la URL sin el sufijo `-pooler`.

#### Scenario: Flyway usa URL con pooler suffix

- **WHEN** `flyway.url` apunta a `ep-xxx-pooler.neon.tech` (con PgBouncer)
- **THEN** DDL statements fallan o comportan erráticamente: PgBouncer en modo transacción no trackea comandos SQL-level (PREPARE/EXECUTE/DEALLOCATE), y si un prepared statement cambia de tipos durante una migración, PostgreSQL lanza un error; además, `SET`, `LISTEN/NOTIFY` y session-level advisory locks no persisten entre transacciones

#### Scenario: Flyway usa URL directa (sin -pooler)

- **WHEN** `flyway.url` apunta a `ep-xxx.neon.tech` (sin pooler suffix)
- **THEN** todas las operaciones DDL se ejecutan correctamente contra el compute de Neon
