# Métricas de build

> Verificado el **2026-11-10** en macOS (Temurin 25.0.3, Node 22, pnpm 9.15.0, Docker activo). Cambian con cada PR: regenerar con los comandos del final.

## Backend (`mvn verify -B -DskipTests`)
```
Predicador Backend .... SUCCESS [  1.780 s]
Shared ............... SUCCESS [  6.770 s]
Config Server ........ SUCCESS [  2.781 s]
Discovery Server ..... SUCCESS [  2.208 s]
API Gateway .......... SUCCESS [  2.809 s]
Territory Service .... SUCCESS [  2.855 s]
Reporting Service .... SUCCESS [  1.278 s]
---------------------------------------------------
BUILD SUCCESS — 21.879 s total
```

### Advertencias observadas (no errores)
- Runtime (Hibernate Validator): `HV000271: Using @Valid on a container (java.util.List) is deprecated`. Aparece en `ReportController#createReports`, `ReportAdminController#registrarVarias` y `WhatsAppSendRequest#territorios`; migrar a `@Valid` sobre el type argument.
- `Jackson2JsonMessageConverter` (`RabbitMQConfig:41`) y APIs de `SumaDeSalidas` están cerca de deprecación; hoy compilan sin warning de javac.

## Tests + cobertura (backend)
Corrida completa con IT de DB: `TESTCONTAINERS_RYUK_DISABLED=true mvn verify -Pcoverage -B -Ddocker.available=true` → **BUILD SUCCESS, 541 tests, 0 skipped, todos los gates JaCoCo OK** (4 min 08 s).

| Módulo | Tests | Line | Instr | Branch | Method |
|---|---|---|---|---|---|
| `shared` | 95 | 85.8% | 86.7% | 76.4% | 90.5% |
| `api-gateway` | 102 | 88.3% | 88.0% | 69.0% | 89.7% |
| `territory-service` | 61 | 88.6% | 87.1% | 67.8% | 86.4% |
| `reporting-service` | 283 | 85.7% | 83.5% | 67.1% | 84.3% |

- 58 archivos de test; `config-server` y `discovery-server` no tienen tests (infra).
- ⚠️ **Sin los IT docker-gated** (`-Ddocker.available=true` y Docker respondiendo) `territory-service` se salta sus 2 IT y cae bajo el gate 40% (~25–29%) → el build **falla en local**. CI pasa la propiedad; SonarCloud pasa `TERRITORY_IT_DB_*`. Ver `../testing/integration.md`.
- `mvn -pl <módulo> validate` corre el Enforcer: falla si una dependencia vuelve a una versión con CVE (hoy `amqp-client < 5.37.0`).

## Frontend build
```
Application bundle generation complete. [7.928 seconds]
Initial total 347.33 kB (98.54 kB transfer)
Output: territory-frontend/dist/territory-frontend
Prerendered 1 static route.
```

### Warning (no error)
- `bundle initial exceeded maximum budget. Budget 320.00 kB was not met by 27.34 kB with a total of 347.33 kB`
- Lazy chunks: `maplibre-gl` 1.07 MB, `map` 80.02 kB, `s13` 48.07 kB, `territorios` 34.38 kB, `sistema` 14.28 kB.

## Tests frontend (`pnpm test -- --run --coverage`)
```
Test Files  51 passed (51)
Tests       399 passed (399)
Duration    24.16 s
Statements   : 64.84% (3491/5384)
Branches     : 56.63% (1610/2843)
Functions    : 60.77% (826/1359)
Lines        : 66.51% (3014/4531)
```
- Thresholds `vitest.config.ts`: 60/58/55/50 → PASS.
- Archivo crítico sin cobertura: `features/map/mapa-vista.ts` (0%, líneas 65–592).

## Cómo regenerar métricas
```bash
# Backend build
cd backend && mvn verify -B -DskipTests

# Backend tests + coverage — todos los ITs (necesita Docker socket)
cd backend && TESTCONTAINERS_RYUK_DISABLED=true mvn verify -Pcoverage -B -Ddocker.available=true
# Alternativa sin Testcontainers, vía DB externa *_test:
#   TERRITORY_IT_DB_URL=jdbc:postgresql://localhost:5433/<nombre>_test \
#   TERRITORY_IT_DB_USERNAME=<user> TERRITORY_IT_DB_PASSWORD=<pass> \
#   mvn verify -Pcoverage -B

# Frontend
cd territory-frontend && pnpm run lint
cd territory-frontend && pnpm run build
cd territory-frontend && pnpm test -- --run --coverage
```
