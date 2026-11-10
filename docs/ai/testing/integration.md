# Tests de integración (backend)

> Leer antes de tocar código que involucre DB, migraciones o seguridad. Ver también `../warnings/critical.md`.

## Regla de oro: qué corre y qué NO en `mvn verify`
Sin configuración surefire/failsafe en el repo — **el naming es el único filtro**. Surefire por defecto ejecuta solo `*Test`, `Test*`, `*Tests`, `*TestCase`.

| Test | ¿Corre en local con `mvn verify`? | Condición para correr |
|---|---|---|
| `PostgisIntegrationTest` (territory) | **Skip silencioso** | `-Ddocker.available=true` (Testcontainers) |
| `ReportRepositoryIntegrationTest` (reporting) | **Skip silencioso** | `-Ddocker.available=true` |
| `CicloServiceIntegrationTest` (reporting) | **Skip silencioso** | `-Ddocker.available=true` |
| `EstadoPublicoServiceIntegrationTest` (reporting) | **Skip silencioso** | `-Ddocker.available=true` |
| `EncargadoRaceConditionTest` (reporting) | **Skip silencioso** | `-Ddocker.available=true` |
| `TerritoryAdminIntegrationTest` (territory) | **Skip silencioso** | `-Ddocker.available=true` **O** `TERRITORY_IT_DB_URL` + `TERRITORY_IT_DB_USERNAME`/`_PASSWORD` |

Los cinco primeros están gated con `@EnabledIfSystemProperty(named = "docker.available")`; `TerritoryAdminIntegrationTest` usa `@EnabledIf("baseDisponible")`. **`ci-backend.yml` pasa `-Ddocker.available=true`**, así que CI ejecuta los seis. En local, un `mvn verify` sin esa propiedad los reporta como skipped.

## ⚠️ `TerritoryAdminIntegrationTest` destruye datos
- **Borra todas las manzanas** → rechaza cualquier DB cuyo nombre no termine en `*_test`.
- Corre contra el servicio PostGIS de CI (`postgis/postgis:16-3.4`, db `predicador_test`) o contra su propio contenedor Testcontainers cuando está `-Ddocker.available=true`.

## `EncargadoRaceConditionTest`
- Se llamaba `EncargadoRaceConditionIT` y **nunca corría**: surefire no incluye `*IT` y no hay failsafe. Se renombró a `*Test`.
- Corre con `-Ddocker.available=true`, igual que los otros cuatro. CI lo ejecuta.
- El esquema del test lo genera Hibernate (`create-drop`, Flyway apagado), así que el test crea el índice funcional `ux_encargados_natural_identity` antes de la sección concurrente: sin ese índice no hay carrera que resolver y el test mediría un esquema que no existe.

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