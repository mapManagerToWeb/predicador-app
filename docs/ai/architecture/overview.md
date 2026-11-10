# Arquitectura — Overview

## Qué es
PWA para gestión de territorio y reportes de predicación (Testigos de Jehová).

## Stack
| Capa | Tecnología |
|---|---|
| Backend | Java 25, Spring Boot 4.1.1, Spring Cloud 2025.1.3, Maven 6 módulos |
| Servicios | config-server(8888), discovery-server(8761), api-gateway(8080), territory-service(8081), reporting-service(8082) |
| DB | PostgreSQL + PostGIS. Prod: contenedor `postgres` self-hosted (ADR 0006, reemplazó Neon); compose `imresamu/postgis:18-3.6` |
| Frontend | Angular 22 zoneless SSR/PWA, TypeScript 6, Vitest, pnpm 9.15.0 |
| Mapas | MapLibre GL 6 (reemplazó Leaflet ADR 0010) |
| Mensajería | RabbitMQ 4.3.4 (flujo WhatsApp de reporting) |

## Flujo principal
1. Login → token HMAC-SHA256 (`SESSION_SECRET` ≥32 bytes). **No es JWT**: es un token opaco `base64url(subject|role|iat|exp).base64url(firma)`.
2. Perfil requerido para `/map` (`profileGuard`).
3. Mapa carga GeoJSON `/api/v1/territories` (MapLibre, feature-state only).
4. Marcar manzanas/calles → `POST /api/v1/reports` → estado del territorio `completed` o `incomplete`.
5. Ciclo (S-13): cerrar un ciclo agrega un reporte de reinicio; corregir/anular agrega otro reporte. El estado de un territorio es **siempre su último reporte** (ADR 0011, 0014).
6. `/visor` público (sin auth).
7. Admin (`adminGuard`), incluido el módulo «Sistema» de solo lectura (ADR 0020) servido por el propio gateway.

## Decisiones clave (ADRs)
- **0010**: MapLibre GL 6 > Leaflet + @turf
- **0011**: Estado territorio = último reporte (no borrar reportes)
- **0014**: Anulación con `anulado_en` + `reemplaza_a`
- **0006**: Postgres self-hosted > Neon
- **0020**: «Sistema» solo lectura a través de `docker-lectura`
- **0021**: Registrar salidas desde el panel

Ver `docs/adr/` para lista completa.
