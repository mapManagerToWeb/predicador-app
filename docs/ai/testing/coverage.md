# Cobertura de tests

> Verificado 2026-11-10. Cambia con cada PR — regenerar con los comandos al final.

## Frontend (Vitest) — `pnpm test -- --run --coverage`
```
Statements   : 64.84% (3491/5384)
Branches     : 56.63% (1610/2843)
Functions    : 60.77% (826/1359)
Lines        : 66.51% (3014/4531)
```
- Umbral en `vitest.config.ts`: **60/58/55/50** (lines/statements/functions/branches) → PASS con margen.
- 51 archivos `*.spec.ts`, 399 tests.

### Puntos de cobertura por archivo (muestral)
| Archivo | Statements | Notas |
|---|---|---|
| `features/map/mapa.store.ts` | ~85.7% | reglas de marcado y envío |
| `features/map/mapa.datos.ts` | 100% | índice GeoJSON + cache local |
| `features/map/mapa-vista.ts` | **0%** | líneas 65–592 sin cubrir — el archivo que hace todo el dibujo del mapa |

⚠️ Coverage alto ≠ buena cobertura: el archivo más crítico del mapa (`mapa-vista.ts`) sigue en 0%.

## Backend (JUnit 5) — verificado 2026-11-10
Corrida completa con IT de DB: `TESTCONTAINERS_RYUK_DISABLED=true mvn verify -Pcoverage -B -Ddocker.available=true` → **BUILD SUCCESS, 541 tests, 0 skipped, todos los gates JaCoCo OK**.

| Módulo | Tests | Line | Instr | Branch | Method |
|---|---|---|---|---|---|
| `shared` | 95 | 85.8% | 86.7% | 76.4% | 90.5% |
| `api-gateway` | 102 | 88.3% | 88.0% | 69.0% | 89.7% |
| `territory-service` | 61 | 88.6% | 87.1% | 67.8% | 86.4% |
| `reporting-service` | 283 | 85.7% | 83.5% | 67.1% | 84.3% |

- 58 archivos de test: `shared`, `api-gateway`, `territory-service`, `reporting-service`; `config-server` y `discovery-server` no tienen tests.
- JaCoCo: gate **40% LINE/INSTRUCTION** (falla el build si baja).
- ⚠️ **Los números de arriba son CON los IT docker-gated corriendo.** Sin `-Ddocker.available=true` (y Docker respondiendo) se saltan y `territory-service` cae bajo el gate 40% (~25–29%) → el build **falla localmente**. CI pasa `-Ddocker.available=true`; SonarCloud pasa `TERRITORY_IT_DB_*`, que basta para el gate. Ver `integration.md`.

## Cómo regenerar
```bash
# Frontend
cd territory-frontend && pnpm test -- --run --coverage

# Backend — más rápido sin DB, PERO sin los IT docker territory-service puede
# quedar bajo el gate 40% y fallar el build (no es señal de regresión por sí solo)
cd backend && mvn verify -Pcoverage -B

# Backend COMPLETO con integración DB (requiere Docker socket; en este entorno
# hay que desactivar Ryuk — GHCR 404 en testcontainers/ryuk:0.11.0)
cd backend && TESTCONTAINERS_RYUK_DISABLED=true mvn verify -Pcoverage -B -Ddocker.available=true
```
