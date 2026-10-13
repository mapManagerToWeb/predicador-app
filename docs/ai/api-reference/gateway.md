# Rutas Gateway (RouteConfig.java — code-configured, no YAML)

| Ruta | Servicio | Notas |
|---|---|---|
| `/api/v1/territories/*` | `lb://territory-service` | circuit breaker + retry GET |
| `/api/v1/reports/**` | `lb://reporting-service` | |
| `/api/v1/encargados/**` | `lb://reporting-service` | |
| `/api/v1/rum` | `lb://reporting-service` | **sin retry** (deliberado) |
| `/api/v1/reports/public/**` | `lb://reporting-service` | unauthenticated |

Todas con Resilience4j + fallback. `api-gateway/…/config/RouteConfig.java`.