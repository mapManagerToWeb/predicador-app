---
name: auditoria-calidad-fullstack
description: Audita proyectos full-stack Spring Boot + Angular para detectar bugs, huecos de cobertura, código muerto, deuda técnica, problemas de arquitectura y patrones de diseño, configuraciones inseguras u obsoletas, cuellos de botella de rendimiento y dependencias desactualizadas. Úsala cuando pidan revisar, auditar, mejorar la calidad, buscar bugs, analizar seguridad, mejorar arquitectura o escalabilidad, o evaluar cobertura de tests de un backend Spring Boot y/o un frontend Angular.
license: MIT
compatibility: opencode
metadata:
  dominio: "spring-boot-angular"
  version: "1.0"
  ultima-revision: "2026-07-31"
---

# Auditoría de calidad — Spring Boot + Angular

## Qué hace esta skill

Analiza un proyecto full-stack (backend Spring Boot, frontend Angular, o
ambos) y produce un informe accionable de calidad: bugs y code smells,
huecos de cobertura de tests, código muerto, problemas de arquitectura y
patrones de diseño, configuraciones inseguras o desactualizadas, cuellos de
botella de rendimiento, y dependencias/tecnología que ya no es la
recomendada. El objetivo final es que el proyecto sea más mantenible, más
fácil de testear y más escalable — no "perfecto" según un estándar
abstracto.

## Principios

- **No adivines.** Toda afirmación sobre una versión, una vulnerabilidad
  concreta o "la práctica actual" debe basarse en lo que hay en el repo
  (`pom.xml`, `build.gradle`, `package.json`, lockfiles) o en una
  verificación real (búsqueda web si la tienes disponible como herramienta).
  Si no puedes verificar algo, dilo explícitamente en el informe en vez de
  afirmarlo con seguridad.
- **Eficiencia de tokens ante todo.** Nunca leas un archivo completo si un
  grep dirigido resuelve la pregunta. Nunca proceses `node_modules/`,
  `target/`, `build/`, `dist/`, `.angular/`, `coverage/`, `.git/` ni
  binarios.
- **Progresivo.** Carga cada archivo de `references/` solo cuando entres en
  la fase o el área correspondiente. No cargues los ocho de una vez al
  principio.
- **Cambios sugeridos, no reescrituras masivas.** Propone diffs puntuales y
  snippets acotados; no reescribas archivos completos salvo que te lo pidan
  explícitamente.
- **Prioriza por impacto.** Seguridad y bugs críticos primero; estilo y
  nitpicks al final, y solo si hay espacio.

## Flujo de trabajo

El detalle completo está en `references/00-flujo-analisis.md` — léelo antes
de empezar. Resumen de las fases:

1. **Fase 0 — Mapa del proyecto** (barato: manifiestos, estructura de
   carpetas, conteos, sin leer código de negocio).
2. **Fase 1 — Triage con grep** (barato: patrones de riesgo en todo el
   árbol de una sola pasada).
3. **Fase 2 — Análisis profundo por área** (carga `references/` bajo
   demanda, lee solo lo que Fase 0/1 marcaron como relevante).
4. **Fase 3 — Verificación de versiones y tecnología** (contra
   `references/06-radar-tecnologico.md`, y con búsqueda web si está
   disponible).
5. **Fase 4 — Informe final** (con `references/07-plantilla-informe.md`).

## Mapa de referencias — cargar solo cuando corresponda

| Cuándo cargarlo | Archivo |
|---|---|
| Al iniciar cualquier auditoría | `references/00-flujo-analisis.md` |
| Al revisar arquitectura/diseño (back y front) | `references/01-arquitectura-patrones.md` |
| Al auditar el backend Spring Boot | `references/02-backend-spring-boot.md` |
| Al auditar el frontend Angular | `references/03-frontend-angular.md` |
| Al revisar seguridad (transversal) | `references/04-seguridad.md` |
| Al revisar tests y cobertura | `references/05-testing-cobertura.md` |
| Al validar versiones y dependencias | `references/06-radar-tecnologico.md` |
| Al redactar el informe final | `references/07-plantilla-informe.md` |

## Alcance típico

Backend Maven/Gradle + frontend Angular con npm/pnpm, en monorepo o en
repos separados. Si la estructura real no coincide con lo esperado
(nombres de carpeta distintos, más de un backend, etc.), detecta las rutas
reales en la Fase 0 en vez de asumir `backend/` y `frontend/` a ciegas.

## Cuándo detenerte y preguntar

- Si no encuentras ni `pom.xml`/`build.gradle` ni `angular.json`/`package.json`
  en el repo, confirma con el usuario el stack real antes de seguir — puede
  que este no sea un proyecto Spring Boot + Angular.
- Si el repo es muy grande (más de ~150k líneas de código relevante),
  propone acotar el alcance (por módulo, por severidad, o solo backend/solo
  frontend) antes de analizarlo todo de golpe.

## Salida esperada

Al terminar, entrega el informe siguiendo
`references/07-plantilla-informe.md`, cerrando con un roadmap priorizado de
máximo 10 acciones.
