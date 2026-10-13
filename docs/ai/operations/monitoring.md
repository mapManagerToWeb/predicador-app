# Monitoreo (opt-in)

## Lanzar con perfil
```bash
docker-compose --profile observability up -d
```

### Backend (Micrometer + OpenTelemetry)
- Métricas Prometheus: JVM, HTTP request rates, error rates, DB query latency
- Tracing: OpenTelemetry → Jaeger
- Export: `otel-collector` → ver Grafana/Prometheus

### Frontend
- No instrumentado por defecto; puede agregarse con `@angular/pwa` + custom interceptor

## Grafana
- Dashboards predefinidos para JVM métricas, HTTP requests, DB latency
- Alertas vía contact points (email, Slack opcional)