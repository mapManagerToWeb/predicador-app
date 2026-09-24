# Predicador

PWA para gestión de territorios y reportes de predicación de los Testigos de Jehová.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                   Frontend (Angular 22)                      │
│                  territory-frontend/                         │
│            PWA + SSR + Service Worker                         │
└──────────────────────┬──────────────────────────────────────┘
                       │ /api
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                   API Gateway (Spring Cloud)                  │
│                       api-gateway:8080                       │
│         CORS · Rate Limiting · Circuit Breaker · Auth         │
└─────────┬──────────────────────────────────┬────────────────┘
          │                                  │
          ▼                                  ▼
┌──────────────────────┐           ┌──────────────────────────┐
│  Territory Service   │           │    Reporting Service      │
│    territory:8081    │           │     reporting:8082        │
│  GeoJSON · Colores   │           │  Reports · Encargados    │
│  PostGIS · Cache     │           │  WhatsApp · RUM           │
└──────────┬───────────┘           └────────────┬─────────────┘
           │                                    │
           ▼                                    ▼
┌──────────────────────────────────────────────────────────────┐
│              PostgreSQL 18 + PostGIS 3.6 (contenedor)         │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Config Server:8888  ←──  Discovery Server:8761 (Eureka)     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Observability (opcional): Prometheus · Grafana · Jaeger     │
└──────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Backend

| Componente | Tecnología |
|---|---|
| Runtime | Java 25 (virtual threads) |
| Framework | Spring Boot 4.1.1 |
| Microservicios | Spring Cloud 2025.1.3 |
| Gateway | Spring Cloud Gateway (WebFlux) |
| Service Discovery | Netflix Eureka |
| Config Server | Spring Cloud Config (native) |
| Base de datos | PostgreSQL + PostGIS |
| Migraciones | Flyway |
| Cache | Caffeine (10min TTL) |
| Resiliencia | Resilience4j (Circuit Breaker + Retry) |
| Rate Limiting | Bucket4j + Caffeine |
| Seguridad | HMAC-SHA256 tokens, BCrypt |
| Observabilidad | OpenTelemetry, Micrometer, Prometheus |
| WhatsApp | Meta Graph API v21.0 |
| API Docs | SpringDoc OpenAPI |
| Testing | JUnit 5 + Mockito |
| Coverage | JaCoCo |
| Build | Maven 3.9 |

### Frontend

| Componente | Tecnología |
|---|---|
| Framework | Angular 22 |
| Lenguaje | TypeScript 6 |
| SSR | Angular SSR (Express 5) |
| PWA | Service Worker (ngsw) |
| Mapas | Leaflet 1.9 |
| Estado | Angular Signals |
| Testing | Vitest 4 + jsdom |
| Coverage | V8 |
| Linting | ESLint + Prettier |
| Build | Angular CLI (Vite) |
| Geometria | polygon-clipping, @turf/simplify, @turf/union, @turf/helpers |
| Screenshots | Captura propia a canvas offscreen (`MapCanvasCaptureService` — dibuja tiles + vectores Leaflet; reemplaza html-to-image, roto en iOS WebKit) |
| RUM | web-vitals |

### Infraestructura

| Componente | Tecnología |
|---|---|
| Contenedores | Docker (multi-stage) |
| Orquestación | Docker Compose |
| CI/CD | GitHub Actions |
| Análisis estático | SonarQube |
| Dependencias | Dependabot |
| Carga | k6 (load testing) |

## Características

### Frontend

- **Mapa interactivo**: Visualización de territorios con Leaflet, capas de OpenStreetMap, CartoDB y ArcGIS satellite
- **Modo de marcado completo**: Tocar una manzana para marcarla como visitada
- **Modo de marcado parcial**: Dibujar polígonos personalizados en bordes de manzana (hasta 6 puntos)
- **Selección de territorios**: Búsqueda con autocompletado, selección múltiple
- **Gestión de colores**: Colores asignados por territorio para diferenciación visual
- **Captura de pantalla**: Screenshot automático del mapa para envío por WhatsApp
- **Envío de reportes**: Generación y envío de reportes vía WhatsApp con plantilla formateada, dirigido al teléfono del encargado logueado. Un territorio único marcado como **completo** se envía **sin captura** (imagen predeterminada), anunciando su cierre; los territorios incompletos/parciales se envían **con captura**. En un reporte multi-territorio, los territorios ya completados se excluyen del mensaje y de la imagen. Cada territorio se lista como `*terminado*` o `*incompleto*`
- **Guardado local**: Marcado persistido en base de datos, restauración al recargar
- **Notificaciones responsivas**: Toast notifications adaptables con soporte para multilínea en pantallas móviles y modo claro/oscuro
- **Modo oscuro**: Soporte completo de temas claro/oscuro
- **PWA**: Instalable, funciona offline con Service Worker
- **SSR**: Server-Side Rendering para SEO y performance inicial
- **RUM**: Core Web Vitals (LCP, INP, CLS, FCP, TTFB) enviados al backend
- **Autenticación**: Login por teléfono (+56 Chile), tokens HMAC
- **Admin Panel**: Gestión de colores de territorios con login admin
- **Session selector**: Selección de horario (Mañana/Tarde)
- **Satellite view**: Toggle entre vista normal y satelital

