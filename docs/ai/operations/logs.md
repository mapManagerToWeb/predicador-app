# Logs

Backend usa SLF4J + Logback (configurado en cada servicio).
OpenTelemetry logs pueden exportarse al collector si se habilita.
Frontend usa `console` con `no-console: { allow: ['warn', 'error'] }`.

### Pipeline de diagnóstico
1. Verificar `backend` con `docker logs <container>`
2. Revisar salud de datasources en Grafana (`/api/datasources`)
3. Buscar `X-Correlation-ID` en request headers para tracing distribuido