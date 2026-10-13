# Design: harden-authorization-and-path-canonicalization

## Context

Security review of the backend returned **FAIL** with three verified findings, all rooted in one theme: the authorization decision and the URL the router actually uses can diverge.

- **H3 (Critical)**: admin endpoints relied on URL-pattern regexes in `SecurityRules`. If the regex sees a path differently from Spring's router, the admin rule silently never matches. `AuthorizationService` lived in `reporting-service`, so `territory-service` could not call `requireAdmin` — blocking the natural fix.
- **H4 (High)**: both `SessionAuthFilter` and the gateway's `ReactiveSessionAuthFilter` matched rules against the **raw** request URI (Tomcat does not decode `getRequestURI()`), while Spring routes on a decoded, per-segment form. Verified exploit: `GET /api/v1/territories/%61dmin/manzanas` — the raw-path regex sees `/territories/%61dmin/` and misses the admin rule, while Spring's `valueToMatch()` decodes `%61dmin` → `admin` and routes to the admin panel handler.
- **C1 (Critical)**: two paths could send WhatsApp from the congregation's Meta credentials to an arbitrary client-supplied number: `ReportSendService` trusted `destinationNumber` from the request, and `POST /api/v1/reports/whatsapp/async` published a client-chosen DTO to RabbitMQ.

Implementation for H3/H4/C1 already exists in the working tree (uncommitted). This change also corrects ADR 0016, whose disputed passage contained a factually wrong claim about Spring's path handling, removes a stale `.dockerignore` entry, and requires an independent review PASS plus the verification gates.

## Goals

- Admin operations are authorized by an explicit, shared, URL-spelling-independent check in every handler.
- Both filter edges canonicalize the path once, fail-closed, before matching rules.
- WhatsApp sends are confined to the configured destination with server-chosen content; no async bypass remains.
- ADR 0016 records only empirically verified facts about Spring's path handling.
- Independent reviewer PASS + backend and frontend verification gates pass (or pre-existing failures are honestly separated from regressions).

## Non-Goals

- H1 (`buscar-crear` account-creation flow) and H6 (IDOR) — deferred product decisions, documented, not fixed.
- C2, H5, H8, H2, H7 and all M/L findings — out of scope.
- Removing the now-dead RabbitMQ wiring / compose service — follow-up PR, explicitly out of scope.
- Any Spring Security / OAuth adoption — rejected (see Decision 1).
- Committing or pushing anything — the tree stays dirty for human review.

## Decisions

### Decision 1 — Handler-level `requireAdmin` in `shared`, not Spring Security method security

The project deliberately uses **custom HMAC session tokens** (`SessionTokenService`, ADR 0005 era) and **no Spring Security** on the servlet stack. Introducing `@PreAuthorize` would mean importing Spring Security infrastructure (filter chains, `SecurityContext`, method-security advisors) across three services for one role check — a large new dependency surface for a single requirement. The existing token type does not flow through Spring Security's `Authentication`, so method security would need an adapter anyway.

Chosen: `AuthorizationService.requireAdmin(SessionToken)` lives in `backend/shared` (its imports were already shared-only — no new module dependency) and each admin handler calls it as its **first statement**, via `RequestTokens` to read the verified token attribute. This is the Okta-endorsed defense-in-depth shape for service-to-service microservices: *validate the token in the gateway; if downstream services are not secure, add a validating filter in each service* — and beyond that, assert the role at the handler. The gateway regex + service-filter regex + handler check form three independent layers; a bypass in any URL-affecting layer still fails at the handler.

Research grounding for fail-closed direction: spring-security issue #5343 documents real authorization bypasses caused by *path-matching divergence* between security filters and the dispatcher; `StrictHttpFirewall` (rejecting `..`, `//`, encoded slashes) is the ecosystem-standard fail-closed answer to this class; nvidia/openshell issue #2699 shows a real-world residual canonicalizer bug where an in-library escape of dot-segment normalization bypassed rules — motivating both our normalization and our explicit residual handling.

### Decision 2 — `RequestPathCanonicalizer` at the filter edge (the `StrictHttpFirewall` analog)

Since the project runs no Spring Security, we implement the normalization directly: `RequestPathCanonicalizer` runs **once** in `SessionAuthFilter` and in `ReactiveSessionAuthFilter` before `findMatchingRule`. Behavior (contract in `path-canonicalization/spec.md`):

