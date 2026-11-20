# ADR 0022: Training mode — real sends that are deleted afterwards

## Status

Accepted

## Context

The brothers are trained online with the official app. They need to try the
real thing: mark any territory, send, receive the WhatsApp, and see it on the
public viewer. The practice mode (`/practice`) sends nothing and its marks
stay on each phone, so the viewer cannot show them. Asking everyone to use
only one test territory does not work: one mistake marks a real territory.
Test sends must not end up in the official records (S-13, territory state).

## Decision

- **The admin starts and ends a training session in the panel** (Resumen →
  «Capacitación»). While it runs, everything works as usual: reports, the
  WhatsApp and the viewer. The field map and the viewer show «Capacitación en
  curso: lo que envíes es de prueba y se borrará al terminar».
- **Tests are recognised by id, not by date.** Starting stores the highest
  report id that already existed (`app_config.capacitacion = desde|ultimoReporte`,
  no migration). Every report with a higher id is a test. `fecha` is not used
  because it can come from the phone.
- **Ending deletes all of them** after the admin sees the list and types
  BORRAR. Reports are cumulative (ADR 0013), so deleting everything saved
  after the start puts every territory back exactly as it was; deleting only
  some would leave their marks inside later reports.
- **While it runs, the earlier history cannot change.** Closing a cycle,
  moving its start and correcting reports from before are refused (409): they
  modify existing rows, which the delete would not undo. Corrections of test
  reports, admin territory corrections and «Registrar salida» are allowed and
  are tests too.

## Consequences

- A real outing reported during the session is deleted with the tests. The
  notice warns the brothers, and the panel lists every test (territory,
  brother, time) before deleting so the admin can register a real one again.
- A test sent after the session ended counts as real and is deleted by hand
  in Reportes, as before.
- WhatsApp delivery records and new brother profiles are kept: they are not
  part of a territory's state.
- This is an exception to ADR 0011 («reports are never deleted to change a
  territory's state»): these reports were never official.
