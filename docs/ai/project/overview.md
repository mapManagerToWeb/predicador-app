# Proyecto — Qué es Predicador

## Qué es
**Predicador** es una PWA (Progressive Web App) para la **gestión de territorio y reportes de predicación** de los Testigos de Jehová.

## Propósito
- Gestionar territorios geográficos (manzanas, sectores) y su asignación a encargados.
- Registrar salidas de predicación: qué manzanas/calles se trabajaron, en qué día y turno, si el territorio quedó completo.
- Enviar el resumen por WhatsApp (Meta Graph API v21.0) al teléfono del encargado logueado.
- Mapa interactivo (MapLibre GL 6) con marcación de manzanas y de calles.
- Vistas de administración (`/admin`) — incluido el módulo «Sistema» de solo lectura — y visor público (`/visor`).

## Contexto de dominio
- **Usuario:** predicadores / encargados de territorio.
- **Datos:** geografía (polígonos y calles), reportes/salidas (manzanas y calles trabajadas, día, turno, estado), encargados y sesiones.
- **Flujo:** login → ver mapa → marcar manzanas o calles → enviar reporte → (admin) cerrar ciclo, corregir o anular, registrar salidas informadas por WhatsApp.
- **Restricciones de dominio:** teléfonos chilenos (9 dígitos empezando en 9), formato S-13-S, historial inmutable (nunca se borra un reporte para cambiar el estado).

## Stack técnico
| Capa | Tecnologías |
|---|---|
| Backend | Java 25, Spring Boot 4.1.1, Spring Cloud 2025.1.3, Maven multi-módulo (6 módulos) |
| Servicios | config-server (8888), discovery-server (8761), api-gateway (8080), territory-service (8081), reporting-service (8082) |
| Base de datos | PostgreSQL + PostGIS. Prod: Postgres self-hosted (ADR 0006, reemplazó Neon); compose `imresamu/postgis:18-3.6`. Flyway separado (`flyway_schema_history_territory` / `flyway_schema_history_reporting`). |
| Frontend | Angular 22 zoneless SSR/PWA, TypeScript 6, Vitest (jsdom), pnpm 9.15.0 |
| Mapas | MapLibre GL 6 (reemplazó Leaflet + `@turf/*`, ADR 0010) |
| Mensajería | RabbitMQ 4.3.4-management (flujo WhatsApp de reporting) |
| Infra | Docker Compose, Eureka discovery, Resilience4j circuit breakers, OpenTelemetry (opt-in) |

## Dos stacks independientes
- **Backend:** microservicios Java que se comunican por HTTP (Eureka `lb://`) y RabbitMQ (WhatsApp). Cada servicio con base de datos tiene su propio historial Flyway.
- **Frontend:** Angular SPA/PWA que consume `/api/v1/*` proxyado a `localhost:8080` (gateway). SSR + service worker en build de producción.

## Ver también
- Arquitectura: `../architecture/overview.md`
- Glosario de dominio: `glossary.md`
- Cómo funciona paso a paso: `../architecture/data-flows.md`
- Requerimientos: `../requirements/`
