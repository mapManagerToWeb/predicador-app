# Task 4 Report

## Changed Files

- Hardened profile storage parsing and runtime validation with SSR-safe storage access.
- Changed protected route authentication to use the session token; admin navigation remains available for its login form.
- Removed eager router preloading and kept map/screenshot chunks lazy.
- Added capture restoration in `finally` and kept send loading cleanup in `finally`.
- Enabled strict TypeScript, centralized the duplicate deduplication constant, and removed the legacy ESLint ignore file.
- Added profile, guard, and capture regression tests.

## Tests and Commands

- `npm test -- --run src/app/features/map/map-report.service.spec.ts src/app/core/services/profile.spec.ts src/app/core/guards/profile.guard.spec.ts src/app/core/guards/admin.guard.spec.ts`: 4 files, 18 tests passed.
- `npm run lint`: passed with 0 errors and 6 pre-existing `no-explicit-any` warnings.
- `npx tsc -p tsconfig.app.json --noEmit`: passed.
- `npm run build`: passed; map and `html2canvas` remained lazy chunks.
- `git diff --check`: passed.

## Self-Review

- No cookie or CSRF transport changes were made; the existing `X-Session-Token` header transport remains in place.
- Stored profile and role values are not used to grant protected route access.
- Invalid profile storage is cleared without allowing parse or storage errors to break startup.
- SSR browser-global guards remain in place.

## Concerns

- Existing map specs still emit six `no-explicit-any` warnings; they do not fail lint.
- The capture regression test covers restoration when the map element is absent; the same `finally` also covers dynamic screenshot failures at runtime.

## Review Fixes

- `MapReportService.captureScreenshot()` now includes preparation in the cleanup scope, restores safely after preparation or rendering failure, and guards `document` for SSR.
- `MapDataPersistenceService` now performs report construction inside the loading cleanup scope for both save paths.
- Legacy `isAdmin` storage is no longer used to restore admin UI state and is cleared on logout or unauthorized responses.
- `AuthTokenService.hasToken()` rejects empty or whitespace-only tokens.
- `MapCaptureService` falls back to a timeout when `requestAnimationFrame` is unavailable.
- Added regressions for preparation failure, screenshot failure, both persistence construction failures, legacy admin state, empty tokens, and SSR document access behavior.

## Review Fix Verification

Command: `npm test -- --run src/app/core/services/profile.spec.ts src/app/core/guards/profile.guard.spec.ts src/app/core/services/auth-token.spec.ts src/app/core/interceptors/error.interceptor.spec.ts src/app/features/admin/admin.spec.ts src/app/features/map/map-report.service.spec.ts src/app/features/map/services/map-data-persistence.service.spec.ts`

Output: `Test Files 7 passed (7)`; `Tests 44 passed (44)`; exit code `0`.

Command: `npm run lint`

Output: exit code `0`; `0 errors, 6 warnings` from existing `no-explicit-any` usages in map specs.

Command: `npx tsc -p tsconfig.app.json --noEmit`

Output: no output; exit code `0`.

Command: `npm run build`

Output: `Application bundle generation complete`; `Prerendered 1 static route`; exit code `0`.
