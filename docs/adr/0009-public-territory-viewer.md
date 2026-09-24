# ADR 0009: Public read-only territory viewer

## Status

Accepted

## Context

Only group conductors (encargados) sign in and mark territories. Other
publishers — brothers who do not take out territories and sisters who do not
conduct groups — also want to know which territories and streets have been
worked recently, but they must not be able to edit anything, and they should
not need an account.

## Decision

- **Route `/visor`** with no guard, linked from the login ("Ver territorios sin
  iniciar sesión"). Rendered client-side (`RenderMode.Client`).
- **MapLibre** for the viewer, reusing the admin panel's base map, now moved to
  `core/map/base-map.ts`. It is independent of the Leaflet field map, so it is
  also a first, low-risk step of the planned MapLibre migration.
- **Public endpoint `GET /api/v1/reports/public/estado`** (reporting-service):
  per territory, the last report (cumulative for the current round:
  `manzanasIds`, partial geometry, status, counters) and the dates of the last
  work and last completion. `SecurityRules.REPORTS_PATH` excludes
  `/api/v1/reports/public/**`; everything else under `/reports` still needs a
  session. Served with `Cache-Control: public, max-age=60`.
- **Privacy**: the viewer shows manzanas and dates only — no encargado names
  or phone numbers. The DTO has no person fields, and an integration test
  guards this.
- The public manzana GeoJSON adds `mid` (numeric id), because reports
  reference manzanas either as `"T-bloque"` or as numeric ids depending on the
  app version.

## Consequences

- Anyone with the URL can see which areas were worked and when. We accepted
  this because the territory map was already public (`/territories/**`), and
  no personal data is exposed.
- The endpoint aggregates the reports table on every cache miss; the volume is
  small (thousands of rows per year) and the 60 s cache bounds the load.
