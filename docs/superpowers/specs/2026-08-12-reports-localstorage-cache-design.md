# Reports localStorage Cache + Offline Queue — Design Specification

**Date**: 2026-08-12
**Project**: Predicador (frontend Angular + backend Spring Boot reporting-service)
**Branch**: `perf/reports-latest-per-territory`
**Status**: Approved for implementation — iteración 1 (render instantáneo + borrador; cola offline diferida)

---

## 1. Summary

Hoy el mapa carga reportes del backend en cada sesión aunque no haya cambios: el
frontend consulta `/reports/batch` por todos los territorios visibles y solo lo
cachea en memoria con TTL de 5 min. Este diseño persiste el **último reporte por
territorio marcado** en `localStorage`, revalida qué territorios **cambiaron** con
una consulta ligera de versiones (`GET /reports/versions`) y solo descarga los
reportes de esos territorios. Añade además un **borrador local de marcas sin
guardar** en `localStorage`: si el encargado marca polígonos y cierra sin enviar,
al volver recupera esas marcas sin necesidad de red. La **cola offline de
WhatsApp** (guardar marcas + screenshot + petición cuando no hay conexión y
reenviar al reconectar) es la **iteración 2** y queda fuera de este alcance.

---

## 2. Goals & Non-Goals

### Goals (iteración 1)
- No repetir la consulta de reportes al backend cuando no hay cambios.
- Al iniciar, pintar el mapa **instantáneamente** desde `localStorage` y revalidar
  en segundo plano solo los territorios cuyo reporte cambió.
- Cargar **solo reportes con marcas** (territorios sin reporte o con reporte vacío
  no se pintan ni se consultan).
- Cuando un encargado marca y guarda, refrescar **solo ese territorio**.
- **Borrador local**: si el encargado marca y cierra sin guardar, al volver se
  restauran sus marcas (polígonos completos + parciales) desde `localStorage`.
- Limpiar el cache y el borrador al hacer logout.

### Non-Goals (iteración 1)
- **No** se implementa la cola offline (packs de pendientes, reenvío WhatsApp al
  reconectar, badge, IndexedDB para screenshots) — iteración 2.
- No cambia el motor de mapa ni la lógica de marcado parcial/completo.
- No agrega listados históricos de reportes en el frontend.
- No introduce sincronización multi-dispositivo (cache y borrador son por navegador).
- No cambia el formato de imagen soportado por WhatsApp.

---

## 3. Current State (investigated)

- **Frontend cache** `TerritorioService.reportCache` (`core/services/territorio.ts`):
  `Map<number, {reportes, expiresAt}>` en memoria, TTL 5 min.
- `MapInitializationService.restoreAllMarks()` (map-initialization.service.ts) consulta
  `getReportesPorTerritorios(territorios)` → `GET /reports/batch?territorios=...`,
  paginado en chunks de 50 (límite backend `MAX_BATCH_SIZE=100`).
- `MapMarkRestorationService.restaurarConReportes` pinta con **el último** reporte
  por territorio (`elegirUltimoReporte` en `utils/report-utils.ts`).
- Al guardar, `MapDataPersistenceService.guardarEnBaseDeDatos()` / `guardarYEnviar()`
  invalidan la caché solo de los territorios editados y re-restauran desde DB
  (`invalidateReportCache` + `restaurarMarcadoDesdeDB` → re-fetch completo).
- El estado de marcado en sesión vive en `MapStateService` (`manzanasById`,
  `datosParcialesGuardados`, `territoriosSeleccionados`, `modoMarcado`,
  `predicacion`) y se pierde al salir sin guardar.
- **`ManzanaMarcada` es datos puros** (id, nombreBloque, color, territorioNumero);
  la geometría se resuelve por id vía `MapLayerRegistry`. Serializable a JSON.
- `ReportCacheService` / `PendingReportsQueueService` (`core/services/report-cache.ts`,
  `pending-reports-queue.ts`) existen como archivos **nuevos sin commitear y sin
  cablear** (cero callers, sin specs). `PendingReportsQueueService.flush()` tiene un
  bug (dos `.map()` consecutivos que se pisan) — fuera de este alcance, se documenta
  para iteración 2.
- **WhatsApp**: `WhatsAppService.sendReport` genera `crypto.randomUUID()` por
  llamada, POST `Idempotency-Key` → estado `IN_PROGRESS` → polling cada 2 s (60 s
  máx). Backend persiste entrega en `whatsapp_delivery` con lease de 5 min y envía
  por executor o cola RabbitMQ. **Sin cambios en esta iteración.**