**Rendimiento del mapa (2026-09-14):** el renderer es el `Canvas` estándar de Leaflet 1.9.4 — durante el pan el canvas se mueve con transform GPU y los vectores se repintan solo en `moveend` (sin repintado por frame). El hit-testing de manzanas usa un grid espacial uniforme (celda 0.002° ≈ 200 m): un tap consulta solo la celda del punto (O(1) promedio) y el "nearest" mira una ventana 3×3 de celdas. La geometría procesada de los territorios (simplify + union) se calcula una vez por sesión y se cachea en `sessionStorage`.

### Backend

- **Microservicios**: 5 servicios independientes con discovery y config centralizada
- **API Gateway**: Punto de entrada único con routing, CORS, rate limiting, circuit breaker
- **Rate Limiting**: Bucket4j por IP (auth: 6/min, registro: 20/min, RUM: 30/min)
- **Circuit Breaker**: Resilience4j con fallbacks para territory-service y reporting-service
- **Cache**: Caffeine con 4 regiones (GeoJSON, colores, números, territory individual) + ETags
- **Seguridad**: Tokens HMAC-SHA256, BCrypt para passwords, constant-time comparison
- **WhatsApp**: Integración Meta Graph API v21.0 con templates, normalización telefónica chilena
- **PostGIS**: Almacenamiento y consulta de geometrías espaciales
- **Flyway**: Migraciones de base de datos versionadas
- **Virtual Threads**: Java 25 virtual threads para mejor concurrencia
- **Observability**: OpenTelemetry tracing, Prometheus metrics, Grafana dashboards
- **Validación**: Bean Validation en todos los DTOs con respuestas ProblemDetail (RFC 7807)
- **CORS**: Configurable por variable de entorno
- **Cache Headers**: Cache-Control en endpoints de territorios (5-10 min)

## Quick Start

### Docker (recomendado)

```bash
# 1. Clonar el repositorio
git clone <repo-url>
cd predicador-app

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de BD y WhatsApp

# 3. Levantar todos los servicios
docker-compose up --build

# 4. (Opcional) Levantar stack de observabilidad
docker-compose --profile observability up -d
```

### Desarrollo local

**Prerequisitos:**
- Java 25
- Node.js 22
- Maven 3.9
- PostgreSQL 16 + PostGIS

**Backend:**
```bash
cd backend

# Compilar todos los módulos
mvn clean install

# Iniciar en orden (cada uno en una terminal):
mvn -pl config-server spring-boot:run          # :8888
mvn -pl discovery-server spring-boot:run       # :8761
mvn -pl api-gateway spring-boot:run            # :8080
mvn -pl territory-service spring-boot:run      # :8081
mvn -pl reporting-service spring-boot:run      # :8082
```

**Frontend:**
```bash
cd territory-frontend

# Instalar dependencias (pnpm; se instala automáticamente vía Corepack
# desde el campo `packageManager` de package.json)
corepack enable
pnpm install

# Desarrollo (proxy a :8080)
pnpm start                   # http://localhost:4200

# SSR producción
pnpm run build
pnpm run serve:ssr:territory-frontend  # http://localhost:4000
```

## Comandos

### Frontend (`territory-frontend/`)

