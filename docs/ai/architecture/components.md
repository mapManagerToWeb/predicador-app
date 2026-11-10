# Componentes — Architecture

## Backend (microservicios)

### Capas (por servicio)
```
controller/ → service/ → repository/ → model/ + dto/
```

- **Cross-cutting**: `backend/shared/` (security, exception, PhoneUtil)
- **Auth**: `SessionTokenService.verify` — tokens HMAC verificados en cada request
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
- Queda **un solo** import `features/admin` → `features/map`: `TERRITORY_COLORS` en `territorios.ts`.
- La geometría de calles (`core/map/lados.ts`) y el envío de WhatsApp (`core/services/whatsapp.ts`) ya se promovieron a `core/` porque los usan dos features.
- Promover a `core/` en lugar de añadir un segundo import.

## «Sistema» (ADR 0020)
- `api-gateway/.../sistema/SistemaController.java` sirve `/api/v1/sistema/**` **el propio gateway** (no está ruteado).
- Exige sesión admin y un pase extra (`PaseSistema`) obtenido reescribiendo la contraseña.
- Lee contenedores solo por `docker-lectura` (HAProxy con dos rutas GET), métricas del host desde `/proc` y respaldos desde la API pública de GitHub. Nunca comanda Docker.