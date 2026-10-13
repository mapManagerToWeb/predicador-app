# Proposal: harden-authorization-and-path-canonicalization

## Why

A security review of the backend returned **FAIL** with three verified findings that remain open in the working tree:

- **H3 (Critical)** — Admin endpoints were protected only by URL-pattern regexes in `SecurityRules`. Any divergence between how the regex sees a path and how the router sees it (percent-encoding, dot segments, duplicate slashes) silently skips the admin rule. The natural fix — `requireAdmin(...)` in each handler — was blocked because `AuthorizationService` lived in `reporting-service`, invisible to `territory-service`.
- **H4 (High)** — Both `SessionAuthFilter` and the gateway's `ReactiveSessionAuthFilter` matched rules against the **raw** request URI while Spring's router matches a normalized/decoded form. Same class of divergence as H3, at the edge.
- **C1 (Critical)** — Two send paths could push WhatsApp messages from the congregation's Meta credentials to an arbitrary client-supplied number: `ReportSendService` trusted `destinationNumber` from the request, and `POST /api/v1/reports/whatsapp/async` published a client-chosen DTO (number, template, components) to RabbitMQ for asynchronous delivery.

Additionally, the round-2 review verdict is **FAIL** because ADR 0016 contains factually wrong claims about Spring's path handling (verified empirically against spring-web 7.0.9), and `backend/.dockerignore` still excludes a class that was deleted. No independent review PASS exists yet.

## What Changes

- **H3**: `AuthorizationService` moves to `backend/shared` (`com.predicador.shared.security`) — its imports were already shared-only, so no new module dependency. All **29 admin handlers** call `requireAdmin(...)` as their first statement; `RequestTokens` provides the read-only attribute accessor. `assignColor` (`PUT /api/v1/territories/{n}/color`) is gated too.
- **H4**: `RequestPathCanonicalizer` (decode percent escapes per segment — `+` stays literal, resolve `.`/`..`/empty segments, malformed escapes → 400) runs **once at the filter edge** before `findMatchingRule`, in both `SessionAuthFilter` (territory/reporting) and `ReactiveSessionAuthFilter` (gateway, using the decoded path rather than `getRawPath()`). Regex rules in `SecurityRules` stay as the edge layer; handler checks are defense-in-depth, not replacement.
- **C1**: `ReportSendService` always uses `props.destinationNumber()`; client-supplied `destinationNumber` is ignored. `WhatsAppMediaClient` caps Base64 media at 2 MB before decode. **The async queue send path is deleted** (`WhatsAppSendListener` removed; RabbitMQ wiring retained-but-dead is out of scope, tracked as follow-up debt).
- **ADR 0016 correction**: rewrite the disputed passage using only empirically verified spring-web 7.0.9 facts (`valueToMatch()` exists on `PathContainer.PathSegment` and decodes; `PathPatternParser` does **not** eliminate `.` segments; `//` not collapsed; `..` not resolved; the 404 corollary holds only for exact patterns). Record the new ADR under `docs/adr/` (0016, not 0015 — that number belongs to unrelated CVE work).
- **Housekeeping**: remove the stale `backend/.dockerignore` line that excludes `**/WhatsAppSendListener.java`.
- **Verification**: full backend gate `mvn verify -Pcoverage -B -Ddocker.available=true`, frontend gate (lint/build/test), and an **independent reviewer PASS** — the two prior review attempts were cancelled before producing a verdict.
- **Documented, not fixed (product decisions)**: H1 (`buscar-crear` account-creation flow) and H6 (IDOR) are deferred with rationale; C2, H5, H8, H2, H7, M/L findings are out of scope.

## Capabilities

### New Capabilities

- `backend/admin-authorization`: Admin-only operations are authorized by an explicit, URL-writing-independent check inside every admin handler (`AuthorizationService.requireAdmin`), living in `backend/shared` so both data services can inject it. The check does not depend on how the URL was written.
- `backend/path-canonicalization`: Both filter edges (gateway reactive + service servlet) canonicalize the request path once (percent-decode per segment, resolve dot/duplicate-slash segments, reject malformed escapes) before matching authorization rules, failing closed and deliberately diverging from Spring's router in the deny-more direction.
- `backend/whatsapp-send-confinement`: WhatsApp messages are sent only to the congregation's configured destination with server-chosen template/components; media is size-capped before decoding; no queue-based path can bypass the destination lock.

### Modified Capabilities

(none — `openspec/specs/` has no existing capabilities; prior changes used new capabilities throughout)

## Impact

- **Code**: `backend/shared` (new `AuthorizationService`, `RequestTokens`, `RequestPathCanonicalizer`, `SessionAuthFilter`, `SecurityRules` unchanged), `api-gateway` (`ReactiveSessionAuthFilter` + route config), `territory-service` and `reporting-service` controllers (29 handlers), `reporting-service` send path (`ReportSendService`, `WhatsAppMediaClient`, deleted async listener + controller endpoint), tests across all three services.
- **Docs**: new `docs/adr/0016-*.md` (untracked, awaiting human review); no existing ADR edited.
- **API**: **BREAKING** — `POST /api/v1/reports/whatsapp/async` is removed (approved by user). Client `destinationNumber` becomes a no-op field.
- **Dependencies/infra**: none added. RabbitMQ remains provisioned in compose but unused by the send flow (follow-up: remove in a separate PR).
- **Process**: tree stays **uncommitted** for human review; unrelated in-tree work (`f5-gps-mode-cwv-hardening`, CVE/dependency pinning, ADR 0015) untouched.
