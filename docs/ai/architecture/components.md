# Componentes — Architecture

## Backend (microservicios)

### Capas (por servicio)
```
controller/ → service/ → repository/ → model/ + dto/
```

- **Cross-cutting**: `backend/shared/` (security, exception, PhoneUtil)
- **Auth**: `SessionTokenService.verify` (fan-in 70) — tokens HMAC
- **Exceptions**: `GlobalExceptionHandler` centralizado

### Services
| Servicio | Puerto | Función |
|---|---|---|
| config-server | 8888 | Spring Cloud Config (native) |
| discovery-server | 8761 | Eureka registry |
| api-gateway | 8080 | Entrada única, route config en Java, Resilience4j |
| territory-service | 8081 | CRUD territories + PostGIS spatial |
| reporting-service | 8082 | Reports, encargados, WhatsApp, RUM |

## Frontend (Angular)
- Señales zoneless en servicios root-provided
- HTTP: `HttpClient` + `firstValueFrom`
- Selectores: componentes `app-`, directivas `app`
- Guardas: `profileGuard` → `/map`, `adminGuard` → `/admin`, `/visor` público
- Interceptor order (cargable): `[auth, error, csrf]`

## Mapas
- `core/map/base-map.ts` compartido (field, viewer, admin)
- `maplibre-gl` 6 → worker desde `import.meta.url` → `/vendor/` (assets en `angular.json`)
- `GeoJSONSource.setData` devuelve Promise → `void`
- Marking solo cambia `feature-state`; NUNCA re-upload geometry (ADR 0010)

## Cross-feature layering debt
- `features/admin` → `features/map` solo los 2 imports existentes (TERRITORY_COLORS, zone helpers)
- Promover a `core/` en lugar de un tercer import