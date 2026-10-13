# API — Rutas por servicio

> Rutas extraídas de los controllers (anotaciones `@RequestMapping`/`@GetMapping`/etc.) y del knowledge graph. Todas se alcanzan vía gateway en `/api/v1/*` (ver `gateway.md`). Servicios detrás de Eureka (`lb://`).

## territory-service (8081) — `/api/v1/territories`

### Públicas / usuario
| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/v1/territories` | Lista de territorios |
| GET | `/api/v1/territories/all/geojson` | FeatureCollection completa |
| GET | `/api/v1/territories/colors` | Colores por estado |
| GET | `/api/v1/territories/{number}` | Detalle |
| GET | `/api/v1/territories/{number}/geojson` | GeoJSON de un territorio |
| PUT | `/api/v1/territories/{number}/color` | Cambiar color |

### Admin — `/api/v1/territories/admin` (requiere admin)
| Método | Ruta |
|---|---|
| GET | `/manzanas` |
| GET | `/manzanas/{id}` |
| POST | `/manzanas` |
| PUT | `/manzanas/{id}` |
| DELETE | `/manzanas/{id}` |
| POST | `/manzanas/{id}/reparar` |
| POST | `/manzanas/reasignar` |
| DELETE | `/territorios/{numero}` |
| POST | `/importar` |
| GET | `/calidad` |

## reporting-service (8082)

### Reportes — `/api/v1/reports`
| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/v1/reports` | Crear salida (estado `EN_CURSO`) |
| GET | `/api/v1/reports` | Listar |
| GET | `/api/v1/reports/today` | Del día |
| GET | `/api/v1/reports/batch` | Lote |
| GET | `/api/v1/reports/versions` | Versiones |
| DELETE | `/api/v1/reports` | |

### WhatsApp (bajo `/api/v1/reports`)
| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/v1/reports/send` | Envío (honra `Idempotency-Key`) |
| GET | `/api/v1/reports/send/{idempotencyKey}` | Estado del envío |

> ⚠️ El endpoint `POST /api/v1/reports/whatsapp/async` fue **eliminado** (cierre C1). Los tests solo lo referencian para verificar 404. No reintroducirlo sin ADR.

### Encargados — `/api/v1/encargados`
| Método | Ruta |
|---|---|
| GET | `/api/v1/encargados` |
| POST | `/api/v1/encargados` |
| PUT | `/api/v1/encargados/{id}` |
| GET | `/api/v1/encargados/buscar` |
| POST | `/api/v1/encargados/buscar-crear` |
| POST | `/api/v1/encargados/login` |
| GET | `/api/v1/encargados/session` |

### Encargados admin — `/api/v1/encargados/admin`
| Método | Ruta |
|---|---|
| GET, POST | `/` |
| PUT, DELETE | `/{id}` |
| POST, DELETE | `/{id}/pin` |
| POST | `/{id}/desbloquear` |
| POST | `/{id}/fusionar/{destinoId}` |
| GET, PUT | `/config` |

### Reportes admin — `/api/v1/reports/admin`
| Método | Ruta |
|---|---|
| GET, DELETE | `/` |
| GET | `/whatsapp` |
| GET | `/ciclos` |
| POST | `/ciclos/cerrar` |
| GET | `/estado/{territorio}` |
| GET | `/{id}/salida` |
| POST | `/{id}/corregir` |
| POST | `/correccion` |

### RUM
| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/v1/rum` | **Sin retry** en gateway (deliberado) |

### Públicas (unauthenticated)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/v1/reports/public/estado` | Único path de reports excluido de auth; sirve al `/visor`. **No ampliar la exclusión.** |

## api-gateway (8080)
| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/v1/auth/login` | Autenticación |
| POST | `/api/v1/auth/logout` | |
| ANY | `/fallback/territory` | Fallback de circuit breaker |
| ANY | `/fallback/reporting` | Fallback de circuit breaker |

> Rutas definidas en código: `api-gateway/…/config/RouteConfig.java` (**no** YAML). La discovery locator está deshabilitada.
