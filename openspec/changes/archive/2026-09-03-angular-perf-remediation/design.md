## Context

Angular audit identified 9 findings (3 P1, 6 P2) across auth-token error handling, HTTP typing, console.error usage, localStorage in constructors, polling patterns, and preconnect hints. All findings are incremental quality improvements — no architectural changes needed.

## Decisions

### D1: Error handling in auth-token logout
- **Approach**: Wrap the subscribe callback with `.subscribe({ error: () => {} })` to prevent unhandled promise rejection
- **Rationale**: Logout is fire-and-forget; we don't want to show toast for a failed logout, but we must prevent the error from propagating
- **Alternative considered**: Using `firstValueFrom` with try/catch — rejected because logout doesn't need the response value

### D2: HTTP response typing
- **Approach**: Add typed response interfaces to `territorio.ts` for the two `as` casts (EstadoReporte, TipoSesion)
- **Rationale**: Type assertions are a code smell; the backend already returns typed responses
- **Alternative considered**: Runtime validation with zod — overkill for internal API

### D3: Console.error replacement
- **Approach**: Remove `console.error` calls in `map-data-persistence.service.ts` (lines 73, 182). These are in catch blocks that already propagate errors via toast
- **Rationale**: The error interceptor already handles user-facing error messages; console.error is redundant
- **Alternative considered**: Create a LoggerService — YAGNI for 2 call sites

### D4: Tile server preconnect
- **Approach**: Add `<link rel="preconnect" href="https://tile.openstreetmap.org" crossorigin>` to `index.html`
- **Rationale**: First map load triggers 3 sequential DNS lookups (OSM, CartoDB, ArcGIS). Preconnect eliminates DNS+TLS latency for OSM
- **Alternative considered**: Preconnect all three tile providers — only do OSM (most common); CartoDB/ArcGIS load after map init

### D5: WhatsApp polling backoff
- **Approach**: Replace fixed 2s interval with exponential backoff: start at 2s, double on each poll, cap at 30s, reset on new report submission
- **Rationale**: Continuous polling wastes resources when no reports are pending; backoff is standard for polling patterns
- **Alternative considered**: WebSocket push — backend doesn't support it yet; out of scope

### D6: Admin guard
- **Approach**: Keep as no-op, add JSDoc comment explaining the design decision
- **Rationale**: Admin page has its own login form (phone + auth code); the route guard is intentionally permissive because auth is enforced at the page level, not the route level

## Risks

- **R1**: Removing console.error reduces debuggability in production — mitigated by error interceptor already showing toasts
- **R2**: Preconnect adds HTML payload — negligible (1 line, ~80 bytes)
- **R3**: Exponential backoff may delay status updates — mitigated by 30s cap and reset on new submissions
