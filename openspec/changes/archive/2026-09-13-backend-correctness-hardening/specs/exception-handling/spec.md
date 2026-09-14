## Purpose

Garantizar que todas las respuestas de error HTTP del backend tengan formato consistente (RFC 7807 ProblemDetail), que no haya handlers locales que dupliquen lógica, y que la validación de requests genere errores estructurados y no respuestas inconsistentes.

## ADDED Requirements

### Requirement: Validation errors return consistent ProblemDetail

El sistema SHALL retornar `application/problem+json` para todo error de validación de request body con los campos `type`, `title`, `status`, `detail`, `instance` y `errors` (lista de violaciones por campo).

El handler `MethodArgumentNotValidException` en `GlobalExceptionHandler` ya cumple este contrato. Ningún controller SHALL fabricar respuestas de validación a mano que no sigan este formato.

#### Scenario: Validation error in WhatsAppSendRequest
- **WHEN** el cliente envía `POST /api/v1/reports/send` con `encargadoNombre` vacío
- **THEN** el sistema responde `400 Bad Request` con `ProblemDetail` donde `errors` lista el campo y mensaje de la violación

#### Scenario: Validation error in EncargadoDto
- **WHEN** el cliente envía `POST /api/v1/encargados` con `nombre` vacío y `telefono` no E.164
- **THEN** el sistema responde `400 Bad Request` con `errors` listando ambas violaciones

### Requirement: No hand-rolled ProblemDetail in controllers

Ningún controller SHALL construir `ProblemDetail` inline y retornarlo directamente. Toda excepción que requiera un `ProblemDetail` SHALL lanzarse y ser manejada por `GlobalExceptionHandler`.

La duplicación de construcción de `ProblemDetail` en controllers genera formas de error inconsistentes y es difícil de mantener.

#### Scenario: Controller builds ProblemDetail inline
- **WHEN** un controller ejecuta `ResponseEntity.badRequest().body(ProblemDetail.forStatusAndDetail(...))`
- **THEN** la revisión de código lo detecta y se reemplaza por `throw new IllegalArgumentException("...")` o la excepción de dominio correspondiente

### Requirement: No @ExceptionHandler local for domain exceptions in controllers

Ningún controller SHALL declarar `@ExceptionHandler` para excepciones de dominio. Los handlers locales se eliminan; toda excepción de dominio se mapea en `GlobalExceptionHandler`.

#### Scenario: Local handler for WhatsAppIntegrationException in controller
- **WHEN** `WhatsAppController.java` tiene `@ExceptionHandler(WhatsAppIntegrationException.class)` local
- **THEN** se elimina y el mapping se centraliza en `GlobalExceptionHandler`

### Requirement: 404 returns ProblemDetail, not custom body

El sistema SHALL responder `404 Not Found` con `ProblemDetail` para recursos no hallados (`ResourceNotFoundException`). Ningún endpoint SHALL retornar un body custom o texto plano para "no encontrado".

#### Scenario: Resource not found response shape
- **WHEN** el cliente pide `PUT /api/v1/encargados/99999` con ID inexistente
- **THEN** el sistema responde `404 Not Found` con `ProblemDetail` que incluye `resource` y `id`