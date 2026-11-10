# Documentación AI — Predicador App

> **Principio de divulgación progresiva** (progressive disclosure): este archivo es mínimo. Detalles en subcarpetas.

## Índice rápido

| Subcarpeta | Qué contiene |
|---|---|
| `project/` | Qué es el proyecto, glosario de dominio |
| `architecture/` | Arquitectura (overview, componentes, flujo de datos, ADRs) |
| `requirements/` | Funcionales, no funcionales, restricciones |
| `deployment/` | CI/CD, Docker, Configuración |
| `testing/` | Cobertura, Integración |
| `operations/` | Monitoreo, Logs, Backup |
| `metrics/` | Build, Performance |
| `warnings/` | Críticos, Alto, Medio, Bajo |
| `api-reference/` | Gateway, Servicios |
| `support/` | FAQ, Referencias (mapa tema → código) |

## Estado rápido (verificado 2026-11-10)
- Backend build + tests COMPLETO: **PASS** (`TESTCONTAINERS_RYUK_DISABLED=true mvn verify -Pcoverage -B -Ddocker.available=true` — 283 tests en reporting, 0 skipped, gates JaCoCo OK; ver `testing/integration.md` para el requisito de Ryuk)
- Frontend build: PASS (`pnpm run build` — initial total 347.95 kB > 320 kB budget = warning, no error)
- Tests frontend: PASS (`pnpm test -- --run --coverage` — 380 tests, 49 archivos; ⚠️ `@analogjs/vite-plugin-angular` fijado en 2.8.1, ver `warnings/high.md`)
- Lint: PASS (0 errores)
- Seguridad de dependencias: `pnpm audit --prod --audit-level=high` → 0 avisos; Enforcer banea `amqp-client < 5.37.0`
- Docs AI: `docs/ai/` + `docs/adr/0017-ai-documentation-pack.md`

## Cómo usar esta documentación con IA
- Para cambios de arquitectura → `architecture/` + `docs/adr/`
- Para métricas actuales → `metrics/`
- Para restricciones/gotchas → `warnings/` + `requirements/`
- Para flujo de trabajo → `operations/` + `architecture/`
- Para referencias de código → `api-reference/`
