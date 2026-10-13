# Mapa de referencias — tema → código fuente

> Índice para que un agente salte del tema al archivo real sin grep. Verificar siempre contra el código (la doc puede quedar desactualizada).

| Tema | Archivo(s) |
|---|---|
| Config del gateway (rutas, circuit breakers) | `backend/api-gateway/src/main/java/com/predicador/gateway/config/RouteConfig.java` |
| Seguridad compartida (tokens, reglas) | `backend/shared/src/main/java/com/predicador/shared/security/` (`SessionTokenService`, `SecurityRule`, `TokenValidator`) |
| Manejo de excepciones global | `backend/shared/.../exception/GlobalExceptionHandler.java` |
| Validación de teléfono (backend) | `backend/shared/.../util/PhoneUtil.java` |
| Validación de teléfono (frontend) | `territory-frontend/src/app/core/utils/phone.ts` |
| Controllers de territorio | `backend/territory-service/.../controller/TerritoryController.java`, `TerritoryAdminController.java`, `tile/TileController.java` |
| Controllers de reportes/encargados | `backend/reporting-service/.../controller/` |
| Flujo WhatsApp | `backend/reporting-service/.../config/RabbitMQConfig.java`, `.../service/SumaDeSalidas.java`, `.../client/WhatsAppMessageClient.java` |
| Migraciones territory | `backend/territory-service/src/main/resources/db/migration/` (V0–V2) |
| Migraciones reporting | `backend/reporting-service/src/main/resources/db/migration/` (V0–V8) |
| Config centralizada | `backend/config-server/src/main/resources/config/` |
| Composición Docker | `docker-compose.yml`, `observability/` |
| CI backend | `.github/workflows/ci-backend.yml` |
| CI frontend | `.github/workflows/ci-frontend.yml` |
| Backup/restore DB | `.github/workflows/respaldo-bdd.yml`, `scripts/db/respaldo.sh`, `scripts/db/restaurar.sh` |
| Seguridad CI | `.github/workflows/security.yml` |
| SonarCloud | `.github/workflows/sonarcloud.yml`, `sonar-project.properties` |
| Interceptors frontend | `territory-frontend/src/app/app.config.ts`, `src/app/core/interceptors/` |
| Guards de ruta | `src/app/core/guards/` (`profileGuard`, `adminGuard`) |
| Mapa (base + dibujo) | `territory-frontend/src/app/core/map/base-map.ts`, `src/app/features/map/{mapa.store.ts,mapa-vista.ts}` |
| Helpers puros del mapa | `src/app/features/map/utils/{salida.ts,lados.ts,borrador.ts}` |
| Assets MapLibre | `territory-frontend/angular.json` (glob `/vendor/`) |
| Config de tests frontend | `territory-frontend/vitest.config.ts` |
| ADRs (decisiones) | `docs/adr/` |

## Documentos canónicos
| Documento | Propósito |
|---|---|
| `predicador-app/AGENTS.md` | Instrucciones de repo (verificado). **La fuente más actualizada.** |
| `docs/adr/` | Decisiones de arquitectura. |
| `docs/ai/` | Material de apoyo para IA (este paquete). |
| `CHANGES.md` | Resumen de PRs en lenguaje llano. |
| `openspec/` | Workflow SDD (`changes/`, `specs/`). |
