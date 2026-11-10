# Mapa de referencias — tema → código fuente

> Índice para que un agente salte del tema al archivo real sin grep. Verificar siempre contra el código (la doc puede quedar desactualizada).

| Tema | Archivo(s) |
|---|---|
| Config del gateway (rutas, circuit breakers) | `backend/api-gateway/src/main/java/com/predicador/gateway/config/RouteConfig.java` |
| Seguridad compartida (tokens, reglas) | `backend/shared/src/main/java/com/predicador/shared/security/` (`SessionTokenService`, `SessionToken`, `SecurityRules`, `SessionAuthFilter`, `AuthorizationService`, `TokenValidator`) |
| Manejo de excepciones global | `backend/shared/.../exception/GlobalExceptionHandler.java` |
| Validación de teléfono (backend) | `backend/shared/.../util/PhoneUtil.java` |
| Validación de teléfono (frontend) | `territory-frontend/src/app/core/utils/phone.ts` |
| Módulo «Sistema» (VPS, contenedores, respaldos) | `backend/api-gateway/src/main/java/com/predicador/gateway/sistema/` (`SistemaController`, `PaseSistema`, `EstadoSistema`, `ClaveAdministrador`) |
| Proxy de solo lectura a Docker | `docker-lectura/haproxy.cfg` |
| Controllers de territorio | `backend/territory-service/.../controller/TerritoryController.java`, `TerritoryAdminController.java` |
| Controllers de reportes/encargados | `backend/reporting-service/.../controller/` |
| Flujo WhatsApp | `backend/reporting-service/.../config/RabbitMQConfig.java`, `.../service/{ReportSendService,WhatsAppSendService,SumaDeSalidas}.java`, `.../client/WhatsAppMessageClient.java` |
| Corrección / anulación de salidas | `.../service/CorreccionDeSalidas.java`, `ReportAdminController#corregirSalida` |
| Migraciones territory | `backend/territory-service/src/main/resources/db/migration/` (V0–V2) |
| Migraciones reporting | `backend/reporting-service/src/main/resources/db/migration/` (V0–V9 + `V1_1`) |
| Config centralizada | `backend/config-server/src/main/resources/config/` |
| Composición Docker | `docker-compose.yml`, `docker-lectura/haproxy.cfg`, `observability/` |
| CI backend | `.github/workflows/ci-backend.yml` |
| CI frontend | `.github/workflows/ci-frontend.yml` |
| Backup/restore DB | `.github/workflows/respaldo-bdd.yml`, `scripts/db/{respaldo,restaurar,instalar-age}.sh` |
| Seguridad CI | `.github/workflows/security.yml` |
| SonarCloud | `.github/workflows/sonarcloud.yml`, `sonar-project.properties` |
| Interceptors frontend | `territory-frontend/src/app/app.config.ts`, `src/app/core/interceptors/` |
| Guards de ruta | `src/app/core/guards/` (`profileGuard`, `adminGuard`) |
| Mapa (base + dibujo) | `src/app/core/map/base-map.ts`, `src/app/features/map/{mapa.store.ts,mapa-vista.ts,mapa.datos.ts}` |
| Helpers puros del mapa | `src/app/features/map/utils/{salida.ts,borrador.ts,dia.ts}`, `src/app/core/map/lados.ts` |
| Situación de un territorio (colores) | `src/app/core/map/estado-publico.ts` |
| Panel: registrar salida / lista de hermanos | `src/app/features/admin/pages/registrar/`, `src/app/features/admin/utils/lista-hermanos.ts` |
| Panel: «Sistema» | `src/app/features/admin/pages/sistema/` |
| Assets MapLibre | `territory-frontend/angular.json` (glob `/vendor/`) |
| Config de tests frontend | `territory-frontend/vitest.config.ts` |
| ADRs (decisiones) | `docs/adr/` |

## Documentos canónicos
| Documento | Propósito |
|---|---|
| `predicador-app/AGENTS.md` | Instrucciones de repo (verificado). **La fuente más actualizada.** |
| `docs/adr/` | Decisiones de arquitectura (0001–0018, 0020, 0021). |
| `docs/ai/` | Material de apoyo para IA (este paquete). |
| `CHANGES.md` | Resumen de PRs en lenguaje llano. |
| `openspec/` | Workflow SDD (`changes/`, `specs/`). |