- Backend `ReportRepository` ya tiene `findVersions` **sin commitear** (query JPA
  con predicate redundante `r.manzanasIds IS NOT NULL AND (r.manzanasIds ...)`),
  pero **no hay** `ReportService.getReportVersions` ni endpoint `/versions`
  (solo existe un `.bak` con el endpoint a medio escribir).
- Logout (`profile.ts` / `admin.ts`) limpia solo el perfil, no los reportes ni marcas.

---

## 4. Design

### 4.1 Backend — Endpoint de versiones por territorio

Nuevo endpoint **`GET /api/v1/reports/versions?territorios=1,2,3`**:

- Devuelve `Map<Long, Long>`: `territorioNumero → version`.
- `version` = **`id` del último reporte no vacío** de ese territorio, con la misma
  ordenación que `/reports/batch` (`DISTINCT ON (territorio_numero) ... ORDER BY
  territorio_numero, fecha DESC NULLS LAST, id DESC`). Coincide exactamente con el
  reporte que el mapa usa para pintar, por lo que el frontend solo re-descarga
  cuando ese reporte cambia. "No vacío" = `manzanas_ids` presente/`manzana_id` no
  nulo **o** `geometria_parcial` no nulo.
- Es un valor numérico monotónico (los reportes solo se insertan, nunca se editan),
  así que cualquier alta o cambio de ordenamiento implica un `version` distinto;
  una comparación de `id` basta y evita parsear fechas.
- Si el territorio no tiene ningún reporte (o todos vacíos) **no aparece** en el map.
- Respuesta vacía `{}` si ningún territorio tiene reporte con marcas → frontend no
  pinta nada.
- Mismo control de tamaño que `/batch` (`MAX_BATCH_SIZE=100` → 400 si excede).
- Auth: `requireAuthenticated` (igual que `/batch`).

**Repository** (reporting-service `/repository/ReportRepository.java`):

```sql
SELECT DISTINCT ON (territorio_numero) territorio_numero, id
FROM registro_predicacion
WHERE territorio_numero IN (:territorioNumeros)
  AND (manzanas_ids IS NOT NULL AND manzanas_ids <> ''
       OR manzana_id IS NOT NULL
       OR geometria_parcial IS NOT NULL)
ORDER BY territorio_numero, fecha DESC NULLS LAST, id DESC
```

> Reutiliza el índice `idx_registro_predicacion_territorio_fecha` (V4) y evita
> tocar `session_time` (String ISO-8601, no es `TIMESTAMP` en Postgres).

### 4.2 Frontend — `ReportCacheService` (nuevo, `core/services/report-cache.ts`)

Persistencia en `localStorage` (key `predicador_reports_cache`):

```ts
interface ReportCacheEntry {
  report: Reporte;        // último reporte con marcas del territorio
  version: number;        // = report.id (versión del backend, compara con /versions)
}
// Storage shape: Record<number, ReportCacheEntry> + metadata { schema, savedAt }
```

API:
- `getCache(): Map<number, Reporte>` — snapshot para pintar el mapa.
- `setTerritorio(num, reporte)` — la `version` se deriva de `reporte.id` (id = versión
  monotónica del backend); la API interna puede aceptarla explícita.
- `setTerritorios(Map<number, Reporte>)`.
- `removeTerritorios(nums)` / `clear()`.
- `hasData(): boolean`.
- SSR guard (`typeof localStorage === 'undefined'` → operaciones no-op), parseo con
  `try/catch`, validación de shape, descarte de cache corrupto (como `Profile`).

### 4.3 Frontend — `TerritorioService` modificado

Reemplaza la caché en memoria por **dos capas**:

1. `localStorage` (persistente, via `ReportCacheService`) — fuente del render rápido.
2. `versionsSeen: Map<number, number>` en memoria — solo para evitar re-validar el
   mismo territorio dos veces dentro de la misma sesión.

**`getReportesPorTerritorios(nums)`**:
1. **Fase rápida:** construye el resultado con `ReportCacheService.getCache()` para
   los territorios con marcas → el mapa se pinta instantáneo.
2. **Fase revalidación (fondo):** `GET /versions` para `nums` (paginado en chunks de
   50). Para cada territorio cuya `version` (id del último reporte marcado en backend)
   difiere de la cacheada (o que no está en cache):
   - descarga su reporte vía `/reports/batch` (solo esos números),
   - actualiza `ReportCacheService` y `versionsSeen`.
   Los territorios **sin** versión en backend (no existe reporte marcado) y **sin**
   entrada en cache se **saltan** (no se pintan ni se consultan).
3. El resultado final se expone como `Map<number, Reporte[]>` (1 elemento por
   territorio con marcas) para no romper la firma actual.
