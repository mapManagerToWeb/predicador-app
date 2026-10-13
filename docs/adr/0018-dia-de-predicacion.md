# ADR 0018: The encargado chooses the day and shift of the outing when sending

## Status

Accepted

## Context

A report was dated when it was sent. Brothers often forget and send the next
day, so the S-13 and the panel showed the wrong day. The shift (mañana/tarde)
was only part of the WhatsApp message and was never stored.

## Decision

- The send confirmation asks "¿Cuándo predicaron?": **Hoy** (preselected),
  **Ayer** or **Otro día** (up to 7 days back), plus Mañana/Tarde. The shift
  toggle moved from the bottom panel into this dialog (one place, more map).
- Reports store `fecha_predicacion` (DATE) and `turno` (V9). `fecha` stays the
  server send time and **still orders the reports**: a territory's state is its
  last sent report (ADR 0013); back-dating `fecha` would reorder the sums.
- The server validates the day in Chile's time zone (`DiaDePredicacion`): not
  in the future, at most 7 days back for encargados; the admin can set any
  past day from "Corregir un reporte". Old apps send no day: today is used.
- What is shown uses the preaching day: the WhatsApp message, the S-13
  (assigned/completed dates), the panel analytics and list (`fechaDeTrabajo`),
  and the public state (`ultimoTrabajo`/`ultimoCompletado`). The list also
  shows "enviado el…" when the send day differs.

## Consequences

- Reports before V9 have no day/shift: the day of `fecha` is used.
- The phone's local date is sent; the server tolerates one day ahead (clock or
  zone differences) and stores it as today.
