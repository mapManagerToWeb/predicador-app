---
description: Ejecuta una auditoría de calidad completa (backend Spring Boot + frontend Angular) usando la skill auditoria-calidad-fullstack
agent: build
---

Ejecuta una auditoría de calidad de este proyecto usando la skill
`auditoria-calidad-fullstack`.

Alcance solicitado: $ARGUMENTS

Reglas:

- Si no se especifica alcance, audita backend y frontend completos.
- Si se especifica "backend", "frontend", "seguridad", "arquitectura" o
  "tests", limita el análisis a esa área — pero igual ejecuta primero la
  Fase 0 (mapa del proyecto) y la Fase 1 (triage con grep) de la skill para
  tener contexto suficiente.
- Sigue estrictamente las fases descritas en
  `references/00-flujo-analisis.md` de la skill.
- Entrega el resultado usando `references/07-plantilla-informe.md` como
  estructura.

Cuando termines de crear los 10 archivos, confirma la estructura creada y recuérdame que puedo invocar la auditoría escribiendo /audit-quality (o /audit-quality backend, /audit-quality frontend, /audit-quality seguridad) en cualquier sesión de OpenCode dentro de este proyecto.
