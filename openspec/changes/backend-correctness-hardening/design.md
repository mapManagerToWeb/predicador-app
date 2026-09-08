## Context

El backend tiene defectos de correctitud identificables en auditoría. El archivo `reporting-service/src/main/resources/application.yml` no parsea por merge conflicts sin resolver (bloques líneas 43-60 y 171-174). El flujo síncrono de WhatsApp (`ReportSendService.sendReport`) no atrapa excepciones `RuntimeException` genéricas — si la API externa lanza algo que no sea `WhatsAppIntegrationException`, la excepción propaga y la entrega queda `IN_PROGRESS` hasta el lease timeout (5 min). El endpoint `EncargadoController.buscarOCrear` puede generar `UnexpectedRollbackException` en condición de carrera. `WhatsAppIntegrationException` solo se maneja localmente en `WhatsAppController`. `AuthorizationService` lanza `ResponseStatusException` desde un servicio invocado por el executor. Ver proposal.md para motivación completa.

Stack: Java 25, Spring Boot 4.0, Spring Cloud 2025.1, Spring Framework 7, RabbitMQ, PostgreSQL/PostGIS.

El proyecto usa **Jakarta EE 11** (gestionado por el BOM de Boot 4): `jakarta.servlet` 6.1.0, `jakarta.persistence` 3.2.0, `jakarta.validation` 3.1.1, `jakarta.transaction` 2.0.1. El estándar actual de ProblemDetail es **RFC 9457** (julio 2023, retrocompatible con RFC 7807).

## Goals / Non-Goals

**Goals:**
- Build de `reporting-service` que arranca con YAML válido.
- Entregas asíncronas de WhatsApp en estado terminal cuando la API externa falla.
- `buscarOCrear` sin `UnexpectedRollbackException` en race condition.
- Excepciones de dominio mapeadas a HTTP en un solo lugar.
- Servicios de dominio que no dependen de tipos de Spring Web.

**Non-Goals:**
- Refactor de `DeliveryReservationService` (extensión de lease/idempotencia) — fuera de scope, alto riesgo, requiere su propio SDD.
- Activar `spring.mvc.problemdetails.enabled` — redundante porque `GlobalExceptionHandler` ya existe.
- Eliminación de `SecurityContext` ThreadLocal o constructores muertos de `SessionTokenService` — cosmético, no impacta correctness.
- Cambios en `FallbackController.java` o `ReportSendService.java` — no tienen merge conflicts.
- Reescritura de `AsyncConfig.java` — con `spring.threads.virtual.enabled=true` activo, los settings de `ThreadPoolTaskExecutor` (`corePoolSize`, `maxPoolSize`, `queueCapacity`, `CallerRunsPolicy`) son no-op. Boot 4 usa `SimpleAsyncTaskScheduler` con virtual threads. Out of scope, requiere SDD propio.

## Decisions

### 1. Merge conflict en `application.yml`: HEAD gana

**Decisión:** Conservar la versión HEAD (`flyway.enabled: false`) por línea 43-60 y 171-174, consistente con `AGENTS.md` que dice: "reporting has Flyway **disabled**, so its `db/migration/*.sql` must be applied manually".

**Justificación:** El `AGENTS.md` es la fuente de verdad. Activar Flyway en reporting no es decisión de este SDD.

### 2. `WhatsAppMessageRequest`: validar con `@Pattern` declarativo

**Decisión:** Convertir el POJO a `record` con constraints declarativas. Usar `@Pattern` (Jakarta Validation 3.1.1) para E.164, NO un constructor compacto que lance `IllegalArgumentException`.

```java
public record WhatsAppMessageRequest(
    @JsonProperty("idempotencyKey") String idempotencyKey, // del header, ignorado en body
    @JsonProperty("destinationNumber")
    @NotBlank
    @Pattern(regexp = "^\\+[1-9]\\d{1,14}$", message = "destinationNumber debe ser E.164")
    String destinationNumber,
    @JsonProperty("templateName")
    @NotBlank(message = "templateName es obligatorio")
    String templateName,
    @JsonProperty("languageCode") String languageCode,
    @JsonProperty("components") List<Map<String, Object>> components
) {}
```

**Por qué NO el compact constructor:** lanzar `IllegalArgumentException` desde el record constructor significa que la excepción ocurre durante la **deserialización de Jackson** (antes de que Spring MVC entre en el controller). Eso la hace landed en el `ResponseEntityExceptionHandler` de Spring Boot 4, que la convierte en `500` si no hay un handler específico. Con `@Pattern`, la validación corre después de la deserialización (cuando `@Valid` activa `MethodArgumentNotValidException`), que el `GlobalExceptionHandler` ya maneja como `400`.

**Alternativas consideradas:**
- *POJO mutable con getters/setters y `@NotBlank`/`@Pattern`*: funciona, pero el record es inmutable y conciso.
- *Validar en el controller*: dispersa la lógica.

