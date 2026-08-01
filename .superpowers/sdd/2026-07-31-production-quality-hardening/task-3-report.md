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
