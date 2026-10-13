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
- Tests integración DB: 4 tests requieren `-Ddocker.available=true` (Testcontainers)
  - PostgisIntegrationTest, ReportRepositoryIntegrationTest
  - CicloServiceIntegrationTest, EstadoPublicoServiceIntegrationTest
- `TerritoryAdminIntegrationTest`: requiere `-Ddocker.available=true` **O** `TERRITORY_IT_DB_URL` + `TERRITORY_IT_DB_USERNAME` / `TERRITORY_IT_DB_PASSWORD` (DB con sufijo `*_test`)
  - Borra todas las manzanas → rechaza DB sin sufijo `_test`
  - Único test que CI ejecuta contra PostGIS (`ci-backend.yml` usa la vía de env vars)
- `EncargadoRaceConditionIT`: nunca corre (`*IT` no coincide con surefire default)
- Recetas verificadas (2026-10-09) para correr TODOS los ITs:
  1. `TESTCONTAINERS_RYUK_DISABLED=true mvn verify -Pcoverage -B -Ddocker.available=true` — todo vía Testcontainers. Ryuk se desactiva porque GHCR 404 `testcontainers/ryuk:0.11.0` en este entorno.
  2. `TERRITORY_IT_DB_URL=…_test … mvn verify -Pcoverage -B` — vía DB externa `*_test` (como CI; los 4 ITs docker-gated siguen skippeados, pero `TerritoryAdminIntegrationTest` da la cobertura).

## Frontend build
```
Application bundle generation complete [5.508s]
Output: territory-frontend/dist/territory-frontend
```

### Warning (no error)
- `bundle initial exceeded maximum budget. Budget 320.00 kB was not met by 26.32 kB with a total of 346.32 kB`
- Lazy chunks: `maplibre-gl` (1.06 MB lazy), feature chunks (map 73.92 kB, s13 43.59 kB)
- Prerender: 1 static route

## Tests frontend
```
Statements   : 61.67% (2696/4371)
Branches     : 53.88% (1221/2266)
Functions    : 56.95% (622/1092)
Lines        : 63.46% (2335/3679)
```
- Thresholds `vitest.config.ts`: 30/30/30/20 → PASS
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