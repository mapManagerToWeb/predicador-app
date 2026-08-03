# Radar tecnológico — línea base (revisar y verificar antes de usar)

**Vigencia de este documento: julio de 2026.** Spring Boot y Angular se
mueven en ciclos de ~6 meses; antes de afirmar categóricamente que algo
está "obsoleto", verifica con una búsqueda web si tienes esa herramienta
disponible, o al menos ajusta el nivel de certeza de tu afirmación según la
fecha de esta línea base.

## Backend / Java

| Elemento | Estado a jul. 2026 | Recomendación |
|---|---|---|
| Java | LTS vigentes: Java 21 (sep. 2023) y Java 25 (sep. 2025, soporte hasta ~2033). El acceso gratuito de Oracle a actualizaciones de Java 21 vence en sep. 2026 (Temurin/Corretto siguen dando soporte gratuito más allá). | Mínimo Java 21 en proyectos nuevos; evaluar Java 25 si las dependencias ya lo soportan. Evitar arrancar proyectos nuevos en Java 8/11/17. |
| Spring Boot | La serie 3.x completa (incluida 3.5) llegó a fin de soporte open-source el 30/06/2026. La serie soportada es 4.x (4.0 desde nov. 2025, 4.1 desde jun. 2026, sobre Spring Framework 7). | Cualquier proyecto en Spring Boot 3.x necesita plan de migración a 4.x. Mínimo técnico: Java 17; recomendado Java 21+. |
| Testing | JUnit 5, Mockito, AssertJ, Testcontainers, PIT (mutation testing) siguen siendo el stack estándar. | Migrar JUnit 4 remanente; incorporar Testcontainers para integración con BD real. |
| Cobertura | JaCoCo sigue siendo el estándar de facto. | Verificar que la versión del plugin sea reciente y que actúe como gate del build. |
| Análisis estático | SonarQube (rebrandeado: "SonarQube Server" autoalojado / "SonarQube Cloud" SaaS / "Community Build" edición gratuita), PMD, Checkstyle, SpotBugs, ArchUnit para arquitectura. | Vigentes, sin cambios de fondo relevantes. |
| Seguridad de dependencias | OWASP Dependency-Check, Trivy, Snyk. | Vigentes. |
| Concurrencia | Virtual Threads estables desde Java 21 y soportadas nativamente desde Spring Boot 3.2+; Structured Concurrency estable desde Java 25. | Candidato para I/O-bound de alta concurrencia en vez de pools de hilos tradicionales. |
| Observabilidad | Micrometer + OpenTelemetry. | Estándar actual. |

## Frontend / Angular

| Elemento | Estado a jul. 2026 | Recomendación |
|---|---|---|
| Angular | Última estable: Angular 22 (jun. 2026). Angular 21 (nov. 2025) en LTS hasta may. 2027. Angular 20 en LTS hasta nov. 2026. Angular 19 y anteriores: fuera de soporte desde may. 2026. | Objetivo mínimo razonable: Angular 21+; ideal Angular 22. Cualquier proyecto en ≤19 necesita actualización urgente. |
| Componentes | Standalone por defecto; sintaxis de control de flujo `@if/@for/@switch`; Signals (`signal`, `computed`, `effect`, `linkedSignal`, `resource`/`httpResource`) como modelo preferido para estado. | Migrar NgModules "clásicos" y `*ngIf/*ngFor` de forma progresiva, no exigir reescritura total. |
| Detección de cambios | Zoneless estable y por defecto desde Angular 21; OnPush como estrategia recomendada. | Evaluar migración si el proyecto sigue dependiendo de zone.js. |
| Formularios | Signal Forms estable desde Angular 22; Reactive Forms sigue siendo válido y soportado. | No forzar migración de formularios existentes que funcionan bien; sí evaluarlo para desarrollo nuevo. |
| Testing | Vitest es el test runner por defecto desde Angular 21 (Karma deprecado desde 2023, sin soporte activo del equipo de Angular). | Si el proyecto sigue en Karma, es deuda de tooling a migrar. |
| Accesibilidad | Angular ARIA (paquete oficial) para componentes accesibles. | Vigente. |
| Linting | ESLint con flat config (`eslint.config.js`/`.mjs`) obligatorio desde ESLint 10 (feb. 2026); paquete unificado `typescript-eslint`; `@angular-eslint` para reglas específicas. | `.eslintrc.*` es un formato eliminado, no solo "legacy". |
| Runtime | Node.js 24 LTS es la línea activa recomendada (Node 22 en mantenimiento, Node 26 es "Current" no-LTS hasta oct. 2026). | Evitar Node ≤18 (fuera de soporte). |
| Build | Builder basado en esbuild (`@angular/build`) por defecto desde Angular 17+, reemplaza el builder Webpack legacy. | Migrar configuraciones que aún usan `@angular-devkit/build-angular:browser` clásico. |

## Cómo usar esta tabla

1. Compara las versiones declaradas en `pom.xml`/`build.gradle`/`package.json`
   contra esta tabla.
2. Si tienes acceso a búsqueda web, confirma que la tabla siga vigente antes
   de basar una recomendación crítica en ella (especialmente fechas de fin
   de soporte).
3. Si una tecnología del proyecto no aparece aquí, no asumas que está mal —
   investiga puntualmente en vez de generalizar desde esta lista.
