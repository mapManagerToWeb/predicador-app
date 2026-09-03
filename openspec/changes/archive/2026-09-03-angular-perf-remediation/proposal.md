## Why

The Angular audit (2026-09-02) identified 7 actionable findings (2 false positives corrected via grill-me). The P1 findings represent real code quality gaps (weak HTTP typing, console.error in production) and a critical version concern (Spring Boot 4.0.7 does not exist on Maven Central). P2 findings are incremental improvements. Addressing these now keeps the codebase healthy.

## What Changes

- Verify/fix Spring Boot version (4.0.7 -> 4.0.3 or 4.1.0)
- Replace `as` type assertions on HTTP responses with proper typed interfaces
- Remove `console.error` calls (map-data-persistence.service.ts, server.ts)
- Remove deprecated `"interceptor"` schematics from angular.json
- Add exponential backoff to WhatsApp polling loop (with UX verification)
- Document admin guard as intentional no-op
- Add `readonly` to private HTTP injection in EncargadoService

## Capabilities

### Modified Capabilities

- `core/http`: HTTP response types are explicitly typed (no `as` casts)
- `core/logging`: Console error calls removed (toast messages already shown)
- `map/whatsapp`: WhatsApp polling uses exponential backoff

### New Capabilities

- `config/spring-boot`: Verified Spring Boot version alignment

## Impact

- **Backend**: `pom.xml` — Spring Boot version correction
- **Services**: `territorio.ts` — typing fixes; `encargado.ts` — readonly
- **Map**: `map-data-persistence.service.ts` — console.error removal
- **Angular**: `angular.json` — deprecated schematics removal
- **WhatsApp**: `whatsapp.ts` — polling backoff (**verify UX impact**)
- **Tests**: Existing specs should pass
