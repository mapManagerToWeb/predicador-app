# ADR 0014: The admin corrects or annuls the report of an outing

## Status

Accepted

## Context

"Corregir un territorio" (ADR 0011) fixes a territory's current state by adding
a `correccion` report, but the S-13 and the summary are derived from the
outings: when an encargado wrongly completed a territory, the S-13 kept that
completion date (a correction only counts when it completes a territory) and
the analytics kept counting it. Deleting the report loses the history, and a
later report of the same territory still carries the wrong marks, because each
report stores the cumulative state (ADR 0013).

## Decision

- From the admin "Reportes" list, **Corregir** opens an outing on a map: what
  was already there before the outing is grey and locked; what the outing
  marked can be removed (or added). **Anular el reporte entero** removes it
  all. Only outings (`origen = salida`) that are not annulled can be corrected.
- Nothing is deleted (V8): the original gets `anulado_en` and a note; a
  corrected report (same encargado and date, `reemplaza_a` = original id) is
  saved in its place, with the state computed by the server sum (ADR 0013).
- The territory's later reports carry the error in their cumulative state:
  `CorreccionDeSalidas` recomputes them in order, adding what each one
  contributed over its original predecessor (`SumaDeSalidas.aporteEntre`) to
  the new state. A later admin correction or cycle restart fixed the state by
  hand, so recomputing stops there.
- Annulled reports are ignored everywhere the state or the history is derived:
  last-report queries, public state, cycle close, per-encargado counts, and in
  the panel `AdminStore.reportes` (S-13, summary, coverage). The Reportes list
  (`AdminStore.todosLosReportes`) still shows them, struck through.

## Consequences

- An encargado's mistake can be undone after other brothers reported the same
  territory, and the S-13 and summary follow automatically.
- Later outings' own contributions are preserved; only their cumulative state
  (manzanasIds, zones, estado) is rewritten.
- If a street strip was wrongly added and a later outing added more streets to
  the same block, the stored strip may still cover the removed street until the
  block is edited again (the sides list is correct).
