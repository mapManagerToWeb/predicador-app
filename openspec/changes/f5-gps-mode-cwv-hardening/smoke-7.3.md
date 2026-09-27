# 7.3 Manual smoke checklist — f5-gps-mode-cwv-hardening

Date: 2026-09-25. Stack: local `docker compose` (rebuilt with today's changes: metadata endpoint, fid emission, `/all/geojson` removal), frontend dev server `ng serve` on :4200 proxying `/api` → gateway :8080.

## A. Backend / API legs (via gateway http://127.0.0.1:8080)

| # | Check | Expected | Result |
|---|---|---|---|
| A1 | `GET /api/v1/territories/metadata` | 200, JSON array, no geometry | **200** ✓ |
| A2 | `GET /api/v1/territories/colors` | 200 (unchanged) | **200** ✓ |
| A3 | `GET /api/v1/territories` | 200 (unchanged) | **200** ✓ |
| A4 | `GET /api/v1/territories/all/geojson` | **404, no territory data** | **404** ✓ — after fix (session `ses_f28c76feaffemSjXRR6eRnKzMB`): `NoResourceFoundException` dedicated handler in shared `GlobalExceptionHandler`; body `{"detail":"Recurso no encontrado","status":404,...errors/not-found}` with no territory data; verified live post-restart (earlier run showed 500 — root cause in change note on task 6.1) |
| A5 | `GET /api/v1/territories/{n}/geojson` | 200, features carry `fid` + `id` | **200** ✓ — feature properties include `"id":"1-1.a"` and `"fid":705` |

## B. Frontend legs (browser, /map on :4200)

Browser: authenticated as local encargado (`56936577203`), geolocation emulated at `-37.4340,-73.3570` (CDP), later moved to `-37.43270,-73.35530` (~170 m). Watch lifecycle instrumented in-page (`watchPosition`/`clearWatch` counters) plus MapLibre camera-event hooks (`dragstart/zoomstart/rotatestart/pitchstart/movestart`, with `originalEvent` flag).

| # | Check | Expected | Result |
|---|---|---|---|
| B1 | Network: load `/map` | **zero requests** to `/all/geojson`; metadata + tiles used instead | **PASS** ✓ — `performance.getEntriesByType('resource')` over the whole session: `all/geojson` = **0**; `GET /metadata` = 1 × 200; `tiles.json`/`colors`/MVT `.pbf` used; 50 × on-demand `GET /territories/{n}/geojson` healing fetches for territories with report data (designed chunk-C path, none for report-less ones) |
| B2 | Labels / counts / marks | territory labels render; report counts present; marks restored/highlight intact (fid bridge via per-territory geojson) | **PASS** ✓ — screenshot: numbered symbol-layer labels + data-driven fills render; search → "Territorio 1" selects → sidebar shows count **`0/25`**, MARCAR/TRAZAR, Enviar disabled at zero marks; selection highlights the polygon |
| B3 | GPS follow: activate | map centers on position, active indicator shown | **PASS** ✓ — activate → `watchPosition` id opened (counter open:1), first fix eased to position (`movestart/moveend` `user:false`, zoom unchanged — center-only ease), panel "Siguiendo tu ubicación" (template contract ⇔ state `active`), position marker rendered |
| B4 | GPS follow: manual pan | releases lock → paused, re-center action appears; re-center resumes | **PASS** ✓ — canvas drag → state `paused`, panel "Seguimiento en pausa" + **Recentrar** + **Limpiar ruta**; "Recentrar" click → state `active` + programmatic ease back to position (`movestart` `user:false`). Real-user camera events (`originalEvent`, zoom 15.48→13.6) observed during the run and also produced pause — manual takeover works for human input too (the "spontaneous pauses" seen earlier in the session were this, not a defect: no programmatic zoom/pitch/rotate events fired between fixes) |
| B5 | GPS follow: deactivate / route exit | indicator gone, `clearWatch` (watch released) | **PASS** ✓ — deactivate (from `active` **and** from `paused`) → `clearWatch` fired (counter `open:3/clear:3`, balanced), `MapLocationService`: `status=idle`, `consumers.size=0`, `watchId=null`, legacy button back to "Mi ubicación"/inactive, follow toggle `aria-pressed=false`, panel removed. Ref-count audit: every activate/deactivate pair balanced across 5 cycles; the one "stuck" episode earlier was traced to a failed devtools click dispatching onto the legacy toggle (extra consumer held = expected ref-count semantics), not a leak |
| B6 | Permission denied path | actionable Spanish message, map remains usable | **PASS** ✓ — `watchPosition` patched to invoke the error callback with `code:1` (PERMISSION_DENIED): `errorSignal='denied'`, panel **"Permiso de ubicación denegado — activalo en los ajustes del navegador"**, state → `off`, `consumers=0`, `watchId=null`, `clearWatch` called (even for the fake watch id), toggle `aria-pressed=false`; map panning/zoom still works; patch restored after. Also observed live: a geolocation **timeout** (8 s) after an override change → same contract: Spanish message ("No se pudo obtener tu ubicación"), state `off`, `clearWatch` balanced — no stuck state |

Additional legs exercised beyond the table:

- **Trail contract**: activate → position moved ~170 m → new fix recorded (`trail 1→2`, 5 m filter passed), ease followed the fix; **Limpiar ruta** enabled → click → `trail 0`, `hasTrail=false`, button disabled.
- **Route exit**: covered by spec (`map.spec.ts` fixture.destroy → `clearWatch(42)`); smoke ran deactivate path live instead.

## C. Notes

- CWV gate (7.1) passed on rerun; first run failed under host CPU load (single-sample variance) — recorded as risk in tasks.md 7.1 note.
- `/actuator/health` on gateway :8080 is 404 (management lives on :8090) — pre-existing, unrelated.
- Tiles fetched with `?v=2` after the first write/version bump — `TileVersionService` cache-busting works live.
- A real user interacted with the visible browser window during parts of the run (`originalEvent` camera events mid-wait); their pans correctly paused follow — treated as extra evidence for B4, not noise.
- `tiles.json` polled 21× over the session (version polling) — normal, no action.
