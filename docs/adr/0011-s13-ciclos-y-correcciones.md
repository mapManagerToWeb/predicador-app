# ADR 0011: S-13 export, territory cycles and admin corrections

## Status

Accepted

## Context

The circuit overseer asks for the S-13-S form ("Registro de asignación de
territorio"): per territory, who it was assigned to, when, and when it was
completed, by service year (September–August), 20 territories per page and 4
assignments per row. The congregation also needs to (1) restart all
territories when every one has been completed, keeping a record of the
finished cycle, and (2) fix a manzana or street that an encargado marked by
mistake. The app has no "assignment": encargados report outings, and the
state of a territory is its last (cumulative) report.

## Decision

- **Nothing is deleted.** A cycle close and a correction add a report with
  the new state. `registro_predicacion.origen` (reporting V7) is `salida`
  (encargado, default, not settable by clients), `correccion` or `reinicio`
  (admin), with an optional `nota`. Everything that reads "the last report"
  (both maps, the viewer, the admin coverage) keeps working unchanged; a
  `reinicio` row has `estado = 'reiniciado'` and no manzanas.
- **Cycles** (`ciclo_territorios`, one open at a time via a partial unique
  index; V7 opens the first one at the first report). `POST
  /reports/admin/ciclos/cerrar` stores a JSON summary per territory (state,
  completion dates, first/last outing, encargados), adds a `reinicio` report
  to every territory whose last report is not already one, and opens a new
  cycle, in one transaction.
- **Corrections**: `GET /reports/admin/estado/{n}` returns the current state;
  `POST /reports/admin/correccion` stores the new one (marked manzanas as
  "T-nombre", partial zones in the ADR 0008 format).
- **S-13 derivation** (frontend, `utils/s13.ts`, pure): an assignment starts
  with an encargado's first outing in the territory's round and continues
  while the same encargado reports; if another one continues, a new
  assignment starts (the previous one stays without a completion date, as on
  paper); it ends with the report that completes the territory (a correction
  that completes it also counts); a `reinicio` closes it uncompleted. Double
  sends are ignored. The assignment date is the outing's `inicioSesion`.
- **Word output** built in the browser (`utils/s13-docx.ts`): hand-written
  WordprocessingML with the official layout (A4, measurements taken from the
  congregation's form), zipped with `fflate`; fixed row heights so 20
  territories fit on one page. Territories with more than 4 assignments
  continue on another page whose "última fecha en que se completó" is the one
  before those assignments.
- **Admin analytics** (ranking, times, activity) use only `salida` rows
  (`AdminStore.salidas`); coverage and the round history use all rows.

## Consequences

- The S-13 is only as good as the reports: an assignment is inferred from
  who reported, not declared.
- "Año de servicio N" follows the official convention (Sept N-1 – Aug N); the
  selector shows the months to avoid confusion.
- `utils/correccion.ts` imports the zone format from
  `features/map/utils/lados.ts` (feature→feature), like `TERRITORY_COLORS`.
