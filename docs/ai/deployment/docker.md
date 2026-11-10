# Docker / Composición

```bash
docker-compose up --build         # 5 servicios backend + postgres + rabbitmq + db-import + docker-lectura
docker-compose --profile observability up -d  # otel-collector + jaeger + prometheus + grafana
```

Orden de arranque obligatorio: config-server → discovery-server → api-gateway → territory-service / reporting-service.
Frontend proxy: `ng serve` 4200 → `/api` → localhost:8080.

Producción DB: contenedor `postgres` del compose, self-hosted (ADR 0006, reemplazó Neon). Compose local: `imresamu/postgis:18-3.6`. CI: `postgis/postgis:16-3.4`.

`docker-lectura` es un HAProxy que solo permite `GET /containers/json` y `/containers/<id>/stats` sobre el socket de Docker; el módulo «Sistema» del gateway lee el estado a través de él (ADR 0020). No ampliar sus rutas: el inspect expone variables de entorno con contraseñas.