4. Si `/versions` falla (offline/backend caído) → no bloquea; el mapa ya pintó del
   cache. Sin reintento en bucle.

**`crearReportes(registros)`**: cambia retorno de `void` a `Reporte[]` (respuesta del
backend, ids asignados). `guardarEnBaseDeDatos` / `guardarYEnviar` la usan para
`ReportCacheService.setTerritorio` y limpiar el draft de los territorios guardados.

**`getReportesPorTerritorio(num)` (singular)**: se usa en la restauración bajo
demanda (al seleccionar un territorio nuevo o en `moveend`). Si el territorio tiene
entrada en cache y su `version` coincide con `versionsSeen`, devuelve la cache; si
no, consulta `GET /reports?territorioNumero=...` y actualiza cache/`versionsSeen`.

**Eliminados**: `invalidateReportCache(num)` / `invalidateAll()` (ya no hay TTL en
memoria). `reloadAllTerritories` pasa a `ReportCacheService.clear()`.

**`logout()`**: expuesto en `TerritorioService` → `ReportCacheService.clear()` +
`DraftMarksService.clear()`. Se engancha en el logout de `ProfilePage` y `admin.ts`.

### 4.4 Borrador local de marcas — `DraftMarksService` (nuevo, `core/services/map-draft.ts`)

Persistencia en `localStorage` (key `predicador_map_draft`):

```ts
interface MapDraft {
  manzanasById: Record<string, ManzanaMarcada>;       // datos puros, serializable
  territoriosSeleccionados: number[];
  territorioSeleccionado: number | null;
  datosParcialesGuardados: Record<number, { puntos: SnappedPoint[]; geometria: string }>;
  modoMarcado: ModoMarcado;
  predicacion: string;
  savedAt: number;
}
```

Reglas:
- **Guardado**: `effect` en `MapStateService` con **debounce ~400 ms** ante cambios en
  `manzanasById`, `territoriosSeleccionados`, `modoMarcado`, `predicacion`,
  `datosParcialesGuardados`. Guard de plataforma SSR (`typeof localStorage`).
- **Restaura**: al inicializar el mapa, si existe draft → pintar esas marcas (resolve
  de geometría por id) y setear `territoriosSeleccionados`. Si no hay draft → pintar
  desde el report-cache.
- **Prioridad**: territorio con draft → manda el draft (es lo más reciente); sin draft
  → report-cache. La revalidación por `/versions` aplica **solo** a territorios sin
  draft (el draft se marca como "visto" para no pisarlo).
- **Limpieza**: tras `guardarEnBaseDeDatos` / `guardarYEnviar` exitosos (borrar solo
  los territorios guardados), tras `limpiarMarcas`, y en `logout()`.
- SSR: operaciones no-op fuera de navegador; parseo con `try/catch` y descarte de
  cache corrupto.

### 4.5 Flujo `guardarEnBaseDeDatos` / `guardarYEnviar` (map-data-persistence.service.ts)

- Reemplaza `invalidateReportCache(num)` + `restaurarMarcadoDesdeDB` (re-fetch) por:
  usar la respuesta de `crearReportes` → `ReportCacheService.setTerritorio` y
  `DraftMarksService.remove(territoriosGuardados)`.
- `restaurarMarcadoDesdeDB` se conserva únicamente donde se necesita re-pintar estado
  de marcado en sesión (se evalúa caso por caso en el plan).
- Si falla el POST → no toca cache ni draft.

> La iteración 2 (cola offline) reutilizará este mismo flujo con precaptura de
> screenshot, retries y reenvío al reconectar — documentado, fuera de este alcance.

### 4.6 UI — Sin badge en iteración 1

- El badge de pendientes, toast de reconexión y validación predictiva de `telefono`
  pertenecen a la cola offline (iteración 2).
- En esta iteración el flujo de guardado mantiene los toasts actuales de
  éxito/error; la única diferencia es que al guardar se escribe el cache y se limpia
  el draft en lugar de re-consultar.

### 4.7 WhatsApp — sin cambios en iteración 1

- El flujo WhatsApp existente (`WhatsAppService.sendReport`, polling 60 s, destino
  `perfil.telefono`) no se toca. Las verificaciones de calidad/scale del screenshot,
  timeout vs lease y el camino doble executor/cola se difieren a iteración 2.

> La carpeta `predicador-frontend/AGENTS.md` tiene la guía y gotchas de este
> frontend; seguir sus convenciones (Vitest, Señales, SSR guards).

---

## 5. Data & Storage

- `localStorage['predicador_reports_cache']` — cache persistente de últimos reportes.
- `localStorage['predicador_map_draft']` — borrador local de marcas sin guardar.
- Backend: sin cambios de schema. Nuevo endpoint `GET /reports/versions` sobre la
  tabla existente `registro_predicacion`. (*Fuera de esta iteración:* cola offline
  `predicador_pending_reports` e IndexedDB `predicador-offline` para screenshots.)

---

## 6. Files Changed (mapped)

### Backend (`backend/reporting-service/`)
- `src/main/java/com/predicador/reporting/controller/ReportController.java` — `GET /versions`.
- `src/main/java/com/predicador/reporting/service/ReportService.java` — `getReportVersions(...)`.
- `src/main/java/com/predicador/reporting/repository/ReportRepository.java` — limpiar
  query `findVersions` (predicate redundante) y respetar último por territorio.
- Eliminar `controller/ReportController.java.bak` (basura, endpoint a medio escribir).
- Tests: `ReportRepositoryIntegrationTest`, `ReportServiceTest`, controller spec existente.

### Frontend (`predicador-frontend/src/app/`)
- `core/services/report-cache.ts` — **nuevo** (ya existe sin commitear): limpiar
  detalles (quitar `effect()` del constructor), `getCache()`/`setTerritorio` como
  fuente de verdad.
- `core/services/map-draft.ts` — **nuevo** (`DraftMarksService`, borrador de marcas).
- `core/services/territorio.ts` — cache 2 capas + `/versions` + `logout()`.
- `core/services/territorio.spec.ts` — extender.
- `core/services/profile.ts` / `features/profile/profile.ts` / `features/admin/admin.ts` —
  hook de logout (limpiar cache + draft).
- `features/map/services/map-data-persistence.service.ts` — escribir cache + limpiar
  draft al guardar (reemplaza `invalidateReportCache` + re-fetch).
- `features/map/map-initialization.service.ts` — restaurar draft al arrancar.
- Tests: `report-cache.service.spec.ts`, `map-draft.service.spec.ts`,
  extensiones de `territorio.spec.ts` y `map-data-persistence.service.spec.ts`.
- (*No tocado en esta iteración:* `pending-reports-queue.ts` queda sin cablear;
  documenta su bug de `flush()` para iteración 2.)

---

## 7. Testing

### Frontend (Vitest, ver `predicador-frontend/AGENTS.md`)
- `report-cache.service.spec.ts`: set/get/remove/clear, SSR guard, parseo corrupto,
  límite de storage.
- `territorio.service.spec.ts`: fase rápida desde cache sin red; revalidación **solo**
  de territorios cuyo version cambió; territorio sin marca → no se consulta; fallo de
  `/versions` → usa cache; chunking 50.
- `map-draft.service.spec.ts`: guarda con debounce, restaura, prioridad sobre cache,
  limpia tras guardar/logout, SSR guard.
- `map-data-persistence.service.spec.ts`: guardado escribe cache y limpia draft;
  fallo del POST → no toca cache ni draft.

### Backend (JUnit + Testcontainers, ver AGENTS.md raíz)
- `ReportRepository`: versions solo territorios con reporte NO vacío; version =
  id del último reporte por `fecha DESC NULLS LAST, id DESC`; territorios sin
  reporte (o con reporte vacío) no aparecen.
- `ReportService`/controller: `/versions` auth requerida; >100 → 400; shape del Map.

---

## 8. Open Questions / Decisions flagged

- **Re-pintado tras guardar**: con cache-first, `restaurarMarcadoDesdeDB` solo se
  conserva donde hace falta re-pintar estado de sesión; se decide caso por caso en el
  plan de implementación.
- **Interacción draft ↔ report-cache**: territorio con draft no se pisa por la
  revalidación `/versions`; el draft se trata como "visto" en la sesión actual.
- (*Diferido a iteración 2:* umbral de localStorage para screenshot, timeout de
  polling WhatsApp, camino doble executor/cola.)

---

## 9. Risks

- **Tamaño/localStorage (~5 MB)**: en esta iteración solo se guardan reportes con
  marcas (sin screenshots) y el borrador (datos puros); cabe con holgura. El
  screenshot/IndexedDB es riesgo diferido a iteración 2.
- **Datos viejos visibles si otro encargado cambia el territorio desde otro
  dispositivo**: la revalidación por versiones lo resuelve (solo baja los cambiados).
- **Draft por navegador**: no es multi-dispositivo; el draft refleja marcas sin
  guardar de una sola sesión/navegador. Si otro dispositivo guardó en el backend, la
  revalidación lo aplica solo si no hay draft local (el draft manda en la sesión).
- **SSR**: todo acceso a `localStorage`/`window` va detrás de guards de plataforma
  (el build de producción incluye SSR).