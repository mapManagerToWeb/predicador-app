# Proposal: f5-gps-mode-cwv-hardening

## Why

Three threads converge in F5:

1. **GPS follow-me mode**: preachers walk territories with the map open, but the current "Mi ubicación" watch (`map-location.service.ts`) only records position for status — it never drives the map view. There is no way to continuously see where you are relative to the territory you are covering.
2. **CWV hardening**: after F3/F4 the `/map` page is the app's biggest Core Web Vitals risk (WebGL canvas interactions → INP, overlay rendering → CLS). RUM already reports LCP/INP/CLS/FCP/TTFB to `/api/v1/rum`, but no budgets are defined, no regressions are caught, and nothing is enforced in CI — so a performance regression ships silently.
3. **Deferred `/all/geojson` removal**: F3 and F4 explicitly deferred removing `GET /api/v1/territories/all/geojson`. The bulk snapshot loads every territory's full geometry on map init, amplifying payload size and Neon cold-start latency, even though the map now renders from MVT tiles. F5 completes the deferral — which requires replacing the snapshot's metadata consumers first.

## What Changes

- **GPS follow-me tracking mode** on the map: a toggle that continuously follows the user's live position — center/zoom lock on the user, accuracy circle, breadcrumb trail of the walked route, battery-friendly watch options, and clear permission/error UX. Built on the existing Geolocation API watch.
- **CWV hardening**: written performance budgets for the `/map` page (and login), targeted fixes for map-page vitals regressions, and CI enforcement so budget violations fail the build.
- **BREAKING**: remove `GET /api/v1/territories/all/geojson` (territory-service controller, gateway route with `territoryCB-geojson`, cache-header entry). Frontend consumers of the one-time snapshot (per-territory metadata in `map-rendering.facade`, label centers, fid↔territory bridge for marks, report counts, `territorio.ts` snapshot fetch) migrate to a lightweight tile-derived metadata source. The per-territory `GET /{numero}/geojson` endpoint stays (hybrid edit mode still needs it).

## Capabilities

### New Capabilities

- `map/gps-tracking`: follow-me GPS mode — activation/deactivation, position lock, accuracy circle, breadcrumb trail, permission/error handling, battery-conscious watch configuration.
- `performance/core-web-vitals`: CWV performance budgets for key routes, map-page vitals targets, and CI budget enforcement.
- `territory/geojson-api`: territory geometry API surface after bulk-snapshot removal — tiles + per-territory GeoJSON only, plus the lightweight metadata source that replaces the `/all/geojson` snapshot for frontend consumers.

### Modified Capabilities

(none — `openspec/specs/` has no archived specs yet; F3/F4 deltas are still pending in their change folders)

## Impact

- **Frontend**: `features/map/services/map-location.service.ts` (follow-me logic), new map control for the GPS toggle, `map-rendering.facade.ts`, `map-label-layer.service.ts`, `map-marked-overlay.service.ts`, `map-report.service.ts`, `core/services/territorio.ts` (snapshot removal), CI budget config (`ci-frontend.yml`).
- **Backend**: `TerritoryController` (remove `/all/geojson`), `RouteConfig.java` (remove `territoryCB-geojson` route), `CacheHeadersFilter`, `TerritoryControllerTest`.
- **API consumers**: any external caller of `/api/v1/territories/all/geojson` breaks — the gateway no longer routes it (404 after route removal).
- **Data/infra**: smaller map-init payloads reduce Neon cold-start pressure (aligns with 2026-09-23 root-cause work).
- **Observability**: existing RUM stream is the measurement source for budget verification; no pipeline change required.
