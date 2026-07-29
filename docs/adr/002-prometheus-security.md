# ADR-002: Prometheus Endpoint Security

**Date:** 2026-07-29
**Status:** Accepted
**Deciders:** Staff Engineer

## Context

All Spring Boot services expose `/actuator/prometheus` with `access: unrestricted`. This endpoint exposes internal JVM metrics, HTTP request histograms, and custom business metrics. In production, this must not be accessible from the public internet.

## Decision

### 1. Network-level isolation
- `/actuator/prometheus` should only be reachable from the Prometheus scrape network
- In Docker Compose: services communicate on internal network; Prometheus scrapes via container DNS
- In Kubernetes: use NetworkPolicy to restrict access to Prometheus namespace only

### 2. Actuator endpoint exposure
- **Expose**: health, info, metrics, prometheus
- **Never expose**: env, beans, configprops, heapdump, threaddump, conditions, shutdown
- Health endpoint: `show-details: when-authorized` (already configured)

### 3. Gateway-level protection
- Add a route filter in api-gateway that blocks `/actuator/**` from external routes
- Only allow internal network access to actuator endpoints

### 4. Prometheus configuration
- No authentication on Prometheus itself (internal network only)
- Alert rules configured to detect scrape failures and cardinality anomalies

## Implementation

```yaml
# Each service application.yml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      show-details: when-authorized
    prometheus:
      access: unrestricted  # OK because network-isolated
```

## Consequences

### Positive
- Prometheus metrics remain accessible for monitoring without auth overhead
- No risk of env/heapdump leaking to external callers
- Defense-in-depth: network + endpoint exposure + gateway filter

### Negative
- Requires correct Docker network / Kubernetes NetworkPolicy configuration
- If network misconfigured, Prometheus cannot scrape → alert on missed scrapes

### Verification
- Test that `curl http://localhost:8080/actuator/prometheus` returns 404/403 from outside
- Test that Prometheus can scrape successfully from within the docker network
