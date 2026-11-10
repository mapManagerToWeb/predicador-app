# Métricas de build

## Backend (`mvn verify -B -DskipTests`)
```
Predicador Backend .... SUCCESS [  0.001 s]
Shared ............... SUCCESS [  0.686 s]
Config Server ........ SUCCESS [  0.354 s]
Discovery Server ..... SUCCESS [  0.247 s]
API Gateway .......... SUCCESS [  1.749 s]
Territory Service .... SUCCESS [  1.037 s]
Reporting Service .... SUCCESS [  1.369 s]
---------------------------------------------------
BUILD SUCCESS — 5.698 s total
```

### Advertencias de compilación (no errores)
- `RabbitMQConfig.java` línea 41: `Jackson2JsonMessageConverter` deprecated/removal
- `SumaDeSalidas.java`: deprecated API (recompile with `-Xlint:deprecation`)
- `Task3HardeningTest.java`: unchecked/unsafe operations

## Tests + cobertura
- `mvn verify -Pcoverage -B` agrega JaCoCo + **40% LINE/INSTRUCTION gate** (SonarCloud)
- ⚠️ **En local plano el gate FALLA**: los ITs de DB se saltan → territory ~25% < 40%. No indica código roto; indica que faltan los ITs. Ver `../testing/integration.md`.
- Tests integración DB: 5 tests requieren `-Ddocker.available=true` **y Docker respondiendo** (Testcontainers)
  - PostgisIntegrationTest, ReportRepositoryIntegrationTest
  - CicloServiceIntegrationTest, EstadoPublicoServiceIntegrationTest
  - EncargadoRaceConditionTest (antes `EncargadoRaceConditionIT`, que nunca corría)
- `TerritoryAdminIntegrationTest`: requiere `TERRITORY_IT_DB_URL` + `TERRITORY_IT_DB_USERNAME` / `TERRITORY_IT_DB_PASSWORD` (DB con sufijo `*_test`) **o** `-Ddocker.available=true` con Docker disponible
  - Borra todas las manzanas → rechaza DB sin sufijo `_test`
- `ci-backend.yml` pasa `-Ddocker.available=true`: CI ejecuta los seis ITs. `sonarcloud.yml` pasa `TERRITORY_IT_DB_*`: el gate de 40% se sostiene aunque los ITs docker se salten.
- **`mvn -pl <módulo> validate` corre el Enforcer** de `pom.xml`: falla si una dependencia vuelve a una versión con CVE (hoy `amqp-client < 5.37.0`).
- Recetas verificadas (2026-10-09) para correr TODOS los ITs:
  1. `TESTCONTAINERS_RYUK_DISABLED=true mvn verify -Pcoverage -B -Ddocker.available=true` — todo vía Testcontainers. Ryuk se desactiva porque GHCR 404 `testcontainers/ryuk:0.11.0` en este entorno.
  2. `TERRITORY_IT_DB_URL=…_test … mvn verify -Pcoverage -B` — vía DB externa `*_test`, sin Testcontainers (los 5 ITs docker-gated siguen skippeados, pero `TerritoryAdminIntegrationTest` da la cobertura). CI ya no usa esta vía: pasa `-Ddocker.available=true`.

## Frontend build
```
Application bundle generation complete [5.508s]
Output: territory-frontend/dist/territory-frontend
```

### Warning (no error)
- `bundle initial exceeded maximum budget. Budget 320.00 kB was not met by 26.50 kB with a total of 346.50 kB`
- Lazy chunks: `maplibre-gl` (1.06 MB lazy), feature chunks (map 76.38 kB, s13 43.65 kB)
- Prerender: 1 static route

## Tests frontend
```
Statements   : 64.18% (3070/4783)
Branches     : 55.99% (1397/2495)
Functions    : 59.41% (710/1195)
Lines        : 65.98% (2658/4028)
```
- Thresholds `vitest.config.ts`: 60/58/55/50 → PASS
- Advertencia: coverage bajo ≈ no implica buena cobertura. Archivos 0%: `features/map/mapa-vista.ts`

## Cómo regenerar métricas
```bash
# Backend build
cd backend && mvn verify -B -DskipTests

# Backend tests + coverage — todos los ITs (necesita Docker socket)
cd backend && TESTCONTAINERS_RYUK_DISABLED=true mvn verify -Pcoverage -B -Ddocker.available=true
# Alternativa sin Testcontainers, vía DB externa *_test (como CI):
#   TERRITORY_IT_DB_URL=jdbc:postgresql://localhost:5433/<nombre>_test \
#   TERRITORY_IT_DB_USERNAME=<user> TERRITORY_IT_DB_PASSWORD=<pass> \
#   mvn verify -Pcoverage -B
# Nota: `mvn verify -Pcoverage -B` plano falla el gate en local (ITs skip).

# Frontend
cd territory-frontend && pnpm run lint
cd territory-frontend && pnpm run build
cd territory-frontend && pnpm test -- --run --coverage
```