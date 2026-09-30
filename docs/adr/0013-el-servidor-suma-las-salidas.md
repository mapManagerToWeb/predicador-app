# ADR 0013: The server adds each outing to the territory's state

## Status

Accepted

## Context

The state of a territory is its last report, cumulative within the current
round (ADR 0011). Until now each phone built that whole state (the last report
it knew plus what the encargado marked) and sent it; the last phone to send
overwrote the others. A phone could hold an old copy of the last report:

- the app kept the last report of each territory in memory (`versionsSeen`)
  and in `localStorage` (`ReportCacheService`) and did not ask again while the
  app stayed open;
- a draft kept the base it had when the territory was opened, even for days.

Verified with two phones: B reported block 72.a; A reopened territory 72, still
saw it empty, and A's report would have erased 72.a from the state. After a
cycle close, an old draft could also bring back the previous round's marks.
The map also chose the last report by the phone's clock (`sessionTime`), while
the viewer and the admin panel use the server's date.

## Decision

- **The server adds the outing to the current state** (`ReportService` +
  `SumaDeSalidas`, reporting-service). For each report it takes the
  territory's last report (by server date, then id) and, unless that report
  completed or restarted the territory, joins it with what the phone sent:
  whole blocks by union (old numeric block ids are mapped to "territory-block"
  with the `manzanas_territorio` catalog, read-only from the shared database —
  `CatalogoManzanas`), streets by union of sides per block (a whole block keeps
  no streets; a block whose sides are all marked becomes whole — zones now
  carry `t`, the block's number of sides). The server decides `estado`
  (completed when every block of the territory is whole), `fecha` and
  `sessionTime` (its own clock); the phone's values for those are ignored.
  Sends to the same territory are serialized with a transaction-scoped
  advisory lock. Adding is idempotent, so phones running an older version
  (which send the whole state) are also added correctly.
- **The map's base comes from the public state** (`GET /reports/public/estado`,
  the same the viewer uses, now with `puntosParciales`). It is fetched again when
  a territory is opened (if older than 15 s) and always right before sending;
  what the encargado marked is put on top of the fresh base (`rebasar`), also
  when a draft is restored. The report cache (`versionsSeen`,
  `ReportCacheService`, `getReportesPorTerritorio`) is removed.
- **The WhatsApp message is built from what the server saved**: a territory can
  end up completed with another brother's marks.

## Consequences

- Two brothers in the same territory, an old draft or a closed cycle no longer
  lose or resurrect marks; the phone's clock no longer matters.
- reporting-service reads territory-service's `manzanas_territorio` table
  (shared database, read-only). If it cannot be read, the sum uses the total
  sent by the app.
- Deploy order does not matter: the new app works with the old server (it
  still sends the whole state, rebased on the fresh public state), and the new
  server accepts old apps. Deploying the backend first is still preferable.
- When two strips of the same block come from different phones, the stored
  zone is a MultiPolygon of both until someone edits that block again.
