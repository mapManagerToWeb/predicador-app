## Purpose

Garantizar que los writes asíncronos de WhatsApp terminen en estado terminal (FAILED) cuando la API externa falla, y que la condición de carrera de `buscarOCrear` no genere `UnexpectedRollbackException`.

## ADDED Requirements

### Requirement: Async send terminates in terminal state on external failure

El sistema SHALL terminar cualquier entrega de WhatsApp en estado `FAILED` cuando `WhatsAppMessageClient.sendTemplateMessage` lanza una excepción no-`WhatsAppIntegrationException` antes del `save()`. El cliente que consulta `/api/v1/reports/send/{idempotencyKey}` SHALL ver `status=FAILED` inmediatamente, no `IN_PROGRESS` hasta el timeout del lease.

El flujo asíncrono es: `WhatsAppSendService.submit()` → executor → `process()` → `sendService.sendReport()`. Cuando `sendTemplateMessage` lanza una excepción que no es `WhatsAppIntegrationException`, la entrega queda `IN_PROGRESS` porque la mutación al estado `FAILED` nunca se ejecuta.

#### Scenario: External HTTP client throws non-WhatsAppIntegrationException
- **WHEN** `WhatsAppMessageClient` lanza `HttpClientErrorException` (4xx de WhatsApp) o `WebServiceException` (network) que no son subclases de `WhatsAppIntegrationException`
- **AND** la excepción ocurre antes de `save(delivery)` en `sendRaw`
- **THEN** `delivery.markFailed()` se ejecuta dentro de un bloque `catch(RuntimeException)` en `sendRaw` y `save()` se llama antes de re-lanzar la excepción

#### Scenario: WhatsAppIntegrationException thrown before save
- **WHEN** `WhatsAppMessageClient` lanza `WhatsAppIntegrationException` con status 502
- **THEN** `delivery.markFailed()` se ejecuta en el bloque `catch(WhatsAppIntegrationException)` de `sendRaw`, `save()` persiste el estado, y la excepción propaga al caller

### Requirement: buscarOCrear race condition does not throw UnexpectedRollbackException

El sistema SHALL manejar la condición de carrera en `EncargadoService.buscarOCrear` cuando dos requests concurrentes intentan crear el mismo encargado por nombre+apellido. El segundo request SHALL retornar el registro existente sin `UnexpectedRollbackException`.

La causa raíz es: `buscarOCrear` tiene `@Transactional` pero invoca `crear()` (que también tiene `@Transactional`) via self-invocation. Spring AOP no crea nueva transacción para `crear()` — corre en la transacción de `buscarOCrear`. Cuando `crear()` falla con `DataIntegrityViolationException`, la transacción se marca rollback-only y el `find` del catch falla con `UnexpectedRollbackException`.

#### Scenario: Concurrent creation of same encargado
- **WHEN** dos requests concurrentes envían `POST /api/v1/encargados/buscar-crear` con `{nombre:"Juan",apellido:"Pérez",telefono:"+5491100000000"}`
- **AND** no existe un encargado con ese nombre+apellido en la BD
- **THEN** uno persiste el registro, el otro retorna el mismo registro existente sin `UnexpectedRollbackException`

### Requirement: TransactionTemplate available for programmatic transactions

El sistema SHALL usar el bean `TransactionTemplate` auto-configurado por Spring Boot 4 para control programático de transacciones cuando la decoración declarativa (`@Transactional`) no cubra el caso (REQUIRES_NEW para race recovery).

#### Scenario: Programmatic REQUIRES_NEW for nested save
- **WHEN** se necesita una transacción anidada para `saveOrFail` en race recovery
- **THEN** se inyecta `TransactionOperations` (TransactionTemplate) vía constructor y se usa `tx.execute(status -> { ... })` con la propagación adecuada