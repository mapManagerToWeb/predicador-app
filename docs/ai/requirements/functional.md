# Requerimientos funcionales

| ID | Requerimiento | Servicio | Notas |
|---|---|---|---|
| FR-01 | Login admin (usuario/contraseña) y login de encargado (teléfono + PIN opcional) | auth (gateway) / reporting | Token HMAC-SHA256, no JWT |
| FR-02 | CRUD de territorios (polígonos GeoJSON, PostGIS) | territory-service | Flyway V0–V2 |
| FR-03 | CRUD de encargados (alta, edición, PIN, fusión, bloqueo) | reporting-service | Flyway V0–V9 + V1_1 |
| FR-04 | Guardar salida (manzanas/calles trabajadas, día y turno) | reporting-service | `Report`, estado `completed`/`incomplete` |
| FR-05 | Corregir o anular una salida (S-13 / panel) | reporting-service | ADR 0014: `anulado_en` + `reemplaza_a`; suma un reporte, nunca borra |
| FR-06 | Mapa interactivo con marcación por manzana y por calles | territory-frontend | feature-state only (ADR 0010) |
| FR-07 | Buscador/visor público | territory-frontend, reporting-service | `/api/v1/reports/public/**` sin auth |
| FR-08 | Envío del resumen por WhatsApp (Meta v21.0) | reporting-service | plantilla + `Idempotency-Key`; destino = teléfono del encargado logueado (ADR 0016) |
| FR-09 | RUM (Real User Monitoring) | reporting-service | `/api/v1/rum` sin retry |
| FR-10 | Respaldo cifrado de la base, fuera del VPS | infra/scripts | diario 07:30 UTC; artefacto 90 días (ADR 0012) |
| FR-11 | Panel admin (S-13 en Word, ciclos, corrección, territorios, encargados, reportes) | territory-frontend | `adminGuard` |
| FR-12 | Módulo «Sistema» de solo lectura (VPS, contenedores, respaldos) | api-gateway | pase con la contraseña admin; 403 nunca 401 (ADR 0020) |
| FR-13 | Registrar salidas informadas por WhatsApp desde el panel | reporting-service | una o varias por salida, todo o nada (ADR 0021) |
| FR-14 | Cargar lista de hermanos (Excel/CSV/pegado) con simulación | reporting-service | `POST /api/v1/encargados/admin/importar` |
| FR-15 | Abrir/cerrar el auto-registro de encargados | reporting-service | `GET /api/v1/encargados/registro` es público y solo devuelve `{abierto}` |

## Detalle flujo FR-02/03/04/05
1. Frontend construye la salida → `POST /api/v1/reports`.
2. Backend valida teléfono chileno, persiste el `Report` y suma sus manzanas.
3. Si WhatsApp está configurado → envío de plantilla `asignacion_territorio`.
4. Estado del territorio = último reporte no anulado (ADR 0011). Nunca se borra.
