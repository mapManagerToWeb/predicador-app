# Glosario de dominio

> Términos que un agente debe entender para no malinterpretar el código. Los nombres de entidades están en español en el código; la UI dice «salida» donde el modelo dice `Report`.

| Término | Significado | Dónde vive |
|---|---|---|
| **Manzana** | Unidad geográfica mínima (polígono PostGIS) dentro de un territorio, identificada por un id string. | `territory-service`, entidad `ManzanaTerritorio` |
| **Territorio** | Agrupación de manzanas, identificada por número y asignable a un encargado. | `territory-service`; `GET /api/v1/territories/{numero}` |
| **Salida** | Registro de predicación: qué manzanas/calles se trabajaron, día y turno, si quedó completo. En el modelo se llama `Report`. | `reporting-service`, entidad `Report` |
| **Encargado** | Persona que recibe territorios y envía salidas; tiene credenciales y, opcionalmente, PIN. | `reporting-service`, `Encargado` |
| **Estado de un reporte** | `completed` (todas las manzanas) o `incomplete` (parcial). Se guarda como string en `Report.estado`. | `reporting-service`; `SumaDeSalidas` |
| **Estado de un territorio** | **Siempre su último reporte no anulado** (ADR 0011). No hay una entidad de estado aparte. | consultas de estado / `EstadoPublicoService` |
| **Situación (mapas)** | Color del número: verde `completado`, amarillo `en-curso`, blanco `sin-registro`. Regla compartida por mapa y visor. | `core/map/estado-publico.ts` (`situacionDe`) |
| **Anulación** | Marcar una salida como enviada por error: fija `anulado_en` (+ `reemplaza_a` si la reemplaza otra). Queda en el historial y no cuenta. | entidad `Report`, ADR 0014 |
| **Corrección** | El administrador corrige una salida o el estado actual del territorio; se **agrega** un reporte y se recalculan los posteriores. Nunca se borra historial. | `POST /api/v1/reports/admin/{id}/corregir`, `POST /api/v1/reports/admin/correccion` |
| **Ciclo** | Periodo de trabajo; cerrarlo reinicia todos los territorios guardando un informe del ciclo. Se puede fijar el día en que empezó. | `ReportAdminController` `/ciclos/cerrar`, `/ciclos/inicio` |
| **S-13 / S-13-S** | Registro de asignación de territorio, por año de servicio; se descarga en Word desde el panel. | `features/admin/pages/s13` |
| **Tipo de sesión** | `completa` (se trabajó todo) o `parcial` (solo una parte). | `Report.tipoSesion` |
| **Turno** | `manana` o `tarde`, elegido al enviar. | `Report.turno` |
| **Día de predicación** | `fecha_predicacion`: el día en que se predicó (hoy, ayer o hasta 7 días atrás). No confundir con `fecha`, que es cuándo se envió. | ADR 0018, `features/map/utils/dia.ts` |
| **Visor** | Vista pública de solo lectura (`/visor`), sin autenticación. | `territory-frontend/features/visor` |
| **Lado** | Subdivisión de una manzana (noroeste, noreste, suroeste, sureste) usada para marcar por calles. | `core/map/lados.ts` |
| **Pregunta** | Confirmación obligatoria antes de descartar marcas o enviar un reporte. | `features/map/` (`mapa.types.ts`, `mapa.store.ts`) |
| **Sistema** | Módulo del panel, solo lectura: VPS, contenedores y respaldos. Exige la contraseña admin otra vez. | `api-gateway/.../sistema/`, ADR 0020 |
| **RUM** | Real User Monitoring — telemetría de performance del cliente. | `POST /api/v1/rum` |

## Convenciones de nombres
- Backend: paquetes `com.predicador.<service>.<layer>`; capas `controller/` → `service/` → `repository/` → `model/` + `dto/`.
- Frontend: componentes `nombre.ts`/`.html`/`.css` (sin `.component.`), selectores `app-` (kebab) y directivas `app` (camel).
- Rutas HTTP: `/api/v1/<recurso>`; admin bajo `/api/v1/<recurso>/admin`.
