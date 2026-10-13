# Requerimientos no funcionales

| ID | Requerimiento | Valor |
|---|---|---|
| RNF-01 | Build backend | `mvn verify -Pcoverage` + gate JaCoCo 40% — **PASS solo con el ambiente de IT completo**: local `-Ddocker.available=true` (+ `TESTCONTAINERS_RYUK_DISABLED=true` en este entorno) o env `TERRITORY_IT_DB_*`; sin IT, `territory-service` cae bajo el gate (~25–29%) y el build falla |
| RNF-02 | Lint frontend | `pnpm run lint` 0 errors |
| RNF-03 | Tests frontend | `pnpm test -- --run --coverage` PASS (30/30/30/20) |
| RNF-04 | Build frontend | `pnpm run build` sin error (warning budget tolerado) |
| RNF-05 | Seguridad | gitleaks/Semgrep/OWASP/Trivy en CI |
| RNF-06 | Auth | `SESSION_SECRET` ≥32 bytes fuera de `local`; `ADMIN_PASSWORD_BCRYPT` obligatorio |
| RNF-07 | Phone validation | `esCelularChileno`: 9 dígitos start with 9; `+56` opcional |
| RNF-08 | Map worker | MapLibre GL 6, worker via `import.meta.url` → `/vendor/maplibre-gl-worker.mjs` |
| RNF-09 | SSR/PWA | Producción: `ng build` incluye SSR + service worker |
| RNF-10 | Latencia | Gateway retry solo GET, circuit breaker Resilience4j, timeout configurado |
| RNF-11 | Observabilidad | OTEL → jaeger/prometheus/grafana opt-in (`--profile observability`) |

## Restricciones de entorno
- **Backend**: Java 25 (`release 25`); PostGIS compose `imresamu/postgis:18-3.6`; CI usa `postgis/postgis:16-3.4`.
- **Frontend**: Node 22, pnpm 9.15.0, Angular 22 zoneless + SSR, Vitest `pool: threads` / `isolate: true`.
- **Docker**: `docker-compose.yml` base + observability opt-in.
- **Seguridad env**: `.env` y `application-local.yml` gitignored. `.env.example` → `.env` antes de compose.