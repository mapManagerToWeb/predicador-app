# Hallazgos bajos / mejoras de estilo

- Dockerfiles no declaran `USER` y usan imágenes base sin digest fijado: `backend/*/Dockerfile`; ejecutar como usuario no root y fijar tags/digests.
- Observabilidad publica interfaces al host y Prometheus activa `--web.enable-lifecycle`: `docker-compose.yml:163-191,206-207`; restringir a red administrativa.
- Grafana tiene fallback `admin/admin`: `docker-compose.yml:198-201`.
- Exporter `debug` de OpenTelemetry activo: `observability/otel-collector/otel-collector-config.yaml:31-40`; desactivarlo fuera de desarrollo.
- Falta CSP/HSTS visible en `SecurityHeadersFilter.java:14-18,27-31` y en el servidor frontend.
- `DEDUP_THRESHOLD_PX` y `COLORES_PREDEFINIDOS` están duplicados en frontend.
- Directorios `shared/components/*` y `shared/pipes` están vacíos.
- `normalizePhone` y construcción de payloads tienen duplicación entre servicios.
- `.eslintignore` genera warning con ESLint 10; migrar sus exclusiones a `eslint.config.js`.
- `skipTests: true` para todos los schematics: `predicador-frontend/angular.json:12-36`.
- No se ejecutaron `npm audit`, OWASP Dependency-Check ni Trivy; se recomienda incorporarlos como gates.
