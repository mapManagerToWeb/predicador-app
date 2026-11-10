# Cobertura de tests

> Métricas verificadas 2026-11-09. Cambian con cada PR — regenerar con los comandos al final.

## Frontend (Vitest) — `pnpm test -- --run --coverage`
```
Statements   : 64.18% (3070/4783)
Branches     : 55.99% (1397/2495)
Functions    : 59.41% (710/1195)
Lines        : 65.98% (2658/4028)
```
- Umbral en `vitest.config.ts`: **60/58/55/50** (lines/statements/functions/branches) → PASS con margen.
- 46 archivos `*.spec.ts`, 357 tests.

### Puntos de cobertura por feature (muestral)
| Feature | Statements | Notas |
|---|---|---|
| `features/auth` | ~92.3% | |
| `features/profile` | ~94.2% | |
| `features/visor` | ~79.4% | |
| `map/mapa.store` | ~83.6% | |
| `map/mapa.datos` | ~92.3% | índice GeoJSON + cache local |
| `map/mapa-vista` | **0%** | Líneas 65–588 sin cubrir — el archivo que hace todo el dibujo del mapa |
| `features/admin` | 28–93% | depende del archivo |

⚠️ Coverage bajo ≠ buena cobertura. El archivo más crítico del mapa (`mapa-vista.ts`) tiene 0%.

## Backend (JUnit 5) — verificado 2026-10-10
Corrida completa con IT de DB: `TESTCONTAINERS_RYUK_DISABLED=true mvn verify -Pcoverage -B -Ddocker.available=true` → **BUILD SUCCESS, 242 tests, 0 skipped, todos los gates JaCoCo OK**.

| Módulo | Line | Instr | Branch | Method |
|---|---|---|---|---|
| `shared` | 85.0% | 86.6% | 76.4% | 90.5% |
| `api-gateway` | 81.0% | 80.5% | 59.4% | 84.7% |
| `territory-service` | 89.4% | 87.8% | 67.8% | 90.3% |
| `reporting-service` | 84.0% | 81.9% | 64.0% | 83.7% |

- 50 archivos de test: `shared` 12, `api-gateway` 7, `territory-service` 7, `reporting-service` 24, `config/discovery` 0 (infra).
- JaCoCo: gate **40% LINE/INSTRUCTION** (falla el build si baja).
- ⚠️ **Los números de arriba son CON los IT docker-gated corriendo.** Sin `-Ddocker.available=true` se saltan y `territory-service` cae bajo el gate 40% (~25–29%) → el build **falla localmente**. CI pasa `-Ddocker.available=true`, así que ejecuta los seis ITs. Ver `integration.md`.

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