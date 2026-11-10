# Monitoreo (opt-in)

## Lanzar con perfil
```bash
docker-compose --profile observability up -d
```

### Backend (Micrometer + OpenTelemetry)
- Métricas Prometheus: JVM, HTTP request rates, error rates, latencia de queries DB
- Tracing: OpenTelemetry → Jaeger
- Export: `otel-collector` → Prometheus/Grafana

### Frontend (RUM)
- Core Web Vitals (LCP, INP, CLS, FCP, TTFB) vía `web-vitals` → `POST /api/v1/rum` (público, 30/min, sin retry en el gateway).
- Se consulta por ruta; no hay instrumentación automática de errores.

## Grafana
- Dashboards versionados en `observability/grafana/dashboards/` (JVM, HTTP, DB).
- Alertas vía contact points (email, Slack opcional).
