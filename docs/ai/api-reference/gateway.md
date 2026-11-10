# Rutas Gateway (RouteConfig.java — code-configured, no YAML)

| Ruta | Destino | Notas |
|---|---|---|
| `/api/v1/territories/*` | `lb://territory-service` | circuit breaker + retry GET |
| `/api/v1/reports/**` | `lb://reporting-service` | circuit breaker + retry GET |
| `/api/v1/encargados/**` | `lb://reporting-service` | circuit breaker + retry GET |
| `/api/v1/rum` | `lb://reporting-service` | **sin retry** (deliberado) |
| `/api/v1/reports/public/**` | `lb://reporting-service` | unauthenticated |
| `/api/v1/auth/**` | gateway (mismo proceso) | login/logout admin |
| `/api/v1/sistema/**` | gateway (mismo proceso) | módulo «Sistema», ADR 0020; no ruteado |
| `/fallback/territory`, `/fallback/reporting` | gateway | fallbacks de circuit breaker |

Las rutas ruteadas usan Resilience4j + fallback. Definidas en `api-gateway/…/config/RouteConfig.java`; la discovery locator está deshabilitada.
