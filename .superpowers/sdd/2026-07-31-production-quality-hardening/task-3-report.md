# Task 3 Report

## Changed Files

- Set Hibernate `ddl-auto` to `validate` and enabled Flyway validation in service and config-server YAML.
- Added bounded report and encargado pagination, deterministic sorting, and the 100-item territory batch limit.
- Added the natural encargado identity unique index and `whatsapp_delivery_idempotency` Flyway migration/entity/repository.
- Added collision recovery for `buscarOCrear`.
- Added bounded RestTemplate connect/read timeouts, typed WhatsApp response records, and typed integration failures for timeout/non-2xx responses.
- Added keyed delivery reservation/replay and non-2xx `ProblemDetail` handling.
- Removed PII-bearing INFO/error payload logs and retained opaque outcome identifiers.
- Updated reporting service tests for the new bounded and typed contracts.

## TDD Evidence

- Red: `mvn -pl reporting-service -Dtest=Task3HardeningTest test -q` failed at test compilation because the bounded repository/service methods, natural-identity lookup, and keyed send API were absent.
- Green: `mvn -pl reporting-service -Dtest=Task3HardeningTest,EncargadoServiceTest,ReportSendServiceTest test -q` passed.
- Focused verification: `mvn -pl reporting-service,territory-service test -q` passed.

## Self-Review

- Existing unrelated worktree changes and the prior `ReportRepository` change were preserved; no frontend, cookie/CSRF, or CI-gate work was added.
- Repository calls from controller list/batch paths now receive bounded `Pageable` values or the explicit batch cap.
- WhatsApp clients no longer catch broad `Exception`; failures are translated at the integration boundary and failed delivery no longer returns a successful HTTP response.

## Concerns

- The migration's expression index assumes existing encargado rows do not already contain duplicate normalized name/apellido pairs; deployment should check duplicates before applying it.
- A process crash after idempotency reservation but before delivery completion leaves a stable incomplete result; operational cleanup/retry policy may be needed if this failure mode must be recoverable.
- Maven output includes the existing Mockito/Byte Buddy dynamic-agent warnings; tests still exit successfully.

## Review Fixes

### Coverage

- Replaced the optional constructor with one deterministic Spring constructor that requires `WhatsAppDeliveryRepository`; added an application-context bean construction test.
- Added explicit `IN_PROGRESS`, `SUCCEEDED`, and `FAILED` delivery states, five-minute leases, an atomic stale-claim update, and terminal failure replay through `WhatsAppIntegrationException`.
- Added response-ID validation for message/media responses and removed phone-derived log identifiers.
- Added normalized natural-identity lookup and a deterministic `V1_1` deduplication migration before the unique index migration; delivery lease/status columns use a new V3 migration.
- Added stable ID pagination tiebreakers and `ProblemDetail` handling for malformed page/size values.

### Commands And Output

- Red: `mvn -pl reporting-service -Dtest=Task3HardeningTest,Task3WhatsAppClientTest,ReportControllerTest test -q` failed because `claimStale`, explicit delivery states, and response validation were not yet implemented.
- Green focused: `mvn -pl reporting-service -Dtest=Task3HardeningTest,Task3WhatsAppClientTest,ReportControllerTest,ReportSendServiceTest,EncargadoServiceTest test -q` exited 0.
- Required suite: `mvn -pl reporting-service,territory-service test -q` exited 0.
- No PostgreSQL migration/integration test infrastructure was available in this worktree; SQL migrations were reviewed for ordering and schema compatibility.

### Remaining Concerns

- V3 can only classify legacy V2 rows from the fields V2 stored; rows left by a crash before this fix are conservatively terminal failures rather than silently reported successes.
- The V1.1 cleanup keeps the lowest encargado ID and deletes normalized duplicates; deployments should verify that no external process depends on duplicate IDs before migration.
