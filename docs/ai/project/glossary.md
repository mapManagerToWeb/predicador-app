# Glosario de dominio

> Términos que un agente debe entender para no malinterpretar el código. Los nombres de entidades están en español en el código.

| Término | Significado | Dónde vive |
|---|---|---|
| **Manzana** | Unidad geográfica mínima (polígono PostGIS) dentro de un territorio. | `territory-service`, entidad `Manzana` |
| **Territorio** | Agrupación de manzanas asignable a un encargado. | `territory-service`; `GET /api/v1/territories/{number}` |
| **Salida** | Un registro de predicación (horas, estudios, decisiones). Entidad central del dominio. | `reporting-service`, entidad `Salida` |
| **Encargado** | Persona que recibe/asigna territorios; tiene credenciales y PIN. | `reporting-service`, `Encargado` |
| **S13** | Formulario/periodo de reporte (cierre de ciclo). Un ciclo S13 se cierra y genera estado. | `reporting-service`, ciclos |
| **Ciclo** | Periodo de reporte; cerrar un ciclo cambia estados de territorio. | `ReportAdminController` `/ciclos/cerrar` |
| **Estado de territorio** | `EN_CURSO` / `REPORTADO` / `ANULADO`. **Siempre es el último reporte** (ADR 0011). | `reporting-service` |
| **Anulación** | Anular una salida sin borrarla: fija `anulado_en` + `reemplaza_a` (ADR 0014). | entidad `Salida` |
| **Corrección** | Reemplazar una salida por una versión corregida, conservando historial. | `POST /api/v1/reports/admin/{id}/corregir` |
| **Visor** | Vista pública de solo lectura (`/visor`), sin autenticación. | `territory-frontend/features/visor` |
| **Lado** | Subdivisión de una manzana (noroeste, noreste, suroeste, sureste) usada para marcación. | `features/map/utils/lados.ts` |
| **Lote/Loteo** | Conjunto de manzanas entregadas juntas en una asignación. | territory admin |
| **RUM** | Real User Monitoring — telemetría de performance del cliente. | `POST /api/v1/rum` |
| **Pregunta** | Confirmación obligatoria antes de descartar marcas o enviar un reporte. | `features/map/` |

## Convenciones de nombres
- Backend: paquetes `com.predicador.<service>.<layer>`; capas `controller/` → `service/` → `repository/` → `model/` + `dto/`.
- Frontend: componentes `nombre.ts`/`.html`/`.css` (sin `.component.`), selectores `app-` (kebab) y directivas `app` (camel).
- Rutas HTTP: `/api/v1/<recurso>`; admin bajo `/api/v1/<recurso>/admin`.
