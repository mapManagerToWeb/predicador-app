# Advertencias — Alto riesgo

> No detienen el flujo, pero degradan la experiencia o esconden fallos. Revisar antes de cada release.

| Advertencia | Impacto | Mitigación |
|---|---|---|
| **Bundle frontend > 320 kB budget (346.32 kB)** | Warning de build (CI pasa), puede afectar métricas de performance (Lighthouse). | Optimizar lazy chunks o revisar imports; no solo subir el budget. |
| **Coverage bajo (61.67% statements)** | Los thresholds bajos (30/30/30/20) pasan, pero `mapa-vista.ts` está a 0% — el archivo que dibuja todo el mapa. | Agregar tests puros (helpers de salida/lados/borrador ya son testeados); refactor para extraer lógica. |
| **Deprecations en backend** | Compilan OK pero se acercan a removal: `Jackson2JsonMessageConverter` (RabbitMQConfig:41), API deprecated en `SumaDeSalidas.java`. | Revisar compatibilidad Spring AMQP 2025.x; migrar converter. |
| **Tests de integración silenciosos** | `mvn verify` normal reporta skipped: 4 IT requieren `-Ddocker.available=true` (y en este entorno además `TESTCONTAINERS_RYUK_DISABLED=true`), y `EncargadoRaceConditionIT` nunca corre. Sin los IT, `territory-service` cae bajo el gate JaCoCo 40%. | Correr los IT docker al tocar DB/seguridad (ver `../testing/integration.md`); decidir si agregar failsafe. |
| **Versión Java local ≠ proyecto** | Local 26.0.1 vs `release 25` en javac. Compila sin error, riesgo mínimo. | Mantener `release 25` en el pom (CI usa Java 25). |
| **CI de seguridad salta en PRs de dependabot** | gitleaks y Semgrep no revisan PRs automatizados de dependencias. | Revisar manualmente los bumps de dependencias; mantener OWASP dependency-check activo. |