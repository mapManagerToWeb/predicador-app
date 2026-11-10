# API — Rutas por servicio

> Rutas extraídas de los controllers (`@RequestMapping`/`@GetMapping`/...). Todas se alcanzan vía gateway en `/api/v1/*` (ver `gateway.md`). Servicios detrás de Eureka (`lb://`). Estado de un reporte: `completed` / `incomplete`.

## territory-service (8081) — `/api/v1/territories`

### Públicas / usuario
| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/v1/territories` | Lista de territorios |
| GET | `/api/v1/territories/all/geojson` | FeatureCollection completa |
| GET | `/api/v1/territories/colors` | Colores por territorio |
| GET | `/api/v1/territories/{number}` | Detalle |
| GET | `/api/v1/territories/{number}/geojson` | GeoJSON de un territorio |
| PUT | `/api/v1/territories/{number}/color` | Admin: cambiar color |

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
| POST | `/api/v1/reports` | Crear salida (`completed` / `incomplete`) |
| GET | `/api/v1/reports` | Listar |
| GET | `/api/v1/reports/today` | Del día |
| GET | `/api/v1/reports/batch` | Lote |
| GET | `/api/v1/reports/versions` | Versiones |
| DELETE | `/api/v1/reports` | Borrar (admin) |

### WhatsApp (bajo `/api/v1/reports`)
| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/v1/reports/send` | Envío; exige `Idempotency-Key` |
| GET | `/api/v1/reports/send/{idempotencyKey}` | Estado del envío |

> ⚠️ `POST /api/v1/reports/whatsapp/async` fue **eliminado**. No reintroducirlo sin ADR.

### Encargados — `/api/v1/encargados`
| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/v1/encargados` | Autenticado |
| POST | `/api/v1/encargados` | Público si el registro está abierto (20/min) |
| PUT | `/api/v1/encargados/{id}` | Autenticado |
| GET | `/api/v1/encargados/buscar` | Autenticado |
| POST | `/api/v1/encargados/buscar-crear` | Público (20/min) |
| POST | `/api/v1/encargados/login` | Público (6/min); + PIN si tiene |
| GET | `/api/v1/encargados/registro` | **Público**: solo `{abierto}` |
| GET | `/api/v1/encargados/session` | Valida la sesión actual |

### Encargados admin — `/api/v1/encargados/admin`
| Método | Ruta |
|---|---|
| GET, POST | `/` |
| PUT, DELETE | `/{id}` |
| POST, DELETE | `/{id}/pin` |
| POST | `/{id}/desbloquear` |
| POST | `/{id}/fusionar/{destinoId}` |
| POST | `/importar` (simulación o carga de lista) |
| GET, PUT | `/config` (registro abierto/cerrado) |

### Reportes admin — `/api/v1/reports/admin`
| Método | Ruta | Notas |
|---|---|---|
| GET, DELETE | `/` | Listado / borrado con `ids=` |
| GET | `/whatsapp` | Últimos envíos |
| GET | `/ciclos` | Ciclos e informes |
| POST | `/ciclos/cerrar` | Cerrar y reiniciar territorios (`{nota}`) |
| POST | `/ciclos/inicio` | Mover el día de inicio del ciclo abierto |
| GET | `/estado/{territorio}` | Estado actual (último reporte) |
| GET | `/{id}/salida` | Detalle de una salida |
| POST | `/{id}/corregir` | Corregir o anular una salida (ADR 0014) |
| POST | `/correccion` | Corregir el estado de un territorio |
| POST | `/salidas` | Registrar una salida desde el panel (ADR 0021) |
| POST | `/salidas/varias` | Varias, todo o nada |
| GET, PUT | `/whatsapp-destino` | Número del resumen del panel |

### RUM
| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/v1/rum` | **Sin retry** en gateway (deliberado, 30/min) |

### Públicas (unauthenticated)
| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/v1/reports/public/estado` | Único path de reports excluido de auth; sirve al `/visor`. **No ampliar la exclusión.** |

## api-gateway (8080) — servido por el propio gateway
| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/v1/auth/login` | Login admin (6/min) |
| POST | `/api/v1/auth/logout` | Cierra la cookie de sesión |
| POST | `/api/v1/sistema/entrar` | Pide de nuevo la contraseña admin (6/min) |
| GET | `/api/v1/sistema/estado` | VPS, contenedores y respaldos (solo lectura) |
| POST | `/api/v1/sistema/salir` | Revoca el pase |
| ANY | `/fallback/territory` | Fallback de circuit breaker |
| ANY | `/fallback/reporting` | Fallback de circuit breaker |

> Rutas definidas en código: `api-gateway/…/config/RouteConfig.java` (**no** YAML). La discovery locator está deshabilitada.
