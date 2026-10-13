# Requerimientos funcionales

| ID | Requerimiento | Servicio | Notas |
|---|---|---|---|
| FR-01 | Login con credenciales admin/usuario | auth (gateway → territory/reporting) | `SessionTokenService` JWT HMAC tokens |
| FR-02 | CRUD de territorios (polígonos GeoJSON, PostGIS) | territory-service | Flyway V0–V2 |
| FR-03 | CRUD de encargados (reportes de predicación) | reporting-service | Flyway V0–V8 |
| FR-04 | Guardar reporte de salida (horas, estudios, decisiones) | reporting-service | `Salida` entity, estado `EN_CURSO` |
| FR-05 | Corregir/anular salida (S13 sync) | reporting-service | ADR 0014: `anulado_en` + `reemplaza_a` |
| FR-06 | Mapa interactivo con marcación por lado de manzana | territory-frontend | feature-state only (ADR 0010) |
| FR-07 | Buscador/visor público | territory-frontend, reporting-service | `/api/v1/reports/public/**` unauthenticated |
| FR-08 | Envío notificación WhatsApp (Meta v21.0) | reporting-service | plantilla, `Idempotency-Key` |
| FR-09 | RUM (Real User Monitoring) | reporting-service | `/api/v1/rum` sin retry |
| FR-10 | Backups bdd + age encryption (07:30 UTC diario) | infra/scripts | 90-day artifact |
| FR-11 | Panel admin (corrección territorio, S13 docx) | territory-frontend | adminGuard |

## Detalle flujo FR-02/03/04/05
1. Frontend construye objeto `Salida` → `POST /api/v1/reports`.
2. Backend valida `telefono_invalido`, persiste con FK Usuario/Encargado.
3. Si WhatsApp config → envío plantilla `asignacion_territorio`.
4. Estado territorio = último reporte (ADR 0011). Nunca borrar.