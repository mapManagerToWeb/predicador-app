# Predicador

PWA para gestión de territorios y reportes de predicación de los Testigos de Jehová.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Angular 22)                     │
│                    predicador-frontend/                       │
│                  PWA + Service Worker                         │
└──────────────────────┬──────────────────────────────────────┘
                       │ /api
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                   API Gateway (Spring Cloud)                  │
│                       api-gateway:8080                       │
│              CORS · Rate Limiting · Routing                   │
└─────────┬────────────────────────────────────────────────────┘
          │                                       │
          ▼                                       ▼
┌──────────────────────┐           ┌──────────────────────────┐
│  Territory Service   │           │    Reporting Service      │
│    territory:8081    │           │     reporting:8082        │
│  GeoJSON · Colores   │           │  Reports · Encargados    │
└──────────┬───────────┘           └────────────┬─────────────┘
           │                                     │
           ▼                                     ▼
┌──────────────────────────────────────────────────────────────┐
│                     PostgreSQL (Neon)                         │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Config Server:8888  ←──  Discovery Server:8761 (Eureka)     │
└──────────────────────────────────────────────────────────────┘
```

## Quick Start

### Docker (recomendado)

```bash
cp .env.example .env
# Editar .env con tus credenciales de BD
docker-compose up --build
```

### Desarrollo local

**Backend:**
```bash
cd backend
mvn clean install
# Iniciar en orden: config-server → discovery-server → api-gateway → services
mvn -pl config-server spring-boot:run
mvn -pl discovery-server spring-boot:run
mvn -pl api-gateway spring-boot:run
mvn -pl territory-service spring-boot:run
mvn -pl reporting-service spring-boot:run
```

**Frontend:**
```bash
cd predicador-frontend
npm install
ng serve    # http://localhost:4200
```

## Variables de Entorno

Ver `.env.example` para la lista completa.

| Variable | Descripción | Default |
|---|---|---|
| `DB_URL` | JDBC URL de PostgreSQL | `jdbc:postgresql://localhost:5432/predicador` |
| `DB_USERNAME` | Usuario de BD | `postgres` |
| `DB_PASSWORD` | Contraseña de BD | — |
| `ADMIN_USERNAME` | Usuario admin | `admin` |
| `ADMIN_PASSWORD` | Contraseña admin | — |
| `EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE` | Eureka server | `http://localhost:8761/eureka/` |
| `SPRING_CLOUD_CONFIG_URI` | Config server | `http://localhost:8888` |

## Microservicios

| Servicio | Puerto | Descripción |
|---|---|---|
| `config-server` | 8888 | Configuración centralizada |
| `discovery-server` | 8761 | Registro de servicios (Eureka) |
| `api-gateway` | 8080 | Punto de entrada único |
| `territory-service` | 8081 | CRUD de territorios y GeoJSON |
| `reporting-service` | 8082 | Reportes de predicación y encargados |

## API Endpoints (vía Gateway)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/v1/territories` | Números de territorios |
| `GET` | `/api/v1/territories/{n}` | Territorio por número |
| `GET` | `/api/v1/territories/all/geojson` | GeoJSON de todos los territorios |
| `GET` | `/api/v1/territories/{n}/geojson` | GeoJSON de un territorio |
| `GET` | `/api/v1/territories/colors` | Colores asignados |
| `PUT` | `/api/v1/territories/{n}/color` | Asignar color |
| `POST` | `/api/v1/reports` | Crear reportes |
| `GET` | `/api/v1/reports` | Listar reportes (filtro por territorio/encargado) |
| `GET` | `/api/v1/reports/today` | Reportes del día |
| `GET` | `/api/v1/encargados` | Listar encargados activos |
| `POST` | `/api/v1/encargados` | Crear encargado |
| `PUT` | `/api/v1/encargados/{id}` | Actualizar encargado |
| `GET` | `/api/v1/encargados/buscar?nombre=` | Buscar encargados |
| `POST` | `/api/v1/auth/login` | Autenticación admin |

## Tech Stack

### Backend
- Java 21 / Spring Boot 4.0 / Spring Cloud 2025.1
- PostgreSQL (Neon) + PostGIS
- Eureka Service Discovery
- Spring Cloud Config Server
- Spring Cloud Gateway

### Frontend
- Angular 22 / TypeScript 6
- Leaflet (mapas)
- Vitest (testing)
- PWA (Service Worker)
- Signals (estado reactivo)

## Testing

**Backend:**
```bash
cd backend
mvn clean test
```

**Frontend:**
```bash
cd predicador-frontend
vitest run
```

## License

MIT
