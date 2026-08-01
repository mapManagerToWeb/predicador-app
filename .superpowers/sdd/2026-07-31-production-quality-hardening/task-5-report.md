# Task 5 Report

## Changed Files

- `backend/api-gateway/src/main/java/com/predicador/gateway/config/ActuatorAccessFilter.java`
- `backend/api-gateway/src/main/java/com/predicador/gateway/config/AuthController.java`
- `backend/api-gateway/src/main/java/com/predicador/gateway/config/RouteConfig.java`
- `backend/api-gateway/src/main/resources/application.yml`
- `backend/api-gateway/src/test/java/com/predicador/gateway/config/AuthControllerTest.java`
- `backend/api-gateway/src/test/java/com/predicador/gateway/config/AuthCookieSecurityTest.java`
- `backend/config-server/src/main/resources/config/api-gateway.yml`
- `backend/reporting-service/src/main/java/com/predicador/reporting/controller/EncargadoController.java`
- `backend/reporting-service/src/main/java/com/predicador/reporting/dto/LoginResponse.java`
- `backend/reporting-service/src/test/java/com/predicador/reporting/controller/EncargadoControllerTest.java`
- `backend/shared/src/main/java/com/predicador/shared/security/SessionAuthFilter.java`
- `backend/shared/src/test/java/com/predicador/shared/security/SessionAuthFilterTest.java`
- `docker-compose.yml`
- `predicador-frontend/src/app/app.config.ts`
- `predicador-frontend/src/app/core/interceptors/auth.interceptor.ts`
- `predicador-frontend/src/app/core/interceptors/auth.interceptor.spec.ts`
- `predicador-frontend/src/app/core/interceptors/csrf.interceptor.ts`
- `predicador-frontend/src/app/core/interceptors/csrf.interceptor.spec.ts`
- `predicador-frontend/src/app/core/interceptors/error.interceptor.ts`
- `predicador-frontend/src/app/core/interceptors/error.interceptor.spec.ts`
- `predicador-frontend/src/app/core/services/auth-token.ts`
- `predicador-frontend/src/app/core/services/auth-token.spec.ts`
- `predicador-frontend/src/app/core/services/encargado.ts`
- `predicador-frontend/src/app/features/admin/admin.ts`
- `predicador-frontend/src/app/features/map/territory-search/territory-search.ts` (logout hunk only; prior unrelated changes preserved)

## TDD Evidence

Red tests were run before implementation:

- Frontend auth specs: 5 expected failures and one missing interceptor module, caused by absent cookie credentials, persisted token removal, and missing CSRF interceptor.
- Backend security tests: compilation failures for the not-yet-defined cookie, logout, CSRF, and CORS contracts.
- Token-body hardening red run: admin and reporting tests failed because login responses still exposed `token`.

Green results after implementation:

- `mvn -pl api-gateway,reporting-service,shared -am -DskipTests=false -Dtest=AuthControllerTest,AuthCookieSecurityTest,EncargadoControllerTest,SessionAuthFilterTest test`: **BUILD SUCCESS**; 10 shared, 12 gateway, and 8 reporting tests passed.
- `npm test -- --run`: **129 tests passed across 20 files**.
- `npm run lint`: passed with six pre-existing `no-explicit-any` warnings in unrelated map specs.
- `npx ng build --configuration=production`: completed successfully with SSR/prerender output.

## Self-Review

- Session cookies are `HttpOnly`, `Secure`, `SameSite=Lax`, path `/`, and are set by both gateway admin login and reporting encargado login.
- Login JSON no longer contains the HMAC token.
- Logout expires the common session cookie and clears Angular reactive auth state.
- Shared authentication is cookie-first; a supplied header is not used when a session cookie is present, and browser interceptors never send the header or localStorage token.
- Gateway CSRF validation uses a constant-time cookie/header comparison and has explicit login/bootstrap exceptions.
- Credentialed CORS uses configured origins and explicit request headers, never wildcard origins.
- No unrelated worktree changes were reverted.

## Concerns

- `Secure` cookies require HTTPS in deployed/browser environments. Local HTTP development must use the explicitly configured local development setting or HTTPS; production remains secure by default.
- The focused tests do not exercise a live Docker/Eureka/PostgreSQL login round trip. They cover both controller response contracts, gateway CSRF behavior, shared cookie verification, and Angular transport behavior.
- Maven emits the repository's existing Mockito dynamic-agent warnings; they do not affect test results.
