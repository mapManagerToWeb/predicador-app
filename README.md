# Predicador

PWA para gestión de territorios y reportes de predicación de los Testigos de Jehová.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                   Frontend (Angular 22)                      │
│                  predicador-frontend/                         │
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
│                     PostgreSQL (Neon) + PostGIS               │
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
| Runtime | Java 21 (virtual threads) |
| Framework | Spring Boot 4.0 |
| Microservicios | Spring Cloud 2025.1 |
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
| Geometria | polygon-clipping |
| Screenshots | html2canvas |
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
- **Envío de reportes**: Generación y envío de reportes vía WhatsApp con plantilla formateada
- **Guardado local**: Marcado persistido en base de datos, restauración al recargar
- **Modo oscuro**: Soporte completo de temas claro/oscuro
- **PWA**: Instalable, funciona offline con Service Worker
- **SSR**: Server-Side Rendering para SEO y performance inicial
- **RUM**: Core Web Vitals (LCP, INP, CLS, FCP, TTFB) enviados al backend
- **Autenticación**: Login por teléfono (+56 Chile), tokens HMAC
- **Admin Panel**: Gestión de colores de territorios con login admin
- **Session selector**: Selección de horario (Mañana/Tarde)
- **Satellite view**: Toggle entre vista normal y satelital

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
- **Virtual Threads**: Java 21 virtual threads para mejor concurrencia
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
- Java 21
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
cd predicador-frontend

# Instalar dependencias
npm install

# Desarrollo (proxy a :8080)
npm start                   # http://localhost:4200

# SSR producción
npm run build
npm run serve:ssr:predicador-frontend  # http://localhost:4000
```

## Comandos

### Frontend (`predicador-frontend/`)

| Comando | Descripción |
|---|---|
| `npm start` | Servidor de desarrollo (http://localhost:4200) |
| `npm run build` | Build de producción con SSR |
| `npm run watch` | Build en modo watch |
| `npm test` | Ejecutar tests (Vitest) |
| `npm run test:watch` | Tests en modo watch |
| `npm run test:coverage` | Tests con cobertura V8 |
| `npm run lint` | Verificar lint (ESLint) |
| `npm run lint:fix` | Auto-fix lint + Prettier |
| `npm run serve:ssr:predicador-frontend` | Servidor SSR producción |

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
cd predicador-frontend
npm run build
npx sonar-scanner

# Escanear backend
cd backend
mvn clean verify
npx sonar-scanner
```

## Variables de Entorno

Ver `.env.example` para la lista completa.

| Variable | Descripción | Default |
|---|---|---|
| `DB_URL` | JDBC URL de PostgreSQL | `jdbc:postgresql://localhost:5432/predicador` |
| `DB_USERNAME` | Usuario de BD | `postgres` |
| `DB_PASSWORD` | Contraseña de BD | — |
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
cd predicador-frontend

# Ejecutar tests
npm test                     # Ejecución única
npm run test:watch           # Watch mode
npm run test:coverage        # Con cobertura V8

# Cobertura mínima
# Lines: 80% | Statements: 80% | Functions: 80% | Branches: 75%
```

**Archivos de test (15 spec files):**
- Core: `profile.ts`, `auth-token.ts`, `territorio.ts`, `toast.ts`, `whatsapp.ts`, `rum.ts`
- Interceptors: `auth.interceptor.ts`, `error.interceptor.ts`
- Map: `map.ts`, `map-envio.ts`, `map-territory-layer.ts`, `map-rendering.facade.ts`, `map-style.ts`, `territory-search.ts`
- Admin: `admin.ts`

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
├── predicador-frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/              # Servicios, guards, interceptors, utils
│   │   │   ├── features/          # Auth, Profile, Map, Admin
│   │   │   │   └── map/           # Feature principal (10+ servicios)
│   │   │   └── shared/            # Componentes compartidos
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
