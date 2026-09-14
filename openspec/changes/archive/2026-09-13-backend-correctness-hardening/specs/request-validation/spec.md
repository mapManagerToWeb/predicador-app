## Purpose

Define el contrato de validación de entradas HTTP en los endpoints del backend: cada request body debe ser validado por Bean Validation y los errores deben reportarse como 400 ProblemDetail antes de que null o valores inválidos lleguen a la capa de servicio.

## ADDED Requirements

### Requirement: WhatsApp async send validates required fields

El sistema SHALL rechazar con `400 Bad Request` cualquier request a `POST /api/v1/reports/whatsapp/async` que tenga `templateName` en blanco o `destinationNumber` vacío o con formato inválido (no E.164). El cuerpo de respuesta SHALL ser `application/problem+json` con los campos inválidos listados.

El endpoint recibe `idempotencyKey` del header `Idempotency-Key` y los datos del mensaje del body. Si `templateName` o `destinationNumber` son inválidos, el mensaje no debe publicarse en la cola.

#### Scenario: Missing templateName
- **WHEN** el cliente envía `POST /api/v1/reports/whatsapp/async` con header `Idempotency-Key: foo` y body `{"destinationNumber":"+5491100000000","templateName":""}`
- **THEN** el sistema responde `400 Bad Request` antes de llamar `whatsAppSendPublisher.publish(request)`

#### Scenario: destinationNumber with invalid format
- **WHEN** el cliente envía body con `"destinationNumber": "1234"` (no E.164)
- **THEN** el sistema responde `400 Bad Request` con `ProblemDetail` indicando la violación del patrón E.164

#### Scenario: Valid request passes through
- **WHEN** el cliente envía body con `templateName="hello_world"`, `destinationNumber="+5491100000000"`, `languageCode="es"`, `components=[...]`
- **THEN** el sistema responde `202 Accepted` y publica en la cola

### Requirement: Encargado login validates telefono

El sistema SHALL rechazar con `400 Bad Request` cualquier request a `POST /api/v1/encargados/login` que tenga `telefono` ausente o en formato inválido. El sistema SHALL distinguir entre "teléfono inválido" (400) y "teléfono no encontrado" (404).

#### Scenario: telefono missing
- **WHEN** el cliente envía `POST /api/v1/encargados/login` con body `{}`
- **THEN** el sistema responde `400 Bad Request` (no 404)

#### Scenario: telefono not found
- **WHEN** el cliente envía body con `telefono` válido pero sin registro asociado
- **THEN** el sistema responde `404 Not Found`

### Requirement: No @Valid is no-op

Ningún controller SHALL declarar `@Valid` sobre un `@RequestBody` cuyo DTO no tenga anotaciones de Bean Validation. Un `@Valid` sobre un POJO sin constraints no valida nada y debe eliminarse o complementarse.

#### Scenario: DTO without validation annotations declared @Valid
- **WHEN** un controller declara `@Valid @RequestBody SomeDto dto` pero `SomeDto` no tiene `@NotBlank`, `@NotNull`, etc.
- **THEN** el linter o la revisión de código lo detecta y el DTO se complementa o el `@Valid` se elimina