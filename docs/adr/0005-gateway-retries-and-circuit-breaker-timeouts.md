# ADR 0005: Gateway retries and circuit-breaker timeouts

## Status

Accepted

## Context

During cold starts (services registering late into Eureka) and transient
failures, the gateway surfaced repeated errors to users. Retries were
aggressive and timeouts were not explicit per route.

## Decision

- **Retries reduced to 1, GET only, on every route except the RUM sink**
  (`RouteConfig.java:63-66,73-76,83-86,93-96,103-106,110-114`).
- **Explicit per-circuit-breaker timeouts** in the gateway config
  (`backend/api-gateway/src/main/resources/application.yml:63-112` — the
  gateway does not use a config client; the `config-server` copy under
  `backend/config-server/src/main/resources/config/api-gateway.yml` is a
  mirror and is not consumed at runtime):
  `territoryCB-colors` 5 s, `territoryCB-geojson` 30 s, `territoryCB-default`
  15 s, `reportingCB` 20 s, `encargadosCB` 10 s, `rumCB` 5 s.
- **Fallbacks** `forward:/fallback/territory` and `forward:/fallback/reporting`
  render an RFC 7807 `ProblemDetail` and log a WARN with the root cause
  (`FallbackController.java:41-60`, `log.warn` at `:55`).
- **Circuit-breaker defaults:** sliding window 30, minimum calls 20,
  failure-rate threshold 50%, slow-call threshold 60% / 3 s, open state 15 s,
  half-open permits 5 (`backend/api-gateway/src/main/resources/application.yml`).

## Consequences

- Fewer visible errors during cold starts and transient failures.
- RUM is exempt from retries (high-volume, idempotent metric; losing one is
  acceptable), keeping load off reporting-service.