# Data Flows — cómo funciona el sistema paso a paso

> Narrativa verificada contra el código (2026-11-10). Rutas exactas en `../api-reference/services.md`.

## 0 — Precondiciones
- Backend levantado en orden: config-server (8888) → discovery-server (8761) → api-gateway (8080) → territory-service (8081) / reporting-service (8082).
- Frontend: `ng serve` (proxy `/api` → `localhost:8080`) o build de producción (`pnpm run build`).
- DB con datos. Producción = Postgres self-hosted del compose (ADR 0006, **reemplazó Neon**).
- WhatsApp opcional: requiere `WHATSAPP_PHONE_ID`, `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_TEMPLATE`; `WHATSAPP_DESTINATION` es solo el respaldo cuando no hay un encargado logueado con teléfono válido (ADR 0016).

## 1 — Login
1. Admin: `POST /api/v1/auth/login` (api-gateway). Encargado: `POST /api/v1/encargados/login` (reporting).
2. Token HMAC-SHA256 firmado con `SESSION_SECRET` (≥32 bytes fuera del perfil `local`). No es un JWT: es un token opaco.
3. Interceptor `auth` añade el header `Authorization` en cada request.
4. `SessionTokenService.verify` (fan-in alto) valida en cada servicio.

## 2 — Mapa → Territorio
1. `core/map/base-map.ts` carga MapLibre GL 6 (worker → `/vendor/`, ADR 0010).
2. `mapa.store.ts` mantiene las reglas de dibujo/estado.
3. `mapa-vista.ts` construye las capas (`GeoJSONSource`).
4. Datos: `GET /api/v1/territories/all/geojson` (gateway `lb://` → territory-service).
5. Marcación: solo cambia `feature-state`; nunca re-sube geometría (regla de perf ADR 0010).
   `GeoJSONSource.setData` devuelve promise → prefijar con `void`.

## 3 — Marcar territorio → Reporte (`Salida`)
1. Al tocar una manzana se marca completa; «Por calles» permite marcar solo las calles predicadas. El resumen se confirma con `Pregunta`.
2. Se elige el día de predicación (hoy, ayer o hasta 7 días atrás) y el turno (mañana/tarde) en el diálogo de envío.
3. `POST /api/v1/reports` → reporting-service valida (incl. teléfono chileno) y persiste el `Report`, sumando sus manzanas (`SumaDeSalidas`).
4. Estado resultante: `completed` si quedaron todas las manzanas, `incomplete` si es parcial. El estado de un territorio es **siempre su último reporte no anulado** (ADR 0011).
5. Frontend actualiza `feature-state` (toast de éxito).

## 4 — Cierre de ciclo (S-13) y corrección
- **Cierre:** `POST /api/v1/reports/admin/ciclos/cerrar` → agrega un reporte de reinicio y los territorios vuelven a empezar. Queda un informe del ciclo (descargable).
- **Inicio elegido:** `POST /api/v1/reports/admin/ciclos/inicio` mueve el día en que empezó el ciclo abierto (p. ej. inicio de campaña) sin cerrar otro.
- **Corrección de una salida:** `POST /api/v1/reports/admin/{id}/corregir` → anula la salida original (`anulado_en` + `reemplaza_a`) y recalcula las posteriores (ADR 0014).
- **Corrección de estado:** `POST /api/v1/reports/admin/correccion` → agrega un reporte equivalente al S-13.
- **Registro desde el panel:** `POST /api/v1/reports/admin/salidas` o `/salidas/varias` (ADR 0021) registra lo que un hermano informó como una salida normal en su nombre.
- **Regla:** un cierre/corrección/anulación **agrega** un reporte. Nunca se borra un reporte para cambiar el estado (ADR 0011).

## 5 — Visor público (`/visor`)
- Ruta **intencionalmente pública** (sin `profileGuard`).
- Endpoint: `GET /api/v1/reports/public/estado` — el único path de reports excluido de auth (`SecurityRules.REPORTS_PATH`). **No ampliar la exclusión.**
- Solo lectura.

## 6 — Admin (`/admin`)
- Requiere `adminGuard`.
- CRUD de encargados (`/api/v1/encargados/admin/**`), carga de listas (`/importar`), corrección/anulación, ciclos, registro de salidas (`/reports/admin/salidas`), estado por territorio.
- **Sistema** (`/admin/sistema`): el gateway vuelve a pedir la contraseña y entrega un pase de 15 min de inactividad / 1 h máximo. Los rechazos del pase son **403** con `code` (nunca 401, que cerraría la sesión del panel). Lee solo a través de `docker-lectura`.
- Deuda conocida: un import cross-feature `features/admin` → `features/map` (`TERRITORY_COLORS`); promover a `core/`, no añadir otro.

## 7 — WhatsApp (opcional, reporting-service)
- `ReportSendService` / `WhatsAppSendService` orquestan el envío; `SumaDeSalidas` calcula qué quedó completo.
- `RabbitMQConfig` transporta el envío asíncrono; `WhatsAppMessageClient.sendTemplateMessage` habla con Meta.
- Header `Idempotency-Key` (UUID) obligatorio para el envío asíncrono: 400 sin él, y una clave completada se reutiliza en lugar de reenviar.
- Meta Graph API **v21.0** (configurable): `POST {base-url}/{version}/{phone_id}/messages`.
- Plantilla por defecto `asignacion_territorio`. Destino: el teléfono registrado del encargado logueado; `WHATSAPP_DESTINATION` es solo el fallback (ADR 0016).
- `GET /api/v1/reports/send/{idempotencyKey}` consulta el estado del envío.

## 8 — Gateway → Services
- `/api/v1/territories/*` → `lb://territory-service` + circuit breaker + retry **solo GET**.
- `/api/v1/reports/**`, `/encargados/**`, RUM → `lb://reporting-service`.
- `/api/v1/rum` → **sin retry** (deliberado).
- `/api/v1/reports/public/**` → unauthenticated (visor).
- `/api/v1/auth/**` y `/api/v1/sistema/**` → los sirve el propio gateway (no están ruteados).
- Definido en código: `api-gateway/…/config/RouteConfig.java` (no YAML).

## 9 — Observabilidad (opt-in)
- `docker-compose --profile observability up -d` → otel-collector, jaeger, prometheus, grafana.
- Backend: Micrometer → Prometheus; tracing OTel → Jaeger.

## Puntos de extensión (para IA)
- **Nuevo tipo de reporte:** entidad + DTO + mapper + endpoint en reporting-service + migración Flyway.
- **Nueva capa de mapa:** nuevo `GeoJSONSource` en `mapa-vista.ts`.
- **Auth OIDC/social:** extender `SecurityConfig` + `UserDetailsService`; implica `SessionTokenService`.
- **i18n:** hoy solo es-CL.
- **Deploy a staging:** no existe; añadir stage CI/CD si se decide.
