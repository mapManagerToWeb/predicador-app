# Advertencias — Riesgo bajo (informativo)

| Contexto | Nota |
|---|---|
| `.gitignore` | Entradas obsoletas referencian `predicador-frontend/`; el directorio real es `territory-frontend/`. No hay impacto funcional. |
| `docs/` | Están versionados `docs/adr/` y `docs/ai/` (ADR 0017). `docs/audit/`, `docs/superpowers/`, `tasks/`, `CAPABILITY-MAP.md`, `backups/`, `.agents/`, `.claude/`, `.opencode/`, `.atl/` son gitignored (locales). |
| Leaflet | Pinned `1.9.4` en textos históricos; **el repo ya usa MapLibre GL 6** (ADR 0010). No reintroducir Leaflet. |
| Coverage thresholds | 60/58/55/50 son mínimos; pasar coverage ≠ buena cobertura. |
| Observability | Dashboard/Jaeger/Prometheus/Grafana son opt-in (`--profile observability`); el frontend no está instrumentado por defecto. |
| PWA | Service worker solo en build de producción (`ngsw-config.json`). |