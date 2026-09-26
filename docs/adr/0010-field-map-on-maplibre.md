# ADR 0010: Field map on MapLibre with a tap-to-toggle flow

## Status

Accepted. Supersedes ADR 0001 (pin Leaflet 1.9.4) and ADR 0002 (Leaflet
canvas rendering and spatial hit-testing).

## Context

The encargados' map was Leaflet 1.9 with ~25 services (engine, tile layer,
territory layer, spatial index, selection, interaction, capture, restoration,
…). Walking through the real flow on a phone showed problems that came from
its mode state machine (none / marcar / parcial), not from single bugs:

- A tap on a manzana without pressing "Marcar" closed the territory and
  cleared every mark in progress (and the draft). "Cancelar" in marking mode
  and clearing the search box did the same.
- Unmarking required leaving "Marcar" mode first; a second tap did nothing.
- With location on, every GPS fix pulled the map back when the user had
  panned away.
- Territory labels were placed at the bounding-box centre, so a territory
  that wraps around another (72 around 71) showed its number inside the
  neighbour (also in the viewer and the admin panel). Labels overlapped.
- After a reload the panel could show "72 · 0/0" over the whole city.
- Rendering and panning were not smooth (CPU canvas), and the capture for
  WhatsApp needed its own canvas renderer.

The viewer and the admin panel were already on MapLibre (ADR 0007, 0009).

## Decision

- **MapLibre (WebGL) for the field map**, sharing `core/map/base-map.ts` with
  the viewer and the admin. Leaflet and `@turf/*` are removed.
- **Three pieces**:
  - `utils/salida.ts` — the outing as pure functions: open territories,
    whole manzanas, partial zones, the *base* (last report), changes, report
    rows and the WhatsApp payload. A territory whose last report completed it
    opens empty (new round).
  - `mapa.store.ts` — signals and rules: what a tap means, loading (with an
    offline copy), draft, questions, send.
  - `mapa-vista.ts` — MapLibre only: sources/layers, feature-state per
    manzana (marking does not re-upload geometry), taps
    (`queryRenderedFeatures`, nearest manzana within 30 px), street editor,
    capture (`preserveDrawingBuffer`, other territories filtered out, location
    dot hidden).
- **Flow**: first tap opens the territory; in an open territory a tap marks
  and a second tap unmarks ("Manzana entera") or opens its streets ("Por
  calles", ADR 0008). A tap on another territory asks before adding it.
  Nothing is discarded or sent without a question: closing a territory with
  unsent changes, logging out, and "Enviar" (shows a summary). "Enviar" is
  enabled only when something differs from the last report; only changed
  territories are sent. Morning/afternoon defaults from the clock.
- **Location** (`ubicacion.ts`, own implementation instead of
  `GeolocateControl`): any user gesture stops following (the dot keeps
  moving, the camera stays); the button recentres; opening a territory or a
  manzana also stops following.
- **Labels** at an interior point of the territory's manzana closest to its
  area centroid (`core/map/geometria.ts`), with symbol collision.
- **Overview** from `GET /reports/public/estado` (one request), instead of
  the per-territory versions/batch revalidation, which is removed from the
  frontend. Opening a territory still reads its last full report (sides of
  partial zones).
- **Draft** v2 (`utils/borrador.ts`) stores open territories with their base;
  drafts from the Leaflet version are converted (base fetched on open).
  `core/services/map-draft.ts` only stores JSON (fixes the core→feature
  dependency).
- **Tutorial**: guided tour over the real screen the first time, reopened
  with "?".

## Consequences

- Report format is unchanged (`manzanasIds` with "T-bloque" ids,
  `geometriaParcial`, `puntosParciales` v2), so the viewer, the admin panel and
  older reports keep working.
- The backend endpoints `/reports/versions` and `/reports/batch` are no longer
  used by the frontend.
- Field smoothness was verified only in a desktop browser with a phone
  viewport; it must be confirmed on real phones.
