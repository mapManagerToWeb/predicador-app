# ADR 0007: Desktop admin panel (analytics, territory editor, encargado credentials)

## Status

Accepted

## Context

The old `/admin` page only assigned territory colors. The territory servant
needs, from a desktop, to (1) see coverage and activity, (2) edit manzanas and
territories without external GIS tools and SQL, and (3) manage encargados and
how they sign in. Reviewing the system surfaced gaps:

- Encargados sign in with their phone number only, and the self-registration
  endpoint (`buscar-crear`) logs anyone in by first + last name and even
  overwrites the stored phone.
- Reports carry no duration (`session_time` is the send time), so time per
  manzana cannot be measured.
- Manzana ids have no sequence; derived MapLibre tables (`territorio_disuelto`,
  `manzana_s2_cover`, `app_meta`) come from an unpushed territory `V3`.
- There are duplicated reports (double sends) and duplicated encargados.

## Decision

- **Admin APIs** under `/api/v1/{territories,reports,encargados}/admin/**`,
  admin role enforced by `SecurityRules` in the gateway and in each service
  (listed first because the first matching rule wins).
- **Analytics in the browser** from compact report rows
  (`GET /reports/admin`): volumes are small (thousands of rows per year), so
  pure, unit-tested functions (`utils/analytics.ts`) give instant filtering
  without new aggregate endpoints. Double sends are ignored by the analytics.
- **Coverage** is based on the last *completion* of each territory:
  ≤ 120 days "al día", ≤ 365 "pendiente", older "atrasado", never "sin
  registro". A per-territory register equivalent to the S-13 is derived from
  the reports.
- **Session time**: the map records when the first manzana of an outing is
  marked (`inicioSesion`, persisted across reloads) and sends it with each
  report; reporting V6 stores it, discarding implausible values (> 12 h or
  after the send).
- **Territory editor** on MapLibre + terra-draw (the map feature is moving to
  MapLibre; Leaflet stays for the field map until then). Geometry validation
  and transformation run in PostGIS; edits refresh `territorio_disuelto`
  (same `ST_Multi(ST_Union(...))` as the original), drop stale S2 cover rows,
  set `s2_backfill_done = 0` and bump `data_version` when those tables exist.
  Current fallback colors are frozen before each edit so renumbering does not
  repaint other territories. New ids are `max(id, ids cited in reports) + 1`
  under a table lock until a sequence can be added (blocked by the missing V3
  file).
- **Credentials**: optional per-encargado 6-digit PIN (BCrypt), shown once;
  5 failures lock for 15 minutes. Login returns a stable `code`
  (`pin_requerido`, `pin_incorrecto`, `pin_bloqueado`, `inactivo`, …) so the
  app can ask for the PIN. Self-registration can be closed from the panel,
  and it never logs in (nor changes the phone of) an encargado with a PIN or
  a deactivated one. Duplicates can be merged (reports move to the survivor).
- **Charts** are small SVG/HTML components following the data-viz guidance
  (single hue for magnitude, status colors always with a text label, hover and
  focus tooltips); no chart library.

## Consequences

- Field users are unaffected until the administrator assigns PINs; the rollout
  is gradual.
- The admin chunk and MapLibre (~236 kB gzip) load only when `/admin` opens;
  signal inputs/queries add ~4 kB gzip to the initial bundle.
- Daniel's S2 backfill must regenerate cover rows when `s2_backfill_done = 0`.
- Once the territory V3 migration is in the repo, replace the id calculation
  with a sequence (new migration).
