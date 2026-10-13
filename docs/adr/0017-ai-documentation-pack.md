# ADR 0017 — Documentación de IA para el proyecto Predicador

- **Estado:** Aceptado
- **Fecha:** 2026-10-09
- **Decisión:** Crear un pack de documentación de IA (`docs/ai/`) para soporte de agentes de IA, modelos de lenguaje y orquestación de tareas.
- **Contexto:** El proyecto crece (microservicios Spring Boot + Angular PWA). Los agentes de IA necesitan entender arquitectura, métricas, gotchas y flujo operativo sin depender de `AGENTS.md` (que es un overview). La documentación existente (`docs/adr/`, `SPEC-map-*.md`) es fragmentada y no está unificada para IA.
- **Alternativas consideradas:**
  1. Extender `AGENTS.md` con secciones de IA — pero se vuelve grande y raro.
  2. Crear `docs/ai/` con archivos separados por concern — más modular, fácil de mantener y referenciar.
  3. No documentar — riesgo de agentes de IA generando código incorrecto o rompiendo convenciones.
- **Decisión:** Crear `docs/ai/` con estructura de **divulgación progresiva** por temas (modelada según repos comparables analizados vía búsqueda de código, p. ej. `codeaholicguy/ai-devkit`, `neovateai/neovate-code`, `SigNoz/signoz`, `meysamhadeli/awesome-dotnet-tips`, `LnYo-Cly/ai4j`):
  - `README.md` — índice mínimo + estado verificado del proyecto.
  - `project/` — qué es el proyecto y glosario de dominio (`overview.md`, `glossary.md`).
  - `architecture/` — overview, componentes, flujo de datos paso a paso (`overview.md`, `components.md`, `data-flows.md`).
  - `requirements/` — funcionales y no funcionales (`functional.md`, `non-functional.md`).
  - `deployment/` — CI/CD, Docker, configuración (`ci-cd.md`, `docker.md`, `config.md`).
  - `testing/` — cobertura real y tests de integración y su gating (`coverage.md`, `integration.md`).
  - `metrics/` — métricas de build y performance (`build.md`, `performance.md`).
  - `operations/` — monitoreo, logs, backup (`monitoring.md`, `logs.md`, `backup.md`).
  - `warnings/` — gotchas clasificadas por severidad (`critical.md`, `high.md`, `medium.md`, `low.md`).
  - `api-reference/` — rutas del gateway y por servicio (`gateway.md`, `services.md`).
  - `support/` — FAQ y mapa tema→código (`faq.md`, `references/code-map.md`).
  - Reemplazó la estructura plana original de 6 archivos (`00-README.md`, `01-proyecto.md`, `02-arquitectura.md`, `03-metricas.md`, `04-requerimientos.md`, `05-advertencias.md`, `06-flujo-operativo.md`), cuyos contenidos fueron consolidados y verificados contra el código.
- **Consecuencias:**
  - Pro: agentes de IA pueden referenciar estos archivos para entender el proyecto sin necesidad de leer todo el repo.
  - Pro: documentación modular facilita actualización incremental.
  - Con: requiere mantenimiento periódico para mantenerse sincronizada con el código.
- **Verificación:** Los archivos se crearon y se verificaron contra el estado actual del proyecto (2026-10-09). Las métricas de build/tests se obtuvieron ejecutando `mvn verify -B -DskipTests`, `pnpm run build`, `pnpm test -- --run --coverage` y `pnpm run lint`. Todas pasaron (con warnings tolerados).
- **Relación con otros ADRs:** Este ADR no reemplaza los ADRs existentes (`0001`–`0016`). Es un pack de soporte para IA, no una especificación de arquitectura. Los ADRs siguen siendo la fuente de verdad para decisiones técnicas.