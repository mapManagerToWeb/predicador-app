# Data Flows — cómo funciona el sistema paso a paso

> Narrativa verificada contra el código (2026-10-09). Rutas exactas en `../api-reference/services.md`.

## 0 — Precondiciones
- Backend levantado en orden: config-server (8888) → discovery-server (8761) → api-gateway (8080) → territory-service (8081) / reporting-service (8082).
- Frontend: `ng serve` (proxy `/api` → `localhost:8080`) o build de producción (`pnpm run build`).
- DB con datos. Producción = Postgres self-hosted del compose (ADR 0006, **reemplazó Neon**).
- WhatsApp opcional: requiere `WHATSAPP_PHONE_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE`, `WHATSAPP_DESTINATION`.

## 1 — Login
1. `POST /api/v1/auth/login` (api-gateway).
2. Token HMAC firmado con `SESSION_SECRET` (≥32 bytes fuera del perfil `local`).
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
1. Click en polígono → formulario (horas, estudios, decisiones, comentarios).
2. Confirmación obligatoria vía `Pregunta` antes de enviar.
3. `POST /api/v1/reports` → reporting-service valida (incl. teléfono chileno) y persiste `Salida`.
4. Estado resultante: `EN_CURSO`. El estado de un territorio es **siempre su último reporte** (ADR 0011).
5. Frontend actualiza `feature-state` (toast de éxito).

## 4 — Cierre de ciclo (S13) y corrección
- **Cierre:** `POST /api/v1/reports/admin/ciclos/cerrar` → el/los territorios pasan a `REPORTADO`.
- **Corrección:** `POST /api/v1/reports/admin/{id}/corregir` → clona el reporte y marca el original con `reemplaza_a` (ADR 0014).
- **Anulación:** fija `anulado_en` + `reemplaza_a`; el historial se preserva y se ignora en las consultas de estado.
- **Batch:** `POST /api/v1/reports/admin/correccion`.
- **Regla:** un cierre/corrección/anulación **agrega** un reporte. Nunca se borra un reporte para cambiar el estado (ADR 0011).

## 5 — Visor público (`/visor`)
- Ruta **intencionalmente pública** (sin `profileGuard`).
- Endpoint: `GET /api/v1/reports/public/estado` — el único path de reports excluido de auth (`SecurityRules.REPORTS_PATH`). **No ampliar la exclusión.**
- Solo lectura.

## 6 — Admin (`/admin`)
- Requiere `adminGuard`.
- CRUD de encargados (`/api/v1/encargados/admin/**`), corrección/anulación, ciclos, estado por territorio.
- Deuda conocida: 2 imports cross-feature `features/admin` → `features/map` (promover a `core/`, no añadir un tercero).

## 7 — WhatsApp (opcional, reporting-service)
- `RabbitMQConfig` + `SumaDeSalidas` (publisher/listener) → `WhatsAppMessageClient.sendTemplateMessage`.
- Header `Idempotency-Key` (UUID) para evitar duplicados.
- Meta Graph API **v21.0**: `POST /v21.0/{phone_id}/messages`.
- Plantilla por defecto `asignacion_territorio`. Best-effort: no bloquea el flujo principal.
- `GET /api/v1/reports/send/{idempotencyKey}` consulta el estado del envío.

## 8 — Gateway → Services
- `/api/v1/territories/*` → `lb://territory-service` + circuit breaker + retry **solo GET**.
- `/api/v1/reports/**`, `/encargados/**`, RUM → `lb://reporting-service`.
- `/api/v1/rum` → **sin retry** (deliberado).
- `/api/v1/reports/public/**` → unauthenticated (visor).
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
