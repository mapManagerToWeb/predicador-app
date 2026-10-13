# Tests de integración (backend)

> Leer antes de tocar código que involucre DB, migraciones o seguridad. Ver también `../warnings/critical.md`.

## Regla de oro: qué corre y qué NO en `mvn verify`
Sin configuración surefire/failsafe en el repo — **el naming es el único filtro**. Surefire por defecto ejecuta solo `*Test`, `Test*`, `*Tests`, `*TestCase`.

| Test | ¿Corre en `mvn verify`? | Condición para correr |
|---|---|---|
| `PostgisIntegrationTest` (territory) | **Skip silencioso** | `-Ddocker.available=true` (Testcontainers) |
| `ReportRepositoryIntegrationTest` (reporting) | **Skip silencioso** | `-Ddocker.available=true` |
| `CicloServiceIntegrationTest` (reporting) | **Skip silencioso** | `-Ddocker.available=true` |
| `EstadoPublicoServiceIntegrationTest` (reporting) | **Skip silencioso** | `-Ddocker.available=true` |
| `TerritoryAdminIntegrationTest` (territory) | **Sí** (único IT que CI ejecuta contra PostGIS) | `-Ddocker.available=true` **O** `TERRITORY_IT_DB_URL` + `TERRITORY_IT_DB_USERNAME`/`_PASSWORD` |
| `EncargadoRaceConditionIT` | **NUNCA corre** | — (nombre `*IT` fuera del include de surefire; no hay failsafe) |

Los 4 primeros están gated con `@EnabledIfSystemProperty(named = "docker.available")`. Nada en `pom.xml` ni los workflows setea esa propiedad → un `mvn verify` normal los reporta como skipped.

## ⚠️ `TerritoryAdminIntegrationTest` destruye datos
- **Borra todas las manzanas** → rechaza cualquier DB cuyo nombre no termine en `*_test`.
- Es el único test que CI ejecuta contra el servicio PostGIS (`postgis/postgis:16-3.4`, db `predicador_test`).

## `EncargadoRaceConditionIT`
- Nunca se ejecuta. No hay reporte en `target/surefire-reports`. **No asumir que está cubierto.**
- Si se necesita, habría que añadir failsafe o renombrar a `*Test` (con sus riesgos).

## Pitfalls verificados (2026-10-10)
- **`PostgisIntegrationTest`** (territory, contenedor propio `postgis/postgis:16-3.4`): usa `@DynamicPropertySource` para inyectar un `app.session.secret` **solo de test** (32 bytes) — no usar `app.session.strict=false`. Los inserts replican el patrón de producción con SQL nativo vía `JdbcTemplate` (`ST_Force3D(ST_SetSRID(ST_GeomFromGeoJSON(:gj),4326))`); JPA `save()` es imposible porque `ManzanaTerritorio.geometry` es un `String` plano (sin tipo espacial de Hibernate).
- **Polución intra-clase en DB compartida**: los 7 tests de `PostgisIntegrationTest` comparten un solo contenedor; se añadió `@BeforeEach` con `DELETE FROM manzanas_territorio` (mismo patrón que `TerritoryAdminIntegrationTest`). El `findsDistinctTerritorioPadres` fallaba por valores de tests hermanos (5/6/15/40/50), no de otras clases.
- **`ReportRepositoryIntegrationTest`** (reporting): aserciones de id absoluto (`101L`/`103L`) eran imposibles de cumplir — la entidad usa `GenerationType.IDENTITY` y la secuencia avanza entre tests aunque la transacción haga rollback. Corregido comparando contra los ids devueltos por `save()`. **No reintroducir constantes de id en fixtures con identity.**
- **Ryuk**: en este entorno GHCR responde 404 para `testcontainers/ryuk:0.11.0`. `-Ddocker.available=true` **sin** `TESTCONTAINERS_RYUK_DISABLED=true` falla; con la variable funciona (CI ya la define).

## Cómo correr un test puntual
```bash
cd backend
# Con Testcontainers (este entorno necesita Ryuk desactivado):
TESTCONTAINERS_RYUK_DISABLED=true mvn verify -Pcoverage -B -Ddocker.available=true -Dtest=CicloServiceIntegrationTest
# ReportRepositoryIntegrationTest concreto:
TESTCONTAINERS_RYUK_DISABLED=true mvn -pl reporting-service test -B -Ddocker.available=true -Dtest=ReportRepositoryIntegrationTest
```