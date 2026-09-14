## Purpose

Centralizar el manejo de excepciones de dominio en `GlobalExceptionHandler` para que todos los clientes HTTP reciban respuestas de error consistentes y que los handlers locales se eliminen.

## ADDED Requirements

### Requirement: WhatsAppIntegrationException maps to HTTP status in GlobalExceptionHandler

El sistema SHALL mapear `WhatsAppIntegrationException` a su código HTTP derivado del campo `status` de la excepción (`502` para timeouts, `504` para network, `409` para rate limit, `502` para errores upstream). La respuesta SHALL ser `application/problem+json`.

El handler local en `WhatsAppController.java` se elimina. El mapping ocurre en un solo lugar.

#### Scenario: WhatsApp API timeout
- **WHEN** `WhatsAppMessageClient` lanza `WhatsAppIntegrationException(status=504)` por socket timeout
- **THEN** `GlobalExceptionHandler` responde `504 Gateway Timeout` con `ProblemDetail`

#### Scenario: WhatsApp rate limit
- **WHEN** la API de WhatsApp devuelve 429 y se lanza `WhatsAppIntegrationException(status=429)`
- **THEN** el sistema responde `429 Too Many Requests` con `ProblemDetail`

#### Scenario: No handler in controller
- **WHEN** cualquier controller lanza `WhatsAppIntegrationException`
- **THEN** `GlobalExceptionHandler` la maneja; no hay handler local en controller que la capture

### Requirement: No local @ExceptionHandler for domain exceptions

Ningún controller SHALL declarar un `@ExceptionHandler` local para `WhatsAppIntegrationException`, `ForbiddenOperationException`, o cualquier excepción de dominio definida en `shared/exception/`.

#### Scenario: Controller has local handler for domain exception
- **WHEN** un controller tiene `@ExceptionHandler(WhatsAppIntegrationException.class)`
- **THEN** la revisión de código lo detecta y se elimina en favor del handler global

### Requirement: AuthorizationService throws domain exception, not ResponseStatusException

El sistema SHALL garantizar que `AuthorizationService` no importe ni lance `ResponseStatusException`. Toda verificación de autorización fallida SHALL lanzar `ForbiddenOperationException`.

#### Scenario: requireAdmin called from Executor
- **WHEN** `AuthorizationService.requireAdmin` es invocado desde `WhatsAppSendService.process()` (thread pool, no request HTTP)
- **AND** el usuario no tiene permisos de admin
- **THEN** se lanza `ForbiddenOperationException`; `process()` la atrapa como `RuntimeException`, registra el error y marca la entrega como FAILED

#### Scenario: requireAdmin called from HTTP controller
- **WHEN** el mismo método es invocado desde un controller
- **AND** el usuario no tiene permisos
- **THEN** `GlobalExceptionHandler` mapea `ForbiddenOperationException` a `403 Forbidden`