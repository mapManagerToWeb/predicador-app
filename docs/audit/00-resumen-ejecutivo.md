# Auditoría de calidad — Predicador

Auditoría completa del monorepo: 67 archivos Java, 64 TypeScript y 7 HTML. El backend usa Spring Boot 4.0.0, Java 21 y Spring Cloud 2025.1.0 en seis módulos Maven; el frontend usa Angular 22 SSR/PWA, Signals, Leaflet y Vitest. El estado general es bueno en estructura y modernidad, pero hay riesgos críticos de despliegue: la autenticación backend queda fail-open si falta `SESSION_SECRET`, existen credenciales administrativas por defecto, y varios servicios internos quedan publicados fuera del gateway. También hay autorización frontend basada en `localStorage`, un workflow Docker con contexto incompatible y cobertura frontend inferior al gate configurado.

El análisis no ejecutó escáneres de dependencias ni un despliegue Docker; por tanto no se reportan CVE ni vulnerabilidades de imágenes como hechos confirmados.

## Método

Se ejecutaron las fases 0–4 de `auditoria-calidad-fullstack`: mapa del proyecto, triage grep, análisis profundo por área, comparación con el radar tecnológico de julio de 2026 e informe siguiendo la plantilla oficial.
