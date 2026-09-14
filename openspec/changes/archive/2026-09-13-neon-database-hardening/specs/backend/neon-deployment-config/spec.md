## Purpose

La configuración de despliegue documenta explícitamente la diferencia entre la conexión pooleada (consultas normales de la aplicación) y la conexión directa (migraciones y backups), y garantiza que el `application.yml` no contenga marcadores de merge conflict que rompan el arranque del servicio.

## ADDED Requirements

### Requirement: Sin marcadores de merge conflict en archivos de configuración

Los archivos `.yml` y `.properties` SHELL estar libres de marcadores `<<<<<<< HEAD`, `=======`, `>>>>>>> branch` antes de hacer commit. Estos marcadores rompen el parseo YAML e impiden el arranque del servicio Spring Boot.

#### Scenario: Configuración commiteada con markers de merge

- **WHEN** un archivo YAML commiteado contiene `<<<<<<< HEAD`
- **THEN** Spring Boot falla el parseo con un error de SnakeYAML (`yaml.constructor.ConstructorException` o `DocumentException`) o `InvalidConfigurationPropertyValueException`; el servicio no arranca; los logs muestran el error de YAML parser

#### Scenario: Configuración limpia sin markers

- **WHEN** un archivo YAML no contiene markers de merge
- **THEN** Spring Boot parsea exitosamente y el servicio arranca

### Requirement: Flyway habilitado en reporting-service

`reporting-service/application.yml` SHALL tener `flyway.enabled: true`. Las migraciones deben ejecutarse en cada arranque del servicio.

#### Scenario: reporting-service arranca en Neon

- **WHEN** el servicio arranca contra una base Neon
- **THEN** Flyway ejecuta las migraciones pendientes en `db/migration/`; las tablas y datos se actualizan

#### Scenario: Flyway deshabilitado

- **WHEN** `flyway.enabled: false`
- **THEN** ninguna migración se ejecuta; el esquema de la base puede diverger del código de la aplicación; errores en tiempo de ejecución al acceder a tablas/columnas faltantes

### Requirement: Variables de conexión documentadas en .env.example

`.env.example` SHALL documentar `DB_URL` (pooleada para la app) y `DB_URL_UNPOOLED` (directa para migraciones y backups). El comentario debe explicar la diferencia y por qué se necesitan ambas.

#### Scenario: Operador configura nuevo ambiente Neon

- **WHEN** un operador clona el repo y configura un nuevo proyecto Neon
- **THEN** lee `.env.example`, entiende que necesita dos connection strings (con `-pooler` para app, sin `-pooler` para migraciones), y configura ambas variables correctamente

#### Scenario: Falta DB_URL_UNPOOLED

- **WHEN** solo se configura `DB_URL` con la URL pooleada y `DB_URL_UNPOOLED` queda vacía
- **THEN** Flyway toma el fallback `${DB_URL}` (pooleada); las migraciones pueden fallar con PgBouncer; el servicio arranca con un esquema potencialmente inconsistente

### Requirement: Variables de sesión y secretos validadas al arranque

`SESSION_SECRET`, `ADMIN_USERNAME`, y `ADMIN_PASSWORD_BCRYPT` SHALL ser validados al arranque fuera del perfil `local`. El servicio no arranca si faltan.

#### Scenario: Arranque sin SESSION_SECRET en producción

- **WHEN** `SESSION_SECRET` no está definida y `app.session.strict: true`
- **THEN** el servicio falla el arranque con un mensaje claro indicando la variable faltante; no se aceptan tokens sin enforcement HMAC

#### Scenario: Arranque con perfil local sin secretos

- **WHEN** `SPRING_PROFILES_ACTIVE=local`
- **THEN** el servicio arranca con `app.session.strict: false`; los secretos son opcionales; esto es solo para desarrollo