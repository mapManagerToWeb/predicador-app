# Task 2 Report: Owner Authorization and Internal Network Boundaries

## Changed Files

- `.github/workflows/docker.yml`: changed Docker Buildx context to `backend` and kept each matrix Dockerfile relative to that context.
- `docker-compose.yml`: removed host port mappings from Config Server, Eureka, territory, and reporting; retained only gateway `8080:8080`; added internal service `expose` entries.
- `backend/reporting-service/src/main/java/com/predicador/reporting/config/SecurityConfig.java`: clarified that the filter authenticates principals and service-layer code applies owner/admin authorization.
- `backend/reporting-service/src/main/java/com/predicador/reporting/controller/EncargadoController.java`: reads `SessionAuthFilter.ATTR_TOKEN`, passes tokens to protected service methods, and emits forbidden `ProblemDetail` responses.
- `backend/reporting-service/src/main/java/com/predicador/reporting/controller/ReportController.java`: passes request tokens to report operations and requires authentication for WhatsApp sends.
- `backend/reporting-service/src/main/java/com/predicador/reporting/service/AuthorizationService.java`: added the single owner/admin authorization helper.
- `backend/reporting-service/src/main/java/com/predicador/reporting/service/EncargadoService.java`: enforces admin access for global queries and owner/admin access for updates.
- `backend/reporting-service/src/main/java/com/predicador/reporting/service/ReportService.java`: enforces owner checks for report creation and encargado filters, and admin checks for global/territory operations.
- Reporting controller/service tests: added owner mismatch, admin bypass, and `403` ProblemDetail coverage; updated existing fixtures to pass explicit tokens.

## Verification

- Red phase: `mvn -pl reporting-service -Dtest=AuthorizationServiceTest,ReportServiceTest,EncargadoServiceTest test -B` failed because the new authorization helper and token-aware service signatures were not implemented yet.
- Focused green phase: the same focused command passed with `36` tests initially, then `38` tests after controller authorization coverage was added.
- Required focused verification: `mvn -pl reporting-service test -B` passed with `83` tests, `0` failures, and `0` errors.
- Compose validation: `SESSION_SECRET=... ADMIN_USERNAME=admin docker compose config` passed and showed only gateway host port `8080`.
- Docker verification: `docker build --file reporting-service/Dockerfile --tag predicador-reporting-task2-check .` from `backend/` passed, including the Maven package build and image export.
- `git diff --check` passed.

## Self-Review

- Controllers obtain the validated `SessionToken` only from `SessionAuthFilter.ATTR_TOKEN`; no header parsing or duplicated owner string comparison was added.
- Owner comparison is exactly `String.valueOf(ownerId).equals(token.subject())`; admin tokens bypass owner restrictions.
- Ownership is checked before repository access or report persistence, preventing unauthorized reads/writes from returning empty successful results.
- Global report, territory, encargado-list, and encargado-search operations require admin; owner-specific report reads and encargado updates allow the matching owner.
- WhatsApp send is authenticated at the controller boundary. The existing request has no owner ID, so no name-based ownership inference was introduced.
- Cookie/CSRF and pagination were intentionally not implemented.
- Existing unrelated worktree changes, including Task 1 changes, were not reverted.

## Concerns

- Maven tests emit the repository's existing Mockito dynamic-agent/JDK warnings; they do not fail the build.
- The full Docker Compose stack was not started; image build and configuration validation were run successfully.
- Existing edits in Task 2-listed files were preserved and are included at file granularity when the Task 2 commit is staged.

## Review Fixes

Review findings were addressed with test/support changes only. Production files and behavior were unchanged.

- `ReportControllerSendTest` constructs `ReportController` with the concrete `AuthorizationService`, sends authenticated requests with a matching encargado token, verifies successful WhatsApp handling, and verifies unauthenticated requests return `403` `ProblemDetail` without calling the send service.
- `ReportServiceTest` constructs `ReportService` with the concrete helper and covers matching-owner creation/read, mismatched-owner rejection, admin bypass, and today/territory/batch owner/admin boundaries.
- `EncargadoServiceTest` constructs `EncargadoService` with the concrete helper and covers matching-owner update, mismatched-owner rejection, admin update/list/search access, and owner rejection for global list/search operations.

## Review Fix Verification

Focused command:

```text
mvn -pl reporting-service -Dtest=ReportControllerSendTest,ReportServiceTest,EncargadoServiceTest,AuthorizationServiceTest test -B
```

Exact result:

```text
[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0 -- ReportControllerSendTest
[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0 -- AuthorizationServiceTest
[INFO] Tests run: 15, Failures: 0, Errors: 0, Skipped: 0 -- ReportServiceTest
[INFO] Tests run: 14, Failures: 0, Errors: 0, Skipped: 0 -- EncargadoServiceTest
[INFO] Tests run: 35, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

Required full command:

```text
mvn -pl reporting-service test -B
```

Exact result:

```text
[INFO] Tests run: 92, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

The test run still prints the existing Mockito/JDK dynamic-agent warning and expected validation-test warning logs; neither affects the result.
