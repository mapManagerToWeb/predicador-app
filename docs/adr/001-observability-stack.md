# ADR-001: Observability Stack Selection

**Date:** 2026-07-29
**Status:** Accepted
**Deciders:** Staff Engineer

## Context

The application needs production-grade observability covering metrics, traces, and logs. The system is a microservices architecture with Spring Boot services and an Angular SPA.

## Decision

Use the **OpenTelemetry + Prometheus + Grafana + Jaeger** stack:

- **Metrics**: Micrometer (Spring Boot native) → Prometheus scrape → Grafana dashboards
- **Traces**: OpenTelemetry SDK → OTel Collector → Jaeger
- **Logs**: Logback JSON (logstash-logback-encoder) with traceId/spanId correlation
- **Dashboards**: Pre-built Grafana dashboard auto-provisioned

### Why not alternatives?

| Alternative | Rejection Reason |
|---|---|
| Datadog / New Relic | SaaS cost; prefer self-hosted for this project scope |
| ELK Stack | Heavier than needed; Prometheus+Grafana covers metrics+logs |
| Zipkin | Less ecosystem support than Jaeger for OTLP native |
| Micrometer-only (no OTel) | OTel gives vendor-neutral trace export and future flexibility |

## Consequences

### Positive
- Unified trace propagation from Angular SPA → Gateway → services
- Prometheus scrape model avoids push-based metric loss
- Grafana dashboards auto-provisioned on first `docker compose --profile observability up`
- Logback JSON with traceId enables log-to-trace correlation

### Negative
- OTel Collector adds one more container to maintain
- Prometheus TSDB requires volume management for retention
- Jaeger all-in-one is not suitable for production (use Jaeger operator or Tempo)

### Risks
- **Cardinality explosion**: RUM metrics with unbounded route labels can crash Prometheus. Mitigated by route sanitization and max length.
- **Trace sampling**: Currently 100% in dev. Production should use probabilistic sampling (0.1) to manage storage.
