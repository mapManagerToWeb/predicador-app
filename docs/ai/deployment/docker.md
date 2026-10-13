# Docker / Composición

```bash
docker-compose up --build         # 5 backend + postgres + rabbitmq + db-import
docker-compose --profile observability up -d  # otel-collector + jaeger + prometheus + grafana
```

Orden de arranque obligatorio: config-server → discovery-server → api-gateway → territory-service / reporting-service.
Frontend proxy: `ng serve` 4200 → `/api` → localhost:8080.

Producción DB: Neon (serverless). Compose local: `imresamu/postgis:18-3.6`. CI: `postgis/postgis:16-3.4`.
