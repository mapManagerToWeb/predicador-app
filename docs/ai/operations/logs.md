# Logs

Backend usa SLF4J + Logback (configurado en cada servicio), con salida JSON que incluye `service`, `level`, `traceId` y `spanId`.
OpenTelemetry puede exportar traces al collector si se habilita (`--profile observability`).
Frontend usa `console` con `no-console: { allow: ['warn', 'error'] }`.

### Pipeline de diagnóstico
1. Verificar el backend con `docker compose logs -f <container>`.
2. Revisar salud de datasources en Grafana (`/api/datasources`).
3. Buscar el `traceId` del request en los logs del servicio para seguir el tracing distribuido; si no hay trazado activo, `traceId` va vacío.