| Comando | Descripción |
|---|---|
| `pnpm start` | Servidor de desarrollo (http://localhost:4200) |
| `pnpm run build` | Build de producción con SSR |
| `pnpm run watch` | Build en modo watch |
| `pnpm test` | Ejecutar tests (Vitest) |
| `pnpm run test:watch` | Tests en modo watch |
| `pnpm run test:coverage` | Tests con cobertura V8 |
| `pnpm run lint` | Verificar lint (ESLint) |
| `pnpm run lint:fix` | Auto-fix lint + Prettier |
| `pnpm run serve:ssr:territory-frontend` | Servidor SSR producción |

### Backend (`backend/`)

| Comando | Descripción |
|---|---|
| `mvn clean install` | Compilar todos los módulos |
| `mvn clean test` | Ejecutar todos los tests |
| `mvn clean verify` | Tests + verificaciones |
| `mvn -pl <module> spring-boot:run` | Iniciar un servicio específico |
| `mvn -pl <module> test` | Tests de un módulo específico |
| `mvn verify -Pcoverage` | Tests con reporte JaCoCo |

### Docker

| Comando | Descripción |
|---|---|
| `docker-compose up --build` | Levantar todo (foreground) |
| `docker-compose up -d` | Levantar todo (background) |
| `docker-compose down` | Detener todos los servicios |
| `docker-compose logs -f <service>` | Ver logs de un servicio |
| `docker-compose --profile observability up -d` | Levantar con observabilidad |

### SonarQube

```bash
# Escanear frontend
cd territory-frontend
pnpm run build
npx sonar-scanner

# Escanear backend
cd backend
mvn clean verify
npx sonar-scanner
```

## Base de datos (PostgreSQL + PostGIS) e importación de territorios

La base de datos es PostgreSQL 18 + PostGIS 3.6 en el contenedor `postgres` de
`docker-compose.yml` (antes Neon; ver `docs/adr/0006`). Para copiar los datos
desde Neon una sola vez:

```bash
NEON_URL='postgresql://...neon.tech/neondb?sslmode=require' ./scripts/db/migrate-from-neon.sh
```

Los territorios
se importan **externamente** en la tabla `manzanas_territorio`: cada manzana
guarda su geometría como tipo PostGIS `geometry(GeometryZ, 4326)` (la columna
`geometry`). No hay un seed automático en el repo; los shapes se cargaron una vez
con el SRID 4326 (Polygon y MultiPolygon, con coordenadas 2D + Z).

`territory-service` expone esa geometría como GeoJSON generándolo con PostGIS
(`ST_AsGeoJSON(ST_Force2D(geometry))`), de modo que no se parsea WKB/WKT en Java
y se soportan Polygon, MultiPolygon y huecos de forma nativa.

### Migraciones (Flyway)

Cada servicio que posee base de datos versiona sus migraciones en una tabla de
historial **propia**, aunque compartan la misma base:

| Servicio | Tabla de historial | Migraciones |
|---|---|---|
| `territory-service` | `flyway_schema_history_territory` | `V0__initial_schema.sql`, `V1__add_indexes.sql`, `V2__add_geometry_gist_index.sql` |
| `reporting-service` | `flyway_schema_history_reporting` | `V0__initial_schema.sql`, `V1__add_indexes.sql`, `V1_1`, `V2`, `V3`, `V4`, `V5` |

Ambos servicios usan `DB_URL_UNPOOLED` (conexión directa, sin `-pooler`) para
las migraciones Flyway, ya que PgBouncer en modo transacción no soporta DDL ni
prepared statements.

## Variables de Entorno

Ver `.env.example` para la lista completa.

| Variable | Descripción | Default |
|---|---|---|
| `DB_URL` | JDBC URL de PostgreSQL | `jdbc:postgresql://postgres:5432/predicador` (compose) |
| `DB_URL_UNPOOLED` | JDBC URL directa (sin `-pooler`) para Flyway/backups | `jdbc:postgresql://localhost:5432/predicador` |
| `DB_USERNAME` | Usuario de BD | `predicador` |
| `DB_PASSWORD` | Contraseña de BD (obligatoria en compose) | — |
| `ADMIN_USERNAME` | Usuario admin | `admin` |
| `ADMIN_PASSWORD` | Contraseña admin (fallback plano) | `admin` |
| `ADMIN_PASSWORD_BCRYPT` | Contraseña admin (BCrypt, preferido) | — |
| `SESSION_SECRET` | HMAC secret para tokens (mín. 32 bytes) | — |
| `SESSION_TTL_HOURS` | Duración del token en horas | `12` |
| `EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE` | Eureka server | `http://localhost:8761/eureka/` |
| `SPRING_CLOUD_CONFIG_URI` | Config server | `http://localhost:8888` |
| `CORS_ALLOWED_ORIGINS` | Orígenes permitidos (CORS) | `http://localhost:4200` |
| `WHATSAPP_PHONE_ID` | Meta Phone Number ID | — |
| `WHATSAPP_ACCESS_TOKEN` | Meta Access Token | — |
| `WHATSAPP_TEMPLATE` | Nombre de plantilla WhatsApp | `asignacion_territorio` |
| `WHATSAPP_DESTINATION` | Número destino WhatsApp | — |
| `WHATSAPP_LANG` | Idioma de plantilla | `es_CL` |

## Microservicios

| Servicio | Puerto App | Puerto Management | Descripción |
|---|---|---|---|
| `config-server` | 8888 | — | Configuración centralizada (Spring Cloud Config, native) |
| `discovery-server` | 8761 | — | Registro de servicios (Netflix Eureka) |
| `api-gateway` | 8080 | 8090 | Punto de entrada único (Spring Cloud Gateway) |
| `territory-service` | 8081 | 8091 | CRUD de territorios, GeoJSON, colores |
| `reporting-service` | 8082 | 8092 | Reportes, encargados, WhatsApp, RUM |

## API Endpoints

### API Gateway (`:8080`)

| Método | Ruta | Auth | Rate Limit | Descripción |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/login` | — | 6/min | Login admin |

### Territory Service

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/v1/territories` | Público | Números de territorios |
| `GET` | `/api/v1/territories/{n}` | Público | Territorio por número |
| `GET` | `/api/v1/territories/all/geojson` | Público | GeoJSON de todos los territorios |
| `GET` | `/api/v1/territories/{n}/geojson` | Público | GeoJSON de un territorio |
| `GET` | `/api/v1/territories/colors` | Público | Colores asignados |
| `PUT` | `/api/v1/territories/{n}/color` | Admin | Asignar color |

### Reporting Service

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/v1/reports` | Autenticado | Crear reportes |
| `GET` | `/api/v1/reports` | Autenticado | Listar reportes |
| `GET` | `/api/v1/reports/today` | Autenticado | Reportes del día |
| `POST` | `/api/v1/reports/send` | Autenticado | Enviar reporte por WhatsApp |
| `GET` | `/api/v1/encargados` | Autenticado | Listar encargados activos |
| `POST` | `/api/v1/encargados` | Público | Crear encargado |
| `PUT` | `/api/v1/encargados/{id}` | Autenticado | Actualizar encargado |
| `GET` | `/api/v1/encargados/buscar` | Autenticado | Buscar encargados |
| `POST` | `/api/v1/encargados/buscar-crear` | Público (20/min) | Buscar o crear encargado + token |
| `POST` | `/api/v1/encargados/login` | Público (6/min) | Login por teléfono + token |
| `POST` | `/api/v1/rum` | Público (30/min) | Ingesta Core Web Vitals |

## Testing

### Frontend

```bash
cd territory-frontend

# Ejecutar tests
pnpm test                     # Ejecución única
pnpm run test:watch           # Watch mode
pnpm run test:coverage        # Con cobertura V8

# Cobertura mínima (vitest.config.ts)
# Lines: 30% | Statements: 30% | Functions: 30% | Branches: 20%
```

**Archivos de test (44 spec files):**
- Core: `profile.ts`, `auth-token.ts`, `auth.service.ts`, `territorio.ts`, `toast.ts`, `csrf-token.ts`, `encargado.ts`, `rum.ts`, `map-draft.service.ts`, `report-cache.service.ts`, `phone.ts`
- Interceptors: `auth.interceptor.ts`, `error.interceptor.ts`, `csrf.interceptor.ts`
- Guards: `admin.guard.ts`, `profile.guard.ts`
- Map: `map.ts`, `map-geometry.ts`, `manzana-spatial-index.ts`, `map-rings.ts`, `map-engine.service.ts`, `map-tile-layer.service.ts`, `map-location.service.ts`, `map-partial-mark.service.ts`, `map-initialization.service.ts`, `map-mark-restoration.service.ts`, `map-layer-registry.service.ts`, `map-canvas-capture.service.ts`, `map-capture.service.ts`, `map-partial-draw.service.ts`, `map-rendering.facade.ts`, `map-report.service.ts`, `map-data-persistence.service.ts`, `map-interaction.service.ts`, `map-territory-layer.service.ts`, `map-state.service.ts`, `map-selection.service.ts`, `map-style.ts`, `whatsapp.ts`, `territory-search.ts`
- Auth/Admin/Profile/SSR: `login.ts`, `admin.ts`, `profile.ts`, `server.spec.ts`

### Backend

```bash
cd backend

# Ejecutar todos los tests
mvn clean test

# Tests con cobertura JaCoCo
mvn clean verify -Pcoverage

# Tests de un módulo específico
mvn -pl territory-service test
mvn -pl reporting-service test
mvn -pl shared test
```

**Cobertura:** JaCoCo habilitado via Maven profile `coverage`.

### Load Testing

```bash
# k6 load test para API Gateway
cd tests/load
k6 run api-gateway.js
```

### CI/CD

GitHub Actions ejecuta automáticamente:

- **ci-backend.yml**: Build + test con PostgreSQL (PostGIS) + JaCoCo
- **ci-frontend.yml**: Lint + Type check + Test + Build
- **docker.yml**: Build de imágenes Docker
- **security.yml**: Análisis de seguridad

## Observability

### Stack (docker-compose profile: `observability`)

| Servicio | Puerto | Descripción |
|---|---|---|
| Prometheus | :9090 | Métricas y alertas |
| Grafana | :3000 | Dashboards (admin/admin) |
| Jaeger | :16686 | Distributed tracing UI |
| OTel Collector | :4317/:4318 | Recolección de traces |

### Métricas

- **HTTP**: Requests/sec, errores 5xx, latencia P95
- **JVM**: Heap usage, GC pause time, threads
- **Web Vitals**: LCP, INP, CLS, FCP, TTFB (por ruta)
- **WhatsApp**: Sends/min, duration, success/failure
- **Circuit Breaker**: State, failure rate
- **Territory**: GeoJSON load duration, cache hits
- **Database**: HikariCP connections

### Activar observabilidad

```bash
# Exportar traces al collector
export OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
export OTEL_TRACES_EXPORTER=otlp

# Levantar con perfil observability
docker-compose --profile observability up -d
```

## Seguridad

- **Tokens HMAC-SHA256**: Formato `base64url(subject|role|iat|exp).base64url(sig)`, TTL configurable (default 12h)
- **Rate Limiting**: Bucket4j por IP con Caffeine storage
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- **BCrypt**: Passwords admin hasheados con comparación timing-safe
- **CORS**: Configurable por variable de entorno
- **Soft rollout**: `SessionAuthFilter` se desactiva si `SESSION_SECRET` está vacío
- **Constant-time comparison**: Previene timing attacks en verificación de firmas

## Dominios

| Concepto | Descripción |
|---|---|
| **Territorio** | Área geográfica identificada por número, contiene múltiples manzanas |
| **Manzana** | Manzana/ciudad dentro de un territorio, polígono con ID string |
| **Encargado** | Coordinador/líder de predicación |
| **ModoMarcado** | `none` (ver), `completa` (tap para marcar), `parcial` (dibujar polígono) |
| **TipoSesion** | `predicacion` (predicación) o `otro` (otro) |
| **Estado** | `completed` (todas marcadas) o `incomplete` |
| **Predicacion** | Horario: `manana` (mañana) o `tarde` (tarde) |

## Estructura del Proyecto

```
predicador-app/
├── backend/
│   ├── shared/                    # Librería compartida (seguridad, excepciones)
│   ├── config-server/             # Spring Cloud Config
│   ├── discovery-server/          # Netflix Eureka
│   ├── api-gateway/               # Gateway (WebFlux)
│   ├── territory-service/         # Servicio de territorios
│   ├── reporting-service/         # Servicio de reportes
│   └── pom.xml                    # Parent POM
├── territory-frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/              # Servicios, guards, interceptors, utils
│   │   │   └── features/          # Auth, Profile, Map, Admin
│   │   │       └── map/           # Feature principal (10+ servicios)
│   │   ├── server.ts              # SSR entry
│   │   └── styles.css             # Estilos globales + design tokens
│   ├── public/                    # Assets estáticos, manifest, icons
│   └── angular.json
├── tests/
│   └── load/                      # k6 load tests
├── observability/                 # Prometheus, Grafana, OTel configs
├── docker-compose.yml
├── sonar-project.properties
└── .github/workflows/             # CI/CD pipelines
```

## License

MIT
