## 1. Build Fix

- [x] 1.1 Resolve merge conflict in `reporting-service/src/main/resources/application.yml` lines 43-60 — keep HEAD (Flyway disabled). Verify: `mvn compile -pl reporting-service -q` exits 0.
- [x] 1.2 Resolve merge conflict in `application.yml` lines 154-157 — keep `feat/redesign` (`default-image-url` is required by `WhatsAppProperties` record). Verify: `mvn compile -pl reporting-service -q` exits 0.
- [x] 1.3 Run `mvn verify -B` and confirm all modules compile.

## 2. Request Validation

- [x] 2.1 Convert `WhatsAppMessageRequest` to `record` with declarative constraints (added `LocalValidatorFactoryBean` to test setups).
  - `templateName`: `@NotBlank(message = "templateName es obligatorio")`
  - `destinationNumber`: `@NotBlank @Pattern(regexp = "^\\+[1-9]\\d{1,14}$", message = "destinationNumber debe ser E.164")`
  - **Do NOT** use a compact constructor that throws `IllegalArgumentException` — that breaks Jackson deserialization and lands in 500 instead of 400.
  Verify: existing `WhatsAppControllerTest` passes; add test that POST with `templateName=""` returns `400` ProblemDetail; add test that POST with `destinationNumber="1234"` returns `400` ProblemDetail citing the E.164 violation.

- [x] 2.2 Create `record EncargadoLoginRequest(@NotBlank @Pattern(regexp="^\\+[1-9]\\d{1,14}$") String telefono)`. Replace `Map<String,String>` body in `EncargadoController.login`. Updated tests to use E.164 format. Verify: POST `{}` returns `400`; POST with valid telefono + not found returns `404`.

## 3. Transaction Management — buscarOCrear Race Condition + sendReport Window

- [x] 3.1 Annotate `EncargadoService.crear()` with `@Transactional(noRollbackFor = DataIntegrityViolationException.class)`. Add Javadoc explaining the rationale. Verify: existing `EncargadoServiceTest` passes.
- [x] 3.2 Add integration test `EncargadoRaceConditionIT`: spawn 2 threads, both call `buscarOCrear("Juan","Pérez","+5491100000000")` concurrently with empty DB. Assert: both return same EncargadoDto without `UnexpectedRollbackException`. Verify: `mvn verify -pl reporting-service -Dit.test=EncargadoRaceConditionIT -q` passes.

- [x] 3.3 Add `catch(RuntimeException)` block in `ReportSendService.sendReport` (the synchronous path), after the existing `catch(WhatsAppIntegrationException)` block. The new catch must: (a) mark delivery FAILED via `persistFailure`, (b) rethrow wrapped as `WhatsAppIntegrationException(status=502)` with the original cause preserved. Test `sendReport_unexpectedRuntimeException_marksFailedAndRethrowsAsWhatsApp` added.

- [x] 3.4 Improve log statements in catch blocks of both `ReportSendService.sendReport` and `WhatsAppSendService.sendRaw` to include `exception.getClass().getSimpleName()` and `exception.getCause()`. Verify: existing tests pass.

## 4. Exception Handling

- [x] 4.1 Create `shared/src/main/java/com/predicador/shared/exception/ForbiddenOperationException extends RuntimeException`. Verify: `mvn compile -pl shared -q` exits 0.

- [x] 4.2 Update `AuthorizationService`: replace `throw new ResponseStatusException(...)` with `throw new ForbiddenOperationException(...)`. Remove `ResponseStatusException` import. Verify: existing tests pass; `AuthorizationService` no longer depends on Spring Web types.

- [x] 4.3 Add to `GlobalExceptionHandler`:
  - `@ExceptionHandler(ForbiddenOperationException.class)` → `403 Forbidden` with `ProblemDetail` (RFC 9457).
  - `@ExceptionHandler(WhatsAppIntegrationException.class)` → maps `ex.status()` to HTTP status with `ProblemDetail` (mirror the logic from `WhatsAppController.handleWhatsAppFailure`).
  Verify: `mvn verify -pl shared,reporting-service -q` passes.

- [x] 4.4 Remove `@ExceptionHandler(WhatsAppIntegrationException.class)` from `WhatsAppController.java:77-85`. Verify: existing `WhatsAppControllerTest` passes (update if it asserts on local handler shape).

## 5. Integration Verification

- [x] 5.1 Run `mvn verify -B` from `backend/` — all modules compile, all tests pass.
- [x] 5.2 Run `mvn verify -Pcoverage -B` — JaCoCo shows LINE/INSTRUCTION ≥ 40% (existing threshold).
- [ ] 5.3 Manual smoke: start `reporting-service` locally; POST invalid `WhatsAppMessageRequest` (empty templateName) → `400` ProblemDetail; POST valid → `202`. Verify `actuator/health` shows UP. **Requires manual verification - see instructions above.**