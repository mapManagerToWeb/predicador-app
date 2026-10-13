# Métricas de performance

> No hay profiling de p95 ni métricas de runtime persistidas en el repo. Aquí se documentan tiempos de build/compilación medidos y las **restricciones de performance conocidas** que un agente no debe violar.

## Tiempos medidos (2026-10-09)
| Medición | Valor |
|---|---|
| Backend reactor completo (`mvn verify -B -DskipTests`) | ~5.7 s |
| Frontend build (`pnpm run build`) | ~5.5 s |
| Chunk lazy `maplibre-gl` | ~1.06 MB (lazy) |
| Chunks de feature | map ~73.9 kB, s13 ~43.6 kB |
| Bundle inicial | 346.32 kB (budget 320 kB → 26.32 kB sobre) |
| Prerender | 1 ruta estática |

## Reglas de performance que NO se deben romper
| Regla | Dónde | Por qué |
|---|---|---|
| Marcación **solo** cambia `feature-state`; nunca re-subir geometría | `features/map/mapa-vista.ts` (ADR 0010) | Re-subir geometría por cada marca degrada el mapa. |
| Satellite source cap en `maxzoom` 18 (base `maxZoom` 20) | `core/map/base-map.ts` | Esri sirve tile gris a 19 sobre Curanilahue → MapLibre sobre-zoom deliberado. |
| `GeoJSONSource.setData` devuelve promise → prefijar con `void` | `features/map/` | Evita bug de orden/estado; requerido por `no-floating-promises`. |
| Retry solo en 502/503/504; nunca 4xx ni status 0 | `core/utils/http-retry.ts` | Evita reintentar errores de cliente. |
| Gateway: retry solo GET; `/api/v1/rum` sin retry | `RouteConfig.java` | Resiliencia sin amplificar fallos. |
| HikariCP `minimum-idle: 0` (cuando aplique) | config | Evita mantener conexiones ociosas. |

## Observabilidad (cuando está activa)
- Backend: Micrometer → Prometheus; tracing OpenTelemetry → Jaeger.
- Dashboards Grafana: JVM, HTTP request rate, error rate, latencia de queries DB.
- Frontend: RUM vía `POST /api/v1/rum` (sin instrumentación automática).

## Cómo medir
```bash
# Tiempos de build
cd backend && time mvn verify -B -DskipTests
cd territory-frontend && time pnpm run build
# Tamaño de bundle: revisar el output de pnpm run build (initial + lazy chunks)
```
> Para profiling real de runtime hace falta levantar la observabilidad opt-in y cargar los dashboards de Grafana.