**Justificación:** `@Valid` en el controller (`WhatsAppController.java:60`) dispara la validación; el record con `@Pattern` genera `ConstraintViolationException` → `MethodArgumentNotValidException` → `400` ProblemDetail por el advice existente. Consistente con el resto del sistema.

### 3. `sendReport`: catch genérico para excepciones no-`WhatsAppIntegrationException`

**Decisión:** Añadir un `catch(RuntimeException)` en `ReportSendService.sendReport` que marque la entrega como `FAILED` y la persista antes de relanzar.

**Realidad del código actual (`ReportSendService.sendReport`):**

```java
try {
    WhatsAppMessageResponse response = messageClient.sendTemplateMessage(...);
    // ...
    persistSuccess(delivery, result);
    return result;
} catch (WhatsAppIntegrationException e) {         // solo atrapa esto
    persistFailure(delivery, result, e.status());
    throw e;
}  // NO hay catch(RuntimeException) genérico
```

**El bug real:** si `messageClient.sendTemplateMessage()` lanza algo que NO sea `WhatsAppIntegrationException` — por ejemplo `HttpClientErrorException` (4xx de WhatsApp), `WebServiceException`, o `SocketTimeoutException` envuelta en `RuntimeException` — la excepción propaga al caller, `persistFailure` nunca se ejecuta, y la entrega queda `IN_PROGRESS` hasta el lease timeout (5 min).

`sendRaw` en `WhatsAppSendService` sí tiene el `catch(RuntimeException)` (líneas 176-180). El bug está en el path síncrono.

**Cambio necesario:**
```java
try {
    // ...existing send logic...
} catch (WhatsAppIntegrationException e) {
    persistFailure(delivery, result, e.status());
    throw e;
} catch (RuntimeException e) {
    WhatsAppSendResponse failure = new WhatsAppSendResponse(false, null, e.getMessage());
    persistFailure(delivery, failure, 502);
    throw new WhatsAppIntegrationException("Error inesperado: " + e.getClass().getSimpleName(), 502, e);
}
```

**Decisión adicional:** mejorar los logs en los catch blocks para incluir `e.getClass().getSimpleName()` y `e.getCause()` para facilitar diagnóstico.

**Nota:** `WhatsAppSendService.sendRaw` ya tiene el catch genérico. El fix es solo para `sendReport`.

### 4. `buscarOCrear`: `@Transactional(noRollbackFor = DataIntegrityViolationException.class)` en `crear`

**Decisión:** Anotar `crear()` con `@Transactional(noRollbackFor = DataIntegrityViolationException.class)` permite que la `DataIntegrityViolationException` se lance sin marcar la transacción como rollback-only. El `findByNaturalIdentity` posterior en `buscarOCrear` funciona.

```java
@Transactional(noRollbackFor = DataIntegrityViolationException.class)
public EncargadoDto crear(EncargadoDto dto) {
    ...
    Encargado saved = repository.saveAndFlush(encargado);  // throws DIV si duplicate
    return toDto(saved);
}

@Transactional
public Optional<EncargadoDto> buscarOCrear(...) {
    ...
    try {
        return Optional.of(crear(dto));  // self-invocation: NO crea tx nueva, sigue en la de buscarOCrear
    } catch (DataIntegrityViolationException collision) {
        return repository.findByNaturalIdentity(...).map(this::toDto);  // funciona porque no hay rollback-only
    }
}
```

**Alternativas consideradas:**
- *Self-proxy con REQUIRES_NEW*: el patrón `ObjectProvider<EncargadoService> self` (ya usado en `TerritoryService`) pero con más boilerplate.
- *Extraer `crear` a otro bean*: cambia la arquitectura, no vale para un solo método.

**Justificación:** `noRollbackFor` es declarativo, idiomático Spring, sin agregar clases. Funciona porque la transacción externa NO está marcada como rollback-only.

### 5. `WhatsAppIntegrationException` en `GlobalExceptionHandler`

**Decisión:** Eliminar `@ExceptionHandler(WhatsAppIntegrationException.class)` local en `WhatsAppController.java:77-85`. Añadir handler en `GlobalExceptionHandler`:

```java
@ExceptionHandler(WhatsAppIntegrationException.class)
public ProblemDetail handleWhatsAppFailure(WhatsAppIntegrationException ex) {
    HttpStatus status = HttpStatus.resolve(ex.status());
    if (status == null || status.is2xxSuccessful()) status = HttpStatus.BAD_GATEWAY;
    ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, ex.getMessage());
    problem.setTitle("Fallo en la integración WhatsApp");
    problem.setType(URI.create("https://api.predicador.com/errors/whatsapp-integration"));
    return problem;
}
```

### 6. `ForbiddenOperationException` como dominio

**Decisión:** Crear `shared/exception/ForbiddenOperationException extends RuntimeException`. `AuthorizationService` lanza esta excepción. `GlobalExceptionHandler` la mapea a `403 Forbidden`.