- percent-decode per segment (UTF-8, ASCII-hex only) — `%61dmin` ≡ `admin`;
- `+` stays literal;
- resolve `.`/`..`/empty segments (clipped at root, never above);
- malformed escape → `400 Bad Request` before any comparison on the servlet edge (`SessionAuthFilter` in territory/reporting), `401 Unauthorized` on the reactive gateway edge (`ReactiveSessionAuthFilter` — the canonicalization error folds into the auth failure path, deliberately stricter and fail-closed, not a bypass); both edges reject before any rule comparison or routing (ADR 0016 l.153-156);
- reject/normalize residual edge cases so no dot-segment survives normalization (openshell#2699 lesson).

The gateway additionally matches rules on the **decoded** path (`getPath()`), not `getRawPath()`.

**Verify-before-assume note (empirically confirmed this session against spring-web 7.0.9):**
`RequestPath.parse` + `PathPatternParser` decode percent escapes per segment via `PathContainer.PathSegment.valueToMatch()`; they **do not** eliminate `.` segments (preserved as literal `value='.'`/`valueToMatch='.'`); they **do not** collapse `//`; they **do not** resolve `..`. The 404 corollary (router "rejects" these) holds **only for exact patterns** — `/api/**` matches `/api/../api/v1/x` → `true`. So the router's behavior is *two-directional*: more permissive than the raw filter for percent-encoding, less permissive for dot paths on exact patterns. The invariant that protects us is therefore **the canonicalizer normalizing more and denying more**, not the router's matching behavior. The ADR and the canonicalizer Javadoc currently state the false ". segments are eliminated" claim — both get corrected (tasks 1.1–1.3).

Divergence is deliberate and fail-closed: canonical form matches **at least** as many rules as the router's view, so every request the router sends to admin behavior also hits the admin rule. Malformed input is rejected outright — no guessing.

### Decision 3 — Regex rules stay in `SecurityRules`; handler checks are additive, not a replacement

`SecurityRules` (first-match-wins, `REPORTS_PATH`/`TERRITORY_ADMIN` regexes) remains the edge layer: it protects routes without handlers, keeps 401s at the border, and — now — sees the canonicalized path. The handler `requireAdmin` is the authoritative check for operations with a handler. Removing the regexes would be wrong (the gateway and servlet edges still need a cheap deny-before-route), but the regexes alone were proven unsafe — hence the handler layer.

### Decision 4 — WhatsApp destination lock at the service, media capped before decode

`ReportSendService` sends **always** to `props.destinationNumber()` (config server-side); the client's `destinationNumber` field is *ignored*, not rejected — keeping the sync API non-breaking while making the field a documented no-op (task 2.2 adds the Javadoc). Template name, language and components are server-chosen from report data. `WhatsAppMediaClient` caps the Base64 representation at 2 MB (checked **before** `Base64.getDecoder()` runs — otherwise the client string materializes unbounded bytes in memory) and returns **413** when exceeded (verified in source).

The async path is **deleted** (`POST /api/v1/reports/whatsapp/async` removed → 404; `WhatsAppSendListener` removed). The RabbitMQ infra wiring (`RabbitMQConfig`, compose service) is retained but dead — removal is a follow-up PR because it touches compose/provisioning and is not needed to close C1 (trace confirmed no remaining caller can publish a client-chosen destination). `AsyncConfig` executor survives only if other code still uses it — verified during implementation; if unused, its removal is part of clean-up, not required by this change.

Note on the residual **LOW** (`WhatsAppSendRequest.destinationNumber` silently ignored): the DTO field remains a future re-wiring trap; task 2.2 marks it `@Deprecated` with Javadoc so a future reader does not re-enable it. H1's interaction closes with C1: even an account-takeover attacker can only send a fabricated report **to the congregation's own configured number**.

### Decision 5 — Verification strategy: randomized + differential

Rather than a fixed table of canonicalization cases, `RequestPathCanonicalizer` tests use **randomized** path generation (random segment alphabets including `%xx` escapes, `.`/`..`/empty segments) asserting the invariant: *the rule matched on any spelling is a subset of the rule matched on its canonical form* — i.e., canonicalization never makes a rule *less* applicable (deny-more). Fixed regression cases cover the verified exploits (`%61dmin`, `/./`, `//`, `%2e%2e`, malformed escapes, `+`). Edge-filter tests assert both filters canonicalize; handler tests assert `requireAdmin` is first-statement for all 29 admin handlers (regularity check via scanning admin controller mappings).

## Risks & Trade-offs

| Risk | Mitigation |
|---|---|
| Future admin handler added without `requireAdmin` | Contract spec + scanning test over controller mappings (Decision 5) + reviewer gate |
| Canonicalizer diverges from router in a *new* way | Fail-closed by construction (normalize-more = deny-more); malformed input → 4xx at the edge (400 servlet / 401 gateway); randomized invariant tests |
| Client `destinationNumber` re-wired in future | `@Deprecated` + Javadoc no-op (task 2.2); spec contract |
| Async/RabbitMQ wiring resurrected | Async endpoint and listener deleted; follow-up PR to strip infra; spec contract "no queue path" |
| `mvn verify -Pcoverage -Ddocker.available=true` fails on **pre-existing** issues (territory JaCoCo gate ~0.24/0.40 halts the reactor; `ReportRepositoryIntegrationTest`/`PostgisIntegrationTest`; ryuk image removal upstream breaks Docker-gated tests) | Verification task runs a **clean-HEAD baseline** first; any failure is classified pre-existing vs regression with evidence; results reported honestly, not papered over |
| `EncargadoRaceConditionIT` never runs (failsafe absent) | Documented in AGENTS.md; out of scope |
| ADR 0015 collision | 0016 (not 0015) is this change's ADR; 0015 belongs to unrelated CVE work — untouched |

## Migration Plan

- **Schema/data**: none — no Flyway migration. Explicitly do **not** add a territory migration: the DB has an unpushed `V3__add_s2_dissolved_and_meta`; Flyway validation would fail on startup.
- **API**: BREAKING only for `POST /api/v1/reports/whatsapp/async` (removed — approved). All other endpoints keep signatures; `destinationNumber` becomes a documented no-op.
- **Rollback**: everything is uncommitted — `git checkout` on the affected paths restores HEAD. No irreversible operation.
- **Config**: no new required env vars; `whatsapp.destinationNumber` continues to gate WhatsApp (sends no-op without it, per existing behavior).

## Open Questions

None that change the spec or design. Two tracked follow-ups: RabbitMQ wiring/compose removal (separate PR) and H1/H6 product decisions (documented in `tasks/security-blocking-fixes.md`).