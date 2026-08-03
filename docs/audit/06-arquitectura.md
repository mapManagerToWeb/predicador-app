# Arquitectura y patrones de diseño

## Fortalezas

- Backend con separación Controller → Service → Repository y DTOs; no se confirmaron entidades JPA expuestas directamente.
- `GlobalExceptionHandler` centralizado con `ProblemDetail` en servicios.
- Gateway reactivo con rate limiting, circuit breakers, cache/ETag y cabeceras de seguridad.
- Frontend feature-based, standalone, lazy routes, Signals y servicios especializados para el mapa.
- Observabilidad con Micrometer/OpenTelemetry y CI separado para backend/frontend.

## Riesgos estructurales

- El control de acceso no está completamente ligado al dominio: rutas protegidas por token no equivalen a autorización sobre el propietario del recurso.
- El fail-open de `SessionAuthFilter` convierte una configuración ausente en una modificación de seguridad, no en un fallo de arranque.
- La exposición directa de servicios rompe la frontera arquitectónica del gateway.
- `MapDataPersistenceService` duplica flujos de guardado/envío y `MapSelectionService` es un servicio grande; conviene extraer casos de uso, no introducir un framework de estado pesado.
- Los listados ilimitados y el cliente HTTP sin timeout son riesgos de escalabilidad.
- El workflow Docker no refleja el contexto que requieren los Dockerfiles; la cadena de entrega debe probarse con `docker build` real.

La organización actual es adecuada para el tamaño del proyecto. No se recomienda una reescritura a Clean Architecture/DDD completa; sí reglas automáticas para autorización, dependencias de módulos y límites de integración.