```java
// shared/exception/ForbiddenOperationException.java
public class ForbiddenOperationException extends RuntimeException {
    public ForbiddenOperationException(String message) { super(message); }
}
```

```java
// GlobalExceptionHandler.java (nuevo método)
@ExceptionHandler(ForbiddenOperationException.class)
public ProblemDetail handleForbidden(ForbiddenOperationException ex) {
    ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, ex.getMessage());
    problem.setTitle("Acceso denegado");
    problem.setType(URI.create("https://api.predicador.com/errors/forbidden"));
    return problem;
}
```

`WhatsAppSendService.process()` (línea 133) ya captura `RuntimeException` — capturará `ForbiddenOperationException` también, marcará FAILED y seguirá.

## Risks / Trade-offs

| Riesgo | Mitigación |
|---|---|
| `noRollbackFor = DataIntegrityViolationException` puede enmascarar otras excepciones DIV legítimas | Documentar el `noRollbackFor` en un comentario Javadoc del método; el `saveAndFlush` es el único lugar que puede lanzar DIV |
| Eliminar el handler local de `WhatsAppController` cambia el response shape (era `ResponseEntity<ProblemDetail>`, ahora es `ProblemDetail` directo) | Ambos son equivalentes en el cliente; el formato RFC 7807 se mantiene |
| `AuthorizationService.requireAdmin` lanzando `ForbiddenOperationException` desde executor produce stack trace en logs | Ya hay un log.error en `process()` (línea 134); agregar al stack trace la causa raíz |
| El record `WhatsAppMessageRequest` con `@Pattern` declarativo cambia el código de error de mensajes `null` (antes 500 interno, ahora 400 ProblemDetail) | Comunicar a clientes que dependían de un 500 para detectar validación fallida |

## Migration Plan

**Fase 1 — Build fix (sin riesgo)**
1. Resolver los dos bloques de merge conflict en `application.yml`. Conservar HEAD.
2. Verificar `mvn compile -pl reporting-service -q` exits 0.

**Fase 2 — Validación de requests (bajo riesgo)**
3. Convertir `WhatsAppMessageRequest` a `record` con `@NotBlank` y `@Pattern(regexp = "^\\+[1-9]\\d{1,14}$")` declarativo. NO usar compact constructor que lance `IllegalArgumentException`.
4. Reemplazar `Map<String,String>` en `EncargadoController.login` por `record EncargadoLoginRequest(@NotBlank @Pattern(regexp="^\\+[1-9]\\d{1,14}$") String telefono)`.
5. Ejecutar tests existentes.

**Fase 3 — Race condition fix**
6. Anotar `EncargadoService.crear()` con `@Transactional(noRollbackFor = DataIntegrityViolationException.class)`. Agregar Javadoc explicando el rationale.
7. Agregar test de integración con dos threads concurrentes que llaman `buscarOCrear` con mismo nombre+apellido.

**Fase 4 — Exception handling**
8. Crear `ForbiddenOperationException` en `shared/exception/`.
9. Actualizar `AuthorizationService` para lanzar `ForbiddenOperationException`. Eliminar import de `ResponseStatusException`.
10. Añadir `@ExceptionHandler(WhatsAppIntegrationException.class)` y `@ExceptionHandler(ForbiddenOperationException.class)` en `GlobalExceptionHandler`.
11. Eliminar el `@ExceptionHandler(WhatsAppIntegrationException.class)` local en `WhatsAppController`.

**Fase 5 — Diagnóstico en `sendReport` y `sendRaw`**
12. Añadir `catch(RuntimeException)` en `ReportSendService.sendReport` que marque FAILED y persista antes de relanzar.
13. Mejorar los logs en los catch blocks de `sendReport` y `sendRaw` para incluir `exception.getClass().getSimpleName()` y `exception.getCause()`.

**Rollback:** Cada fase es atómica. Rollback es `git revert` del commit correspondiente.

## Open Questions

- **¿Hay tests de integración que dependen del código 500 o del body exacto del handler local de `WhatsAppController`?** Verificar `WhatsAppIntegrationTest` antes de remover el handler local; actualizar asserts si es necesario.
- **¿El `idempotencyKey` del body de `WhatsAppMessageRequest` debe eliminarse?** El header `Idempotency-Key` ya lo provee. Si el body también lo trae, hay dos fuentes — riesgo de inconsistencia. Decisión: ignorar el campo del body en el record (no se usa) y documentarlo.
- **¿`noRollbackFor` en `crear` afecta otros call paths de `crear`?** `crear` se invoca también desde `EncargadoController.crear()` (POST `/api/v1/encargados`). Si en ese path nunca se viola la constraint (porque el controller valida primero), no hay impacto. Si se viola, el `save()` lanza DIV, el advice la mapea a `400` con `ProblemDetail`. **Aceptable.**