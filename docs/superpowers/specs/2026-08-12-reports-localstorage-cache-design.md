# Reports localStorage Cache + Offline Queue — Design Specification

**Date**: 2026-08-12
**Project**: Predicador (frontend Angular + backend Spring Boot reporting-service)
**Branch**: `perf/reports-latest-per-territory`
**Status**: Approved for implementation

---

## 1. Summary

Hoy el mapa carga reportes del backend en cada sesión aunque no haya cambios: el
frontend consulta `/reports/batch` por todos los territorios visibles y solo lo
cachea en memoria con TTL de 5 min. Este diseño persiste el **último reporte por
territorio marcado** en `localStorage`, revalida qué territorios **cambiaron** con
una consulta ligera de versiones y solo descarga los reportes de esos territorios.
Además añade una **cola offline** que guarda localmente las marcas y la petición
WhatsApp (con screenshot) cuando no hay conexión, y las reenvía automáticamente al
reconectar. Se refuerza la garantía de que el envío WhatsApp llegue siempre al
número del encargado que editó.

---

## 2. Goals & Non-Goals

### Goals
- No repetir la consulta de reportes al backend cuando no hay cambios.
- Al iniciar, pintar el mapa **instantáneamente** desde `localStorage` y revalidar
  en segundo plano solo los territorios cuyo reporte cambió.
- Cargar **solo reportes con marcas** (territorios sin reporte o con reporte vacío
  no se pintan ni se consultan).
- Cuando un encargado marca y guarda, refrescar **solo ese territorio**.
- Soporte offline: marcar, tomar el screenshot y guardar todo en cola local; al
  reconectar, persistir y reenviar WhatsApp automáticamente, en orden.
- El reporte WhatsApp siempre se envía al **número del encargado logueado**.
- Limpiar el cache y la cola al hacer logout.

### Non-Goals
- No cambia el motor de mapa ni la lógica de marcado parcial/completo.
- No agrega listados históricos de reportes en el frontend.
- No introduce un mecanismo general de sincronización multi-dispositivo (la cola es
  por navegador).
- No cambia el formato de imagen soportado por WhatsApp (solo JPEG/PNG).

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
  invalida la caché solo de los territorios editados y re-restaura desde DB.
- **WhatsApp**: `WhatsAppService.sendReport` genera `crypto.randomUUID()` por
  llamada, POST `Idempotency-Key` → estado `IN_PROGRESS` → polling cada 2 s (60 s
  máx). Backend persiste entrega en `whatsapp_delivery` con lease de 5 min y envía
  por executor o cola RabbitMQ.
- `buildWhatsAppRequest` usa `destinationNumber = perfil.telefono || null`; el
  backend cae a `props.destinationNumber()` (admin) si es null.
- Logout (`profile.ts` / `admin.ts`) limpia solo el perfil, no los reportes.

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
- `setTerritorio(num, reporte)` / `setTerritorios(Map<number, Reporte>)`.
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
2. **Fase revalidación (fondo):** `GET /versions` para `nums`. Para cada territorio
   cuya `version` (id del último reporte en backend) difiere de la cacheada (o que
   no está en cache):
   - descarga su reporte vía `/reports/batch` (solo esos números),
   - actualiza `ReportCacheService` y `versionsSeen`.
   Los territorios sin cambios se **saltan** el batch.
3. El resultado final se expone como `Map<number, Reporte[]>` (1 elemento por
   territorio con marcas) para no romper la firma actual.
4. Si `/versions` falla (offline/backend caído) → no bloquea; el mapa ya pintó del
   cache. Sin reintento en bucle.

**`crearReportes(reportes)`**: tras POST exitoso, actualiza `ReportCacheService` con
los reportes guardados (respuesta del backend) → refleja el territorio editado sin
re-consultarlo.

**`getReportesPorTerritorio(num)` (singular)**: se usa en la restauración bajo
demanda (al seleccionar un territorio nuevo o en `moveend` para territorios sin
marcas). Mantiene su comportamiento: si el territorio tiene entrada en cache y su
`version` coincide con la última conocida, devuelve la cache; si no, consulta
`GET /reports?territorioNumero=...` y actualiza cache/`versionsSeen`. Nunca cae al
fallback del admin de WhatsApp (ver 4.7).

**`logout()` expuesto** (o método en `ReportCacheService`) que hace `clear()` del
cache + cola. Se engancha en `Profile.clear()` / `logout` de `ProfilePage` y
`admin.ts`.

### 4.4 Cola offline — `PendingReportsQueueService` (nuevo, `core/services/pending-reports-queue.ts`)

Persistencia en `localStorage` (key `predicador_pending_reports`):

```ts
interface PendingPack {
  registros: RegistroReporte[];
  whatsappRequest?: WhatsAppSendRequest; // opcional: solo en guardarYEnviar
  screenshotRef?: { store: 'localStorage' | 'indexeddb'; key: string }; // si cabe/además del base64 en whatsappRequest
  idempotencyKey?: string;  // generado 1 vez al encolar, reutilizado en retries
  retries: number;
  status: 'pending' | 'done' | 'error';
}
```

Reglas:
- Se encola cuando el requerimiento detecta **fallo de red** (HTTP error con
  status 0 / `navigator.onLine === false` / timeout). Los errores de negocio
  (400/403/409/413) **no** se encolan.
- El screenshot se captura offline (preview del mapa) y se guarda **comprimido**
  en el pack; si excede el umbral de `localStorage`, el blob va a **IndexedDB** y el
  pack guarda `screenshotRef`.
- `flush()` procesa en orden **FIFO**: POST `/reports` (persistir) → si aplica,
  `sendReport` con la **misma `idempotencyKey`** almacenada → marcar `done`.
  Cada fallo de red mantiene el pack con `retries++`; `error` de negocio lo marca
  `error` (visible, descartable).
- Flush disparado por: listener `window 'online'` (en `MapPage`), carga de página
  con packs `pending`, y click en el badge.
- Expone `pendingCount = signal<number>` para el badge.

**Idempotencia**: la key se genera una sola vez al encolar y se reutiliza en cada
intento → no genera envíos duplicados (hoy `sendReport` genera `randomUUID()` por
llamada).

### 4.5 Flujo `guardarEnBaseDeDatos` / `guardarYEnviar` (map-data-persistence.service.ts)

- Se detecta red antes/después del primer intento.
- `guardarYEnviar` **precaptura** el screenshot (existe `captureScreenshot`) y arma
  el `WhatsAppRequest` **antes** del POST, para tenerlo disponible si el POST falla
  por red → se encola el pack completo (registros + request + screenshot).
- Si la llamada falla por red → encolar + toast "Sin conexión: guardado localmente,
  se enviará al reconectar". Si falla por negocio → toast de error actual, sin
  encolar.
- Tras carga/guardado exitoso se aplica la Sección 4.3.

### 4.6 UI — Badge de pendientes

- `map.html`: badge contador "N pendientes" junto al botón de guardar/enviar,
  ligado a `pendingCount` del queue service. Click → `flush()` manual.
- Toast en reconexión: "Conexión restablecida, sincronizando...".
- Validación predictiva: si el perfil no tiene `telefono` y se intenta
  `guardarYEnviar`, se bloquea con aviso "Agrega tu número de WhatsApp" en vez de
  caer al fallback del admin.

### 4.7 WhatsApp — verificaciones y correcciones

- **Destino**: SIEMPRE el `telefono` del encargado logueado (`perfil.telefono`).
  El fallback a `props.destinationNumber()` del backend solo debe ocurrir si el DTO
  no trae número; el frontend impide ese caso para encargados.
- **Formato screenshot**: se mantiene **JPEG** (WhatsApp solo acepta JPEG/PNG para
  templates, 5 MB máx; WebP es solo stickers). Se reduce peso con calidad ~0.4 y/o
  `scale: 0.5` en html2canvas.
- **Timeout polling (60 s) vs lease backend (5 min)**: evaluar subir el timeout o
  alinear el mensaje de estado para no reportar error cuando el envío sigue en
  curso. (Se valida en implementación; decisión documentada en el plan.)
- **Camino doble**: verificar que executor y cola RabbitMQ no dupliquen envíos
  (ambos ya aplican idempotencia por clave — se revisa con tests de regresión).
- Se verifican `phone.ts` (normalización) y la construcción de `components`.

> La carpeta `predicador-frontend/AGENTS.md` tiene la guía y gotchas de este
> frontend; seguir sus convenciones (Vitest, Señales, SSR guards).

---

## 5. Data & Storage

- `localStorage['predicador_reports_cache']` — cache persistente de últimos reportes.
- `localStorage['predicador_pending_reports']` — cola offline.
- `IndexedDB` (db `predicador-offline`, store `screenshots`) — blobs grandes de
  screenshot cuando no caben en localStorage.
- Backend: sin cambios de schema. Nuevo endpoint de versiones sobre la tabla
  existente `registro_predicacion`.

---

## 6. Files Changed (mapped)

### Backend (`backend/reporting-service/`)
- `src/main/java/com/predicador/reporting/controller/ReportController.java` — `GET /versions`.
- `src/main/java/com/predicador/reporting/service/ReportService.java` — `getReportVersions(...)`.
- `src/main/java/com/predicador/reporting/repository/ReportRepository.java` — query versions.
- Tests: `ReportRepositoryIntegrationTest`, `ReportServiceTest`, controller spec existente.

### Frontend (`predicador-frontend/src/app/`)
- `core/services/report-cache.ts` — **nuevo**.
- `core/services/pending-reports-queue.ts` — **nuevo**.
- `core/services/territorio.ts` — cache 2 capas + `logout()`.
- `core/services/territorio.spec.ts` — extender.
- `core/services/profile.ts` / `features/profile/profile.ts` / `features/admin/admin.ts` — hook de logout.
- `features/map/services/map-data-persistence.service.ts` — flujo offline + precaptura screenshot.
- `features/map/map-report.service.ts` — quality/scale del screenshot.
- `features/map/map.html` — badge de pendientes.
- `features/map/map.ts` — listener `online`, subscribe a `pendingCount`.
- Tests: `report-cache.service.spec.ts`, `pending-reports-queue.service.spec.ts`,
  extensiones de `territorio.spec.ts`, `map-data-persistence.service.spec.ts`,
  `map-report.service.spec.ts`.

---

## 7. Testing

### Frontend (Vitest, ver `predicador-frontend/AGENTS.md`)
- `report-cache.service.spec.ts`: set/get/remove/clear, SSR guard, parseo corrupto,
  límite de storage.
- `territorio.service.spec.ts`: fase rápida desde cache; revalidación **solo** de
  territorios cuyo version cambió; fallo de `/versions` → usa cache.
- `pending-reports-queue.service.spec.ts`: FIFO, reutilización de `idempotencyKey`,
  no encola errores de negocio, retries→`done`, `error` descartable.
- `map-data-persistence.service.spec.ts`: red caída → encola (no `saveError`);
  `guardarYEnviar` precaptura screenshot para el pack.
- `map-report.service.spec.ts`: capture quality 0.4 / scale 0.5.

### Backend (JUnit + Testcontainers, ver AGENTS.md raíz)
- `ReportRepository`: versions solo territorios con reporte NO vacío; version =
  id del último reporte por `fecha DESC NULLS LAST, id DESC`; territorios sin
  reporte (o con reporte vacío) no aparecen.
- `ReportService`/controller: `/versions` auth requerida; >100 → 400; shape del Map.
- Regresión WhatsApp: idempotencia sigue evitando duplicados.

---

## 8. Open Questions / Decisions flagged

- **Umbral de localStorage para screenshot**: se dimensiona en implementación con
  el tamaño real del canvas (objetivo: pack < ~1.5 MB para dejar margen en 5 MB).
- **Timeout de polling WhatsApp**: se valida en implementación; ver punto 4.7.

---

## 9. Risks

- **Tamaño de localStorage (~5 MB)**: mitigado con screenshot comprimido y fallback
  a IndexedDB para blobs grandes.
- **Datos viejos visibles si otro encargado cambia el territorio desde otro
  dispositivo**: la revalidación por versiones lo resuelve (solo baja los cambiados).
- **Cola offline por navegador**: no es multi-dispositivo; cada dispositivo sincroniza
  sus propios pendientes al reconectar. Riesgo de conflicto si dos encargados marcan
  el mismo territorio sin conexión → aceptado (documentado).
- **SSR**: todo acceso a `localStorage`/`IndexedDB`/`navigator`/`window` va detrás de
  guards de plataforma (el build de producción incluye SSR).