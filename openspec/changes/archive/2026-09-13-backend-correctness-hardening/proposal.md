## Why

El backend tiene defectos de correctitud verificables que impactan producción: un build-breaker real en `application.yml`, validación rota en `WhatsAppMessageRequest`, y una ventana de pérdida de estado en el path asíncrono de WhatsApp cuando la API externa lanza excepción. La auditoría inicial también identificó refactor de duplicación (delivery reservation), pero ese es medium-risk y debe planearse por separado.

## What Changes

- **Resolve `application.yml` merge conflicts**: bloques líneas 43-60 y 171-174. La regla del `AGENTS.md` es clara: reporting tiene Flyway **disabled** (`HEAD` gana), con tabla dedicada `flyway_schema_history_reporting` cuando se decida activarlo.
- **Add Bean Validation to `WhatsAppMessageRequest`**: `@NotBlank` en `templateName`, `@NotBlank` + pattern E.164 en `destinationNumber`. El controller ya declara `@Valid` pero el DTO es POJO sin constraints — `@Valid` es no-op.
- **Replace `Map<String,String>` login body in `EncargadoController.login`**: `body.get("telefono")` puede ser null; aunque `buscarPorTelefono` ya es null-safe, el endpoint no distingue "teléfono inválido" (400) de "teléfono no encontrado" (404).
- **Fix async `sendRaw` window**: cuando `WhatsAppMessageClient.sendTemplateMessage` lanza excepción no-`WhatsAppIntegrationException` antes del `save()`, la entrega queda `IN_PROGRESS` hasta el lease timeout (5 min). El cliente ve estado incorrecto.
- **Fix `buscarOCrear` race condition**: cuando dos requests concurrentes crean el mismo encargado, `crear()` se invoca via self-invocation dentro de la transacción de `buscarOCrear`, y al fallar con `DataIntegrityViolationException` la tx queda rollback-only; el `find` posterior lanza `UnexpectedRollbackException`.
- **Move `WhatsAppIntegrationException` mapping to `GlobalExceptionHandler`**: solo `WhatsAppController` la maneja localmente. Cualquier otro caller obtiene 500 genérico.
- **Create `ForbiddenOperationException` domain exception**: `AuthorizationService` lanza `ResponseStatusException` desde un servicio que también se invoca desde el executor de WhatsApp. Cuando la excepción se lanza fuera del contexto HTTP, se pierde como stack trace genérico.

## Capabilities

### New Capabilities

- `backend/request-validation`: DTOs de request que entran a través de `@RequestBody` declaran constraints de Bean Validation (`@NotBlank`, `@Pattern`, etc.) y los controllers que los usan declaran `@Valid`. Inputs inválidos se rechazan con `400` antes de llegar a la capa de servicio.
- `backend/transaction-management`: Writes a entidades JPA terminan en una transacción activa. El path asíncrono de WhatsApp garantiza que cualquier excepción externa termina la entrega en estado terminal (FAILED), no IN_PROGRESS. La condición de carrera de `buscarOCrear` se resuelve sin `UnexpectedRollbackException`.
- `backend/exception-handling`: Excepciones de dominio (`WhatsAppIntegrationException`, `ForbiddenOperationException`) se mapean a HTTP exclusivamente en `GlobalExceptionHandler`. Los controllers no declaran `@ExceptionHandler` locales para excepciones de dominio.
- `backend/domain-exceptions`: Servicios de dominio lanzan excepciones de dominio puras (no `ResponseStatusException`). El mapeo HTTP ocurre en el advice global.

## Impact

- **Build**: `reporting-service` no arranca por YAML inválido. Fix es 1 commit, sin riesgo de runtime.
- **API contracts**: `WhatsAppController.sendWhatsAppAsync` y `EncargadoController.login` ahora rechazan inputs inválidos con `400`. Clientes que dependen de que `null` llegue al servicio deben actualizar.
- **Async behavior**: clientes que consultan `/send/{idempotencyKey}` después de un error externo verán `FAILED` antes (en milisegundos vs. 5 minutos).
- **No breaking changes**: el flujo de éxito es idéntico. Solo cambia el comportamiento de error en paths específicos.