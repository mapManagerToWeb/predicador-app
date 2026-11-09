# ADR 0021: The admin registers outings for brothers from the panel

## Status

Accepted

## Context

The congregation approved the app, but until the brothers are trained they
keep reporting by WhatsApp ("territory 72, three blocks", "territory 61
completed"). The admin must enter those reports so the map, the reports list
and the S-13 are right from the campaign start (Saturday 7 November 2026).

## Decision

- **«Registrar salida»** (`/admin/registrar`): brother, day, shift, territory,
  and on the map whole blocks or single streets (the same street geometry as
  the field app, now in `core/map/lados.ts`). Only what is new in that outing
  is sent; the server sums it to the territory's state exactly like an app
  report (ADR 0013). It is stored as a `salida` in the brother's name, so the
  S-13 and the analytics treat it as his.
- **No account is needed.** The report keeps the typed name. If it matches an
  encargado (name + surname), his id is linked, so his history is one when he
  starts using the app. `nota` starts with «Registrado desde el panel» to tell
  these apart.
- **Any non-future day** is allowed (the app's 7-day limit does not apply).
  `fecha` stays the time it was entered and keeps ordering the reports.
- **One WhatsApp per registered outing**, to the admin's number set in the
  panel (`app_config.whatsapp_administrador`); without it, `WHATSAPP_DESTINATION`.
  Incomplete territories carry an image of the panel map.
- **A cycle can be closed from an earlier day** (`desde`): the new cycle and
  the S-13 start that day. Reset reports are still saved now (ordering
  unchanged) with `fecha_predicacion = desde`. If any report was sent since
  that day the close is refused: it would land before the reset and be lost
  from the new cycle.

## Consequences

- Close the campaign cycle (from 7 November) **before** registering the
  outings of those days.
- A brother typed with a slightly different name (e.g. without his second
  surname) counts as a different person in the S-13; the panel shows whether
  the name matched an encargado.
