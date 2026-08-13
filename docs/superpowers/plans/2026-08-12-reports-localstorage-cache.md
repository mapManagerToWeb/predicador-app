# Reports localStorage Cache + Draft Marks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the last report per territory in localStorage (`ReportCacheService`), revalidate only changed territories via a new lightweight `GET /reports/versions`, and restore an unsaved marks draft from localStorage on next load (iteration 1; the WhatsApp offline queue is explicitly out of scope).

**Architecture:** Two caching layers on the frontend — persistent localStorage (`ReportCacheService`) as the fast render source and an in-memory `versionsSeen` map so the session revalidates each territory only once. `TerritorioService` snapshots from cache instantly, then validates against `/versions` (chunked 50) and downloads only changed reports via `/batch`. A `DraftMarksService` persists pure-data marks with a debounced effect in `MapStateService`. Backend gains one endpoint (`GET /reports/versions`) returning `Map<Long, Long>` — territory → id of the last non-empty report — built with the same `DISTINCT ON` ordering as `/batch`, minus the redundant predicate.

**Tech Stack:** Angular 22 (signals, SSR, Vitest/jsdom), Spring Boot 4 / Java 25 (MockMvc + Mockito, Testcontainers Postgres), existing `reporting-service`.

## Global Constraints

- **Frontend uses pnpm only** — never npm. Run checks in CI order from `predicador-frontend/`: `pnpm run lint`, `npx ng build --configuration=production`, `pnpm test -- --run --coverage`.
- Run one spec: `pnpm test -- src/path/to/file.spec.ts`. Vitest + jsdom, setup `src/test-setup.ts`.
- **SSR guards**: every `localStorage`/`window` access must be guarded (`typeof localStorage === 'undefined'` → no-op). Production build includes SSR + service worker.
- **ESLint**: `no-floating-promises` is error (await promises), `@typescript-eslint/no-unused-vars` error with `caughtErrorsIgnorePattern: '^_'`, `no-empty` with `allowEmptyCatch`, no `any` (use typed guards). Prettier enforced via `pnpm run lint:fix`.
- Backend: run Maven from `backend/`. Focused check: `mvn -pl reporting-service test`. Docker-gated tests need `-Ddocker.available=true`. JaCoCo enforced at `mvn verify` (40% line/instruction).
- **No schema changes.** `/versions` reads existing `registro_predicacion`, reusing the V4 index `idx_registro_predicacion_territorio_fecha`. No new Flyway migration.
- **Auth**: `/versions` requires any authenticated session (`authorization.requireAuthenticated`), same as `/batch`. `MAX_BATCH_SIZE = 100` is enforced for `@RequestParam List<Long> territorios`.
- **Out of scope (iteration 2)**: `pending-reports-queue.ts` stays unwired — do NOT implement or touch its `flush()` bug; leave the file as-is. No badge, no reconnexion toast, no WhatsApp changes.
- Do not touch unrelated uncommitted working-tree files: `RumController.java`/`RumControllerTest.java`, `application.yml`, `.settings/*`, `AGENTS.md`, `.gitignore`, `eslint.config.js`. Stage only the per-task files listed below (`git add <file>...`, never `-A`).
- Existing `mock` for `TerritorioService` in `map-data-persistence.service.spec.ts` must be updated when its API changes (Task 6).
- Commit messages in repo style: lowercase Conventional Commits (`feat:`, `test:`, `perf:`, `refactor:`).

---

### Task 1: Backend — clean `findVersions` query + lock with Testcontainers

Existing `findVersions` (already in `ReportRepository.java`) uses JPQL with a redundant predicate (`r.manzanasIds IS NOT NULL AND (…)`) and no `DISTINCT ON`, so it can return multiple rows per territory. Replace with a native query that mirrors the `/batch` `DISTINCT ON` selection and only returns the last **non-empty** report per territory.

**Files:**
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/repository/ReportRepository.java:32-33`
- Test: `backend/reporting-service/src/test/java/com/predicador/reporting/repository/ReportRepositoryIntegrationTest.java`

**Interfaces:**
- Produces: `List<Object[]> findVersions(@Param("territorioNumeros") Collection<Long> territorioNumeros)` — each row `[territorioNumero, id]`, one row per territory. Consumed by Task 2 (`ReportService.getReportVersions`).

- [x] **Step 1: Write the failing tests**

Append to `ReportRepositoryIntegrationTest.java` (before the closing brace):

```java
    @Test
    void findVersionsReturnsLastNonEmptyReportPerTerritory() {
        // Territorio 1: empty report (older) then non-empty (newer) -> version = id of the non-empty.
        repository.save(report(100, 1L, Instant.parse("2026-08-01T10:00:00Z"), "completed", null));
        repository.save(report(101, 1L, Instant.parse("2026-08-10T10:00:00Z"), "completed", "A,B,C"));
        // Territorio 2: two non-empty -> version = id of the one ordered last by fecha DESC, id DESC.
        repository.save(report(102, 2L, Instant.parse("2026-08-05T10:00:00Z"), "incomplete", "D"));
        repository.save(report(103, 2L, Instant.parse("2026-08-11T10:00:00Z"), "completed", "D,E"));

        List<Object[]> result = repository.findVersions(List.of(1L, 2L, 99L));

        assertThat(result).hasSize(2);
        assertThat(result).extracting(row -> ((Number) row[0]).longValue())
                .containsExactly(1L, 2L);
        assertThat(result.get(0)).extracting(row -> ((Number) row[1]).longValue())
                .isEqualTo(101L);
        assertThat(result.get(1)).extracting(row -> ((Number) row[1]).longValue())
                .isEqualTo(103L);
    }

    @Test
    void findVersionsExcludesTerritoriesWithOnlyEmptyReports() {
        repository.save(report(110, 9L, Instant.parse("2026-08-01T10:00:00Z"), "completed", null));
        repository.save(report(111, 9L, Instant.parse("2026-08-05T10:00:00Z"), "incomplete", ""));

        assertThat(repository.findVersions(List.of(9L))).isEmpty();
    }
```

> The `report(...)` helper already exists in the file (sets `manzanasIds` from its 5th argument). `manzanasIds = null`/`""` are the "empty" cases; a non-null `manzanasId`/`geometriaParcial` alone is also non-empty but the helper does not set those — coverage for those columns comes from the query conditions, not extra rows.

- [ ] **Step 2: Run tests to verify they fail**

Run (Docker required): `mvn -pl reporting-service test -Dtest=ReportRepositoryIntegrationTest -Ddocker.available=true`

Expected: FAIL — the current JPQL `findVersions` has the redundant predicate so `manzanasIds = null` territories qualify, or returns non-DISTINCT rows and the `hasSize(2)` assertion trips.

> **Environment note (2026-08-12):** this step could not be executed via the Testcontainers harness on this machine (see Step 4 note) — the query was replaced with the native version and its semantics verified directly against Postgres 16 instead.

- [x] **Step 3: Replace `findVersions` with the native DISTINCT ON query**

In `ReportRepository.java`, replace the JPQL `findVersions` (lines 32-33) with:

```java
    @Query(value = """
            SELECT DISTINCT ON (territorio_numero) territorio_numero, id
            FROM registro_predicacion
            WHERE territorio_numero IN (:territorioNumeros)
              AND (manzanas_ids IS NOT NULL AND manzanas_ids <> ''
                   OR manzana_id IS NOT NULL
                   OR geometria_parcial IS NOT NULL)
            ORDER BY territorio_numero, fecha DESC NULLS LAST, id DESC
            """, nativeQuery = true)
    List<Object[]> findVersions(@Param("territorioNumeros") Collection<Long> territorioNumeros);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `mvn -pl reporting-service test -Dtest=ReportRepositoryIntegrationTest -Ddocker.available=true`

Expected: PASS (2 tests: existing `findLatestByTerritorioNumeroIn` suite + the 2 new `findVersions` tests).

> **Environment note (2026-08-12):** the Testcontainers harness cannot start on this machine — Docker Desktop 4.83 returns `400 BadRequest` to docker-java (Testcontainers 1.20.1) on every client-provider strategy at context load, breaking the pre-existing tests too (not this change). The query semantics were instead verified directly against a real `postgres:16-alpine` container run via the Docker CLI: with `(NULL,'2026-08-01','completed',1)`, `('A,B,C','2026-08-10','completed',1)`, `('D','2026-08-05','incomplete',2)`, `('D,E','2026-08-11','completed',2)` it returns `(1,2),(2,4)` for `IN (1,2,99)` and `(0 rows)` for territory 9 (only empty reports). CI runs the integration test with a postgis service, so it will gate there.

- [x] **Step 5: Commit**

```bash
git add backend/reporting-service/src/main/java/com/predicador/reporting/repository/ReportRepository.java backend/reporting-service/src/test/java/com/predicador/reporting/repository/ReportRepositoryIntegrationTest.java
git commit -m "perf(reporting): return only last non-empty report id per territory in findVersions"
```

---

### Task 2: Backend — `ReportService.getReportVersions`

**Files:**
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/service/ReportService.java`
- Test: `backend/reporting-service/src/test/java/com/predicador/reporting/service/ReportServiceTest.java`

**Interfaces:**
- Consumes: `findVersions(Collection<Long>)` from Task 1.
- Produces: `Map<Long, Long> getReportVersions(Collection<Long> territorioNumeros, SessionToken token)`. Consumed by Task 3 (`ReportController`).

- [x] **Step 1: Write the failing tests**

Append to `ReportServiceTest.java`:

```java
    @Test
    void getReportVersions_requiresAuthenticatedUser() {
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> reportService.getReportVersions(List.of(1L), null));
    }

    @Test
    void getReportVersions_rejectsBatchLargerThanMax() {
        assertThrows(IllegalArgumentException.class,
                () -> reportService.getReportVersions(
                        java.util.stream.LongStream.rangeClosed(1, 101).boxed().toList(), admin));
    }

    @Test
    void getReportVersions_groupsLastNonEmptyReportIdPerTerritory() {
        when(repository.findVersions(List.of(1L, 2L)))
                .thenReturn(List.of(new Object[]{1L, 101L}, new Object[]{2L, 103L}));

        Map<Long, Long> result = reportService.getReportVersions(List.of(1L, 2L), admin);

        assertEquals(2, result.size());
        assertEquals(Long.valueOf(101L), result.get(1L));
        assertEquals(Long.valueOf(103L), result.get(2L));
        verify(repository).findVersions(List.of(1L, 2L));
    }
```

- [x] **Step 2: Run tests to verify they fail**

Run: `mvn -pl reporting-service test -Dtest=ReportServiceTest`

Expected: FAIL — `getReportVersions` does not exist.

- [x] **Step 3: Implement `getReportVersions`**

Add to `ReportService.java`, after `getReportsByMultipleTerritorios`:

```java
    public Map<Long, Long> getReportVersions(Collection<Long> territorioNumeros, SessionToken token) {
        authorization.requireAuthenticated(token);
        if (territorioNumeros == null || territorioNumeros.size() > MAX_BATCH_SIZE) {
            throw new IllegalArgumentException("El lote de territorios no puede superar " + MAX_BATCH_SIZE);
        }
        return repository.findVersions(territorioNumeros).stream()
                .collect(Collectors.toMap(
                        row -> ((Number) row[0]).longValue(),
                        row -> ((Number) row[1]).longValue(),
                        (first, ignored) -> first));
    }
```

- [x] **Step 4: Run tests to verify they pass**

Run: `mvn -pl reporting-service test -Dtest=ReportServiceTest`

Expected: PASS (all prior + 3 new tests).

- [ ] **Step 5: Commit**

```bash
git add backend/reporting-service/src/main/java/com/predicador/reporting/service/ReportService.java backend/reporting-service/src/test/java/com/predicador/reporting/service/ReportServiceTest.java
git commit -m "feat(reporting): expose last report id per territory as version map"
```

---

### Task 3: Backend — `GET /reports/versions` endpoint + delete `.bak`

**Files:**
- Modify: `backend/reporting-service/src/main/java/com/predicador/reporting/controller/ReportController.java`
- Delete: `backend/reporting-service/src/main/java/com/predicador/reporting/controller/ReportController.java.bak`
- Test: `backend/reporting-service/src/test/java/com/predicador/reporting/controller/ReportControllerTest.java`

**Interfaces:**
- Consumes: `getReportVersions(Collection<Long>, SessionToken)` from Task 2.
- Produces: `GET /api/v1/reports/versions?territorios=1&territorios=2` → `ResponseEntity<Map<Long, Long>>`; 400 when `territorios.size() > MAX_BATCH_SIZE`. Consumed by Task 5 (`TerritorioService.revalidarReportes`).

- [x] **Step 1: Write the failing tests**

Append to `ReportControllerTest.java`:

```java
    @Test
    void getReportVersions_shouldReturn200() throws Exception {
        when(reportService.getReportVersions(java.util.List.of(1L, 2L), admin))
                .thenReturn(java.util.Map.of(1L, 101L, 2L, 103L));

        mockMvc.perform(get("/api/v1/reports/versions")
                        .requestAttr(SessionAuthFilter.ATTR_TOKEN, admin)
                        .param("territorios", "1", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.1").value(101))
                .andExpect(jsonPath("$.2").value(103));
    }

    @Test
    void getReportVersions_shouldReturn400WhenOverBatchLimit() throws Exception {
        java.util.List<Long> tooMany = java.util.stream.LongStream.rangeClosed(1, 101).boxed().toList();
        mockMvc.perform(get("/api/v1/reports/versions")
                        .requestAttr(SessionAuthFilter.ATTR_TOKEN, admin)
                        .param("territorios", tooMany.stream().map(String::valueOf).toArray(String[]::new)))
                .andExpect(status().isBadRequest());
    }
```

- [x] **Step 2: Run tests to verify they fail**

Run: `mvn -pl reporting-service test -Dtest=ReportControllerTest`

Expected: FAIL — `getReportVersions` not found on controller / no `/versions` mapping.

- [x] **Step 3: Add the endpoint**

In `ReportController.java`, after the `/batch` mapping (line ~76):

```java
    @GetMapping("/versions")
    public ResponseEntity<Map<Long, Long>> getReportVersions(
            @RequestParam List<Long> territorios, HttpServletRequest request) {
        if (territorios.size() > ReportService.MAX_BATCH_SIZE) return ResponseEntity.badRequest().build();
        return ResponseEntity.ok(reportService.getReportVersions(territorios, token(request)));
    }
```

- [x] **Step 4: Delete the `.bak` file**

```bash
rm backend/reporting-service/src/main/java/com/predicador/reporting/controller/ReportController.java.bak
```

- [x] **Step 5: Run tests to verify they pass**

Run: `mvn -pl reporting-service test -Dtest=ReportControllerTest`

Expected: PASS (all prior + 2 new tests).

- [ ] **Step 6: Commit**

```bash
git add backend/reporting-service/src/main/java/com/predicador/reporting/controller/ReportController.java backend/reporting-service/src/test/java/com/predicador/reporting/controller/ReportControllerTest.java
git rm backend/reporting-service/src/main/java/com/predicador/reporting/controller/ReportController.java.bak
git commit -m "feat(reporting): add GET /reports/versions endpoint; drop stale controller .bak"
```

---

### Task 4: Frontend — `ReportCacheService` cleanup + spec

The file exists untracked/uncommitted. Bring the API to the spec shape (`getCache`/`setTerritorio`/`setTerritorios`/`removeTerritorios`/`clear`/`hasData`), remove the `effect()` call from the constructor (load eagerly instead), keep the SSR guard and corrupt-cache discard. `version` derives from `reporte.id`.

**Files:**
- Modify: `predicador-frontend/src/app/core/services/report-cache.ts`
- Test: `predicador-frontend/src/app/core/services/report-cache.service.spec.ts` (new)

**Interfaces:**
- Produces (consumed by Task 5 `TerritorioService`):
  - `getCache(): Map<number, Reporte>`
  - `setTerritorio(numero: number, reporte: Reporte): void`
  - `setTerritorios(entries: Map<number, Reporte>): void`
  - `removeTerritorios(nums: number[]): void`
  - `clear(): void`
  - `hasData(): boolean`

- [ ] **Step 1: Write the failing spec**

Create `report-cache.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { ReportCacheService } from './report-cache';
import type { Reporte } from '../models/models';

const ONLY_PLAIN = '{ "othermll": true }';

function reporte(id: number, territorio: number): Reporte {
  return {
    id, manzanaId: null, fecha: '2026-08-10T10:00:00Z', encargadoId: 1,
    encargadoNombre: 'Daniel', encargadoApellido: 'Uribe', sessionTime: '06:00',
    estado: 'completed', territorioNumero: territorio, totalManzanas: 3,
    manzanasMarcadas: 3, tipoSesion: 'completa', geometriaParcial: null,
    puntosParciales: null, manzanasIds: 'A,B,C',
  };
}

describe('ReportCacheService', () => {
  let service: ReportCacheService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ReportCacheService] });
    service = TestBed.inject(ReportCacheService);
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  it('set/get/remove/clear round-trip through localStorage', () => {
    service.setTerritorio(1, reporte(10, 1));
    service.setTerritorios(new Map([[2, reporte(11, 2)]]));
    expect(service.getCache().get(1)?.id).toBe(10);
    expect(service.getCache().get(2)?.id).toBe(11);

    service.removeTerritorios([1]);
    expect(service.getCache().has(1)).toBe(false);
    expect(service.hasData()).toBe(true);

    service.clear();
    expect(service.hasData()).toBe(false);
  });

  it('survives a service re-instantiation (read from localStorage)', () => {
    service.setTerritorio(1, reporte(10, 1));
    const fresh = TestBed.inject(ReportCacheService);
    expect(fresh.getCache().get(1)?.id).toBe(10);
  });

  it('discards corrupt payloads and keeps the service usable', () => {
    localStorage.setItem('predicador_reports_cache', ONLY_PLAIN);
    service = TestBed.inject(ReportCacheService);
    expect(service.hasData()).toBe(false);
    expect(localStorage.getItem('predicador_reports_cache')).toBeNull();

    service.setTerritorio(1, reporte(10, 1));
    expect(service.getCache().get(1)?.id).toBe(10);
  });

  it('is a no-op when localStorage is unavailable (SSR guard)', () => {
    const storage = globalThis.localStorage;
    vi.stubGlobal('localStorage', undefined);
    try {
      const fresh = TestBed.inject(ReportCacheService);
      fresh.setTerritorio(1, reporte(10, 1));
      expect(fresh.hasData()).toBe(false);
      expect(fresh.getCache().size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      if (storage) globalThis.localStorage = storage;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/core/services/report-cache.service.spec.ts`

Expected: FAIL — current API lacks `setTerritorios`/`removeTerritorios`/`getCache`/`hasData` (has `getCacheMap`/`setTerritorio(num, reporte, version)`/`removeTerritorio`/`hasCache`) and uses `effect()`.

- [ ] **Step 3: Rewrite `report-cache.ts`**

Replace the whole file:

```typescript
import { Injectable } from '@angular/core';
import type { Reporte } from '../models/models';

const STORAGE_KEY = 'predicador_reports_cache';

interface ReportCacheEntry {
  report: Reporte;
  version: number;
}

function isCacheEntry(value: unknown): value is ReportCacheEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry['report'] === 'object' && entry['report'] !== null &&
    typeof entry['version'] === 'number' &&
    typeof entry['report'] !== 'string'
  );
}

function isCacheSchema(value: unknown): value is { savedAt: number; data: Record<string, ReportCacheEntry> } {
  if (typeof value !== 'object' || value === null) return false;
  const schema = value as Record<string, unknown>;
  return typeof schema['savedAt'] === 'number' && typeof schema['data'] === 'object';
}

@Injectable({ providedIn: 'root' })
export class ReportCacheService {
  private storage: Storage | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined;
  private readonly cache = new Map<number, Reporte>();

  constructor() {
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage(): void {
    this.cache.clear();
    if (!this.storage) return;
    try {
      const data = this.storage.getItem(STORAGE_KEY);
      if (!data) return;
      const parsed: unknown = JSON.parse(data);
      if (!isCacheSchema(parsed)) {
        this.storage.removeItem(STORAGE_KEY);
        return;
      }
      for (const [num, entry] of Object.entries(parsed.data)) {
        if (isCacheEntry(entry)) {
          this.cache.set(Number(num), entry.report);
        }
      }
    } catch {
      this.safeRemove();
    }
  }

  getCache(): Map<number, Reporte> {
    return new Map(this.cache);
  }

  setTerritorio(numero: number, reporte: Reporte): void {
    if (!this.storage) return;
    const entry: ReportCacheEntry = { report: reporte, version: reporte.id };
    try {
      const data = this.readSchema();
      data.data[numero] = entry;
      data.savedAt = Date.now();
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
      this.cache.set(numero, reporte);
    } catch {
      this.safeRemove();
    }
  }

  setTerritorios(entries: Map<number, Reporte>): void {
    for (const [num, reporte] of entries) {
      this.setTerritorio(num, reporte);
    }
  }

  removeTerritorios(nums: number[]): void {
    if (!this.storage) return;
    try {
      const data = this.readSchema();
      let changed = false;
      for (const num of nums) {
        if (num in data.data) {
          delete data.data[num];
          changed = true;
        }
      }
      if (!changed) return;
      data.savedAt = Date.now();
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      this.safeRemove();
    }
    for (const num of nums) this.cache.delete(num);
  }

  clear(): void {
    this.safeRemove();
    this.cache.clear();
  }

  hasData(): boolean {
    return this.cache.size > 0;
  }

  private readSchema(): { savedAt: number; data: Record<string, ReportCacheEntry> } {
    const data = this.storage?.getItem(STORAGE_KEY);
    if (data) {
      const parsed: unknown = JSON.parse(data);
      if (isCacheSchema(parsed)) return parsed;
    }
    return { savedAt: 0, data: {} };
  }

  private safeRemove(): void {
    this.cache.clear();
    if (this.storage) {
      try {
        this.storage.removeItem(STORAGE_KEY);
      } catch {
        // Storage can be unavailable (private mode); in-memory state is already clear.
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/app/core/services/report-cache.service.spec.ts`

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add predicador-frontend/src/app/core/services/report-cache.ts predicador-frontend/src/app/core/services/report-cache.service.spec.ts
git commit -m "feat(frontend): localStorage report cache with spec-shaped API and SSR guard"
```

---

### Task 5: Frontend — `TerritorioService` two-layer cache + `/versions` + `logout()`

Rewrite `TerritorioService` to the spec shape. Keep the existing `ReportDto`/`toReporte`/`toReportDto` mappers and `BATCH_SIZE = 50`. Replace the in-memory TTL map with `ReportCacheService` (persistent layer) + `versionsSeen: Map<number, number>` (session guard). `crearReportes` changes from `void` to `Reporte[]`.

**Files:**
- Modify: `predicador-frontend/src/app/core/services/territorio.ts`
- Modify: `predicador-frontend/src/app/core/services/territorio.spec.ts`
- Consumes: `ReportCacheService` API from Task 4; `DraftMarksService` (Task 7) — implement after Task 7, or stub `DraftMarksService` import this task and complete in Task 10. **Order fix:** this task depends on `DraftMarksService` only for `logout()`/`limpiarCache()`; see note below.

**Interfaces:**
- Produces:
  - `getReportesDesdeCache(nums: number[]): Map<number, Reporte[]>` — synchronous snapshot from localStorage (used by Task 10 for the instant paint).
  - `revalidarReportes(nums: number[]): Promise<Map<number, Reporte[]>>` — `/versions` + targeted `/batch`, updates cache + `versionsSeen`.
  - `getReportesPorTerritorios(nums: number[]): Promise<Map<number, Reporte[]>>` — convience = snapshot then awaits revalidation (single-call consumers).
  - `getReportesPorTerritorio(num: number): Promise<Reporte[]>` — singular on-demand (map `moveend`).
  - `crearReportes(registros: RegistroReporte[]): Promise<Reporte[]>` — POST returns saved dtos (consumed by Task 6).
  - `logout(): void` — clear report cache + draft (both core services; Task 7 provides `DraftMarksService`).
  - `limpiarCache(): void` — clear report cache + `versionsSeen` only (used by `reloadAllTerritories`, Task 10).

**Ordering note:** `TerritorioService.logout()`/`limpiarCache()` should call `ReportCacheService.clear()` only in this task. Wire the `DraftMarksService.clear()` call inside `logout()` in Task 10 (after Task 7 creates the service). Until then `logout()` clears only the report cache — no behavior regression since nothing calls it yet.

- [x] **Step 1: Write the failing/extended tests**

Rewrite `territorio.spec.ts`. It must not depend on timers (TTL is gone). Mock localStorage is real (jsdom). DraftMarksService is not injected here.

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TerritorioService } from './territorio';
import type { Reporte } from '../models/models';

function reporte(id: number, territorio: number): Reporte {
  return {
    id, manzanaId: null, fecha: '2026-08-10T10:00:00Z', encargadoId: 1,
    encargadoNombre: 'Daniel', encargadoApellido: 'Uribe', sessionTime: '06:00',
    estado: 'completed', territorioNumero: territorio, totalManzanas: 3,
    manzanasMarcadas: 3, tipoSesion: 'completa', geometriaParcial: null,
    puntosParciales: null, manzanasIds: 'A,B,C',
  };
}

describe('TerritorioService', () => {
  let service: TerritorioService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TerritorioService);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    httpMock.verify();
  });

  function isBatch(req: { url: string; method: string }): boolean {
    return req.method === 'GET' && req.url.includes('/reports/batch');
  }
  function isVersions(req: { url: string; method: string }): boolean {
    return req.method === 'GET' && req.url.includes('/reports/versions');
  }
  function territoriosFrom(url: string): string[] {
    const query = url.split('?')[1] ?? '';
    return query.split('&')
      .filter(p => p.startsWith('territorios='))
      .map(p => p.slice('territorios='.length));
  }

  it('paints instantly from cache and only downloads changed territories', async () => {
    service['reportCache'].setTerritorio(1, reporte(10, 1));
    service['versionsSeen'].set(1, 10);

    const promise = service.getReportesPorTerritorios([1, 2]);
    // 1 => matching version, no batch. 2 => never seen, ask /versions.
    const versionsReq = httpMock.expectOne(isVersions);
    expect(territoriosFrom(versionsReq.request.url)).toEqual(['1', '2']);
    versionsReq.flush({ 1: 10, 2: 11 });

    const batchReq = httpMock.expectOne(isBatch);
    expect(territoriosFrom(batchReq.request.url)).toEqual(['2']);
    batchReq.flush({ 2: [reporte(11, 2)] });

    const result = await promise;
    expect(result.get(1)?.[0]?.id).toBe(10);
    expect(result.get(2)?.[0]?.id).toBe(11);
  });

  it('revalidates each territory only once per session', async () => {
    const promise = service.getReportesPorTerritorios([1]);
    const versionsReq = httpMock.expectOne(isVersions);
    versionsReq.flush({ 1: 10 });
    httpMock.expectOne(isBatch).flush({ 1: [] });

    await promise;

    // Second call: no network at all (version already seen).
    const second = service.getReportesPorTerritorios([1]);
    await Promise.resolve();
    httpMock.expectNone(isVersions);
    httpMock.expectNone(isBatch);
    await second;
    expect(service['versionsSeen'].has(1)).toBe(true);
  });

  it('falls back to cache when /versions fails (offline)', async () => {
    service['reportCache'].setTerritorio(1, reporte(10, 1));
    const result = service.getReportesDesdeCache([1]);
    expect(result.get(1)?.[0]?.id).toBe(10);

    const promise = service.revalidarReportes([1]);
    const versionsReq = httpMock.expectOne(isVersions);
    versionsReq.error(new ProgressEvent('error'), { status: 0, statusText: 'Offline' });
    const after = await promise;
    expect(after.get(1)?.[0]?.id).toBe(10);
  });

  it('does not request territories that have no backend version and no cache', async () => {
    const promise = service.getReportesPorTerritorios([99]);
    const versionsReq = httpMock.expectOne(isVersions);
    versionsReq.flush({});

    const result = await promise;
    expect(result.has(99)).toBe(false);
    httpMock.expectNone(isBatch);
  });

  it('crearReportes returns the saved reports with ids', async () => {
    const promise = service.crearReportes([{
      territorioNumero: 1, manzanaId: null, encargadoId: 1, encargadoNombre: 'Daniel',
      encargadoApellido: 'Uribe', sessionTime: '06:00', estado: 'completed',
      totalManzanas: 3, manzanasMarcadas: 3, tipoSesion: 'completa',
      geometriaParcial: null, puntosParciales: null, manzanasIds: 'A,B,C',
    }]);
    const req = httpMock.expectOne(r => r.method === 'POST' && r.url.includes('/reports'));
    req.flush([{ ...reporte(10, 1) }]);

    const saved = await promise;
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe(10);
  });
});
```

> `service['reportCache']` and `service['versionsSeen']` reach private members for test seeding. `TerritorioService` constructor must inject `ReportCacheService` (root-provided) — TestBed auto-resolves it.

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/app/core/services/territorio.spec.ts`

Expected: FAIL — `getReportesDesdeCache`/`revalidarReportes` don't exist; `crearReportes` returns `void`; `versionsSeen` not present.

- [x] **Step 3: Rewrite `territorio.ts`**

Replace the whole file:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { Reporte, RegistroReporte, EstadoReporte, TipoSesion } from '../models/models';
import { ReportCacheService } from './report-cache';

interface ReportDto {
  id?: number;
  manzanaId?: string | null;
  fecha?: string;
  encargadoNombre: string;
  encargadoApellido?: string | null;
  sessionTime?: string | null;
  estado?: string;
  territorioNumero?: number;
  encargadoId?: number | null;
  totalManzanas?: number;
  manzanasMarcadas?: number;
  tipoSesion?: string;
  geometriaParcial?: string | null;
  puntosParciales?: string | null;
  manzanasIds?: string | null;
}

const BATCH_SIZE = 50;

@Injectable({ providedIn: 'root' })
export class TerritorioService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/territories`;
  private readonly reportesUrl = `${environment.apiUrl}/reports`;
  private readonly reportCache = inject(ReportCacheService);

  /** Versions already validated this session (territorio -> id of last report). */
  private readonly versionsSeen = new Map<number, number>();

  async getNumerosTerritorios(): Promise<number[]> {
    return firstValueFrom(this.http.get<number[]>(this.apiUrl));
  }

  async getAllGeoJson(): Promise<string> {
    return firstValueFrom(
      this.http.get(`${this.apiUrl}/all/geojson`, { responseType: 'text' })
    );
  }

  async getColores(): Promise<Record<number, string>> {
    return firstValueFrom(this.http.get<Record<number, string>>(`${this.apiUrl}/colors`));
  }

  async asignarColor(numero: number, color: string): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${this.apiUrl}/${numero}/color`, { color })
    );
  }

  async crearReportes(registros: RegistroReporte[]): Promise<Reporte[]> {
    const dtos = registros.map(r => this.toReportDto(r));
    return (await firstValueFrom(
      this.http.post<ReportDto[]>(this.reportesUrl, dtos)
    ) ?? []).map(d => this.toReporte(d, d.territorioNumero ?? 0));
  }

  /** Synchronous snapshot from localStorage — paint the map instantly. */
  getReportesDesdeCache(nums: number[]): Map<number, Reporte[]> {
    const result = new Map<number, Reporte[]>();
    const cache = this.reportCache.getCache();
    for (const num of nums) {
      const reporte = cache.get(num);
      if (reporte) result.set(num, [reporte]);
    }
    return result;
  }

  async revalidarReportes(nums: number[]): Promise<Map<number, Reporte[]>> {
    const result = this.getReportesDesdeCache(nums);
    const sinRevisar = nums.filter(n => !this.versionsSeen.has(n));
    if (sinRevisar.length === 0) return result;

    const versiones = new Map<number, number>();
    for (let i = 0; i < sinRevisar.length; i += BATCH_SIZE) {
      const chunk = sinRevisar.slice(i, i + BATCH_SIZE);
      const query = chunk.map(n => `territorios=${n}`).join('&');
      const response = (await firstValueFrom(
        this.http.get<Record<string, number>>(`${this.reportesUrl}/versions?${query}`)
      )) ?? {};
      for (const [key, version] of Object.entries(response)) {
        versiones.set(Number(key), Number(version));
      }
    }

    for (const num of sinRevisar) {
      this.versionsSeen.set(num, versiones.get(num) ?? -1);
    }

    const cambiados = new Map<number, number>();
    for (const [num, version] of versiones) {
      const cacheado = this.reportCache.getCache().get(num);
      if (!cacheado || cacheado.id !== version) cambiados.set(num, version);
    }

    for (let i = 0; i < cambiados.size; i += BATCH_SIZE) {
      const chunk = Array.from(cambiados.keys()).slice(i, i + BATCH_SIZE);
      const query = chunk.map(n => `territorios=${n}`).join('&');
      const response = (await firstValueFrom(
        this.http.get<Record<string, ReportDto[]>>(`${this.reportesUrl}/batch?${query}`)
      )) ?? {};
      for (const num of chunk) {
        const reportes = (response[String(num)] ?? []).map(d => this.toReporte(d, num));
        const ultimo = this.elegirUltimo(reportes);
        if (ultimo) {
          this.reportCache.setTerritorio(num, ultimo);
          result.set(num, [ultimo]);
        } else {
          result.delete(num);
        }
      }
    }
    return result;
  }

  async getReportesPorTerritorios(territorios: number[]): Promise<Map<number, Reporte[]>> {
    const instantaneo = this.getReportesDesdeCache(territorios);
    const revalidado = await this.revalidarReportes(territorios);
    const merged = new Map(instantaneo);
    for (const [num, list] of revalidado) merged.set(num, list);
    return merged;
  }

  async getReportesPorTerritorio(territorioNumero: number): Promise<Reporte[]> {
    const cacheado = this.reportCache.getCache().get(territorioNumero);
    if (cacheado && this.versionsSeen.get(territorioNumero) === cacheado.id) return [cacheado];

    const dtos = await firstValueFrom(
      this.http.get<ReportDto[]>(`${this.reportesUrl}?territorioNumero=${territorioNumero}`)
    );
    const reportes = (dtos ?? []).map(d => this.toReporte(d, territorioNumero));
    const ultimo = this.elegirUltimo(reportes);
    if (ultimo) {
      this.reportCache.setTerritorio(territorioNumero, ultimo);
      this.versionsSeen.set(territorioNumero, ultimo.id);
    } else {
      this.versionsSeen.set(territorioNumero, -1);
    }
    return reportes;
  }

  /** Clears the persistent report cache + in-session version guard (used by reload). */
  limpiarCache(): void {
    this.reportCache.clear();
    this.versionsSeen.clear();
  }

  /** Logout hygiene: clears report cache + marks draft. Draft hook lands in Task 10. */
  logout(): void {
    this.reportCache.clear();
    this.versionsSeen.clear();
  }

  private elegirUltimo(reportes: Reporte[]): Reporte | undefined {
    let ultimo: Reporte | undefined;
    for (const r of reportes) {
      if (!ultimo || (r.fecha || '') > (ultimo.fecha || '')) ultimo = r;
    }
    return ultimo;
  }

  private toReportDto(r: RegistroReporte): ReportDto {
    return {
      manzanaId: r.manzanaId ?? null,
      encargadoNombre: r.encargadoNombre,
      encargadoApellido: r.encargadoApellido,
      sessionTime: r.sessionTime,
      estado: r.estado,
      territorioNumero: r.territorioNumero,
      encargadoId: r.encargadoId ?? null,
      totalManzanas: r.totalManzanas,
      manzanasMarcadas: r.manzanasMarcadas,
      tipoSesion: r.tipoSesion,
      geometriaParcial: r.geometriaParcial ?? null,
      puntosParciales: r.puntosParciales ?? null,
      manzanasIds: r.manzanasIds ?? null
    };
  }

  private toReporte(d: ReportDto, fallbackNumero: number): Reporte {
    return {
      id: d.id ?? 0,
      manzanaId: d.manzanaId ?? null,
      fecha: d.fecha ?? '',
      encargadoId: d.encargadoId ?? 0,
      encargadoNombre: d.encargadoNombre,
      encargadoApellido: d.encargadoApellido ?? '',
      sessionTime: d.sessionTime ?? '',
      estado: (d.estado as EstadoReporte) ?? 'completed',
      territorioNumero: d.territorioNumero ?? fallbackNumero,
      totalManzanas: d.totalManzanas ?? 0,
      manzanasMarcadas: d.manzanasMarcadas ?? 0,
      tipoSesion: (d.tipoSesion as TipoSesion) ?? 'completa',
      geometriaParcial: d.geometriaParcial ?? null,
      puntosParciales: d.puntosParciales ?? null,
      manzanasIds: d.manzanasIds ?? null
    };
  }
}
```

> **Deliberate change vs. previous behavior:** `getReportesPorTerritorio` (singular) no longer caches to a TTL map — it writes `ReportCacheService` and `versionsSeen`. `invalidateReportCache`/`invalidateAll` are deleted (spec §4.3) — Task 6 removes their last callers. `getReportesDesdeCache` is the fast render path for Task 10.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/app/core/services/territorio.spec.ts`

Expected: PASS. If a stale import of removed methods appears in another spec, fix in Task 6's spec update.

- [x] **Step 5: Commit**

```bash
git add predicador-frontend/src/app/core/services/territorio.ts predicador-frontend/src/app/core/services/territorio.spec.ts
git commit -m "refactor(frontend): two-layer report cache with /versions revalidation"
```

---

### Task 6: Frontend — `MapReportService.saveToDatabase` returns `Reporte[]` + update persistence spec mock

`MapReportService.saveToDatabase` currently returns `Promise<void>` calling `crearReportes`. Thread the saved reports through so the persistence flows (Task 9) can write the cache. Update the spec mock for `TerritorioService` (it currently mocks `invalidateReportCache`).

**Files:**
- Modify: `predicador-frontend/src/app/features/map/map-report.service.ts:152-154`
- Modify: `predicador-frontend/src/app/features/map/services/map-data-persistence.service.spec.ts` (mock shape only; behavior assertions land in Task 9)

**Interfaces:**
- Produces: `saveToDatabase(registros: RegistroReporte[]): Promise<Reporte[]>` (consumed by Task 9).

- [x] **Step 1: Update the code**

In `map-report.service.ts`, change `saveToDatabase` to:

```typescript
  async saveToDatabase(registros: RegistroReporte[]): Promise<Reporte[]> {
    return this.territorioService.crearReportes(registros);
  }
```

Update the `TerritorioService` mock in `map-data-persistence.service.spec.ts` (line 40):

```typescript
        { provide: TerritorioService, useValue: { crearReportes: vi.fn().mockResolvedValue([]) } },
```

and the `saveToDatabase` mock in the `report` object (line 30) — keep `mockResolvedValue([])`; type changes to return `Reporte[]`.

- [x] **Step 2: Run the affected specs**

Run: `pnpm test -- src/app/features/map/map-report.service.spec.ts src/app/features/map/services/map-data-persistence.service.spec.ts`

Expected: PASS (both specs type-check and run).

- [x] **Step 3: Commit**

```bash
git add predicador-frontend/src/app/features/map/map-report.service.ts predicador-frontend/src/app/features/map/services/map-data-persistence.service.spec.ts
git commit -m "refactor(frontend): saveToDatabase returns saved reports for cache seeding"
```

---

### Task 7: Frontend — `DraftMarksService` (new `core/services/map-draft.ts`)

Pure-data draft persistence in localStorage (key `predicador_map_draft`). No feature-layer imports — puntos are stored as plain `{lat,lng}` objects (device-neutral DTO), converted at the boundaries (Task 8 serializes, Task 10 deserializes).

**Files:**
- Create: `predicador-frontend/src/app/core/services/map-draft.ts`
- Test: `predicador-frontend/src/app/core/services/map-draft.service.spec.ts` (new)

**Interfaces:**
- Produces:
  - `interface DraftPoint { lat: number; lng: number; edgeIdx: number; t: number }`
  - `interface DraftTerritorioParcial { puntos: DraftPoint[]; geometria: string }`
  - `interface MapDraft { manzanasById: Record<string, ManzanaMarcada>; territoriosSeleccionados: number[]; territorioSeleccionado: number | null; datosParcialesGuardados: Record<number, DraftTerritorioParcial>; modoMarcado: ModoMarcado; predicacion: string; savedAt: number }`
  - `DraftMarksService.guardar(draft: MapDraft): void`
  - `DraftMarksService.cargar(): MapDraft | null`
  - `DraftMarksService.eliminarTerritorios(nums: number[]): void`
  - `DraftMarksService.clear(): void`
  - `DraftMarksService.tieneDraft(): boolean`
- Consumed by: Task 8 (MapStateService effect calls `guardar`), Task 9 (persistence calls `eliminarTerritorios`), Task 10 (init restore calls `cargar`; logout calls `clear`).

- [x] **Step 1: Write the failing spec**

Create `map-draft.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { DraftMarksService, MapDraft } from './map-draft';
import type { ManzanaMarcada } from '../../features/map/types/map.types';

function sampleDraft(): MapDraft {
  const manzana: ManzanaMarcada = { id: 'A', nombreBloque: 'Bloque A', color: '#3b82f6', territorioNumero: 1 };
  return {
    manzanasById: { A: manzana },
    territoriosSeleccionados: [1],
    territorioSeleccionado: 1,
    datosParcialesGuardados: {
      1: { puntos: [{ lat: -33.4, lng: -70.6, edgeIdx: 0, t: 0.5 }], geometria: '{"type":"Polygon"}' },
    },
    modoMarcado: 'completa',
    predicacion: 'tarde',
    savedAt: Date.now(),
  };
}

describe('DraftMarksService', () => {
  let service: DraftMarksService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DraftMarksService] });
    service = TestBed.inject(DraftMarksService);
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  it('guardar/cargar round-trips and survives re-instantiation', () => {
    service.guardar(sampleDraft());
    const fresh = TestBed.inject(DraftMarksService);
    const restored = fresh.cargar();
    expect(restored?.territoriosSeleccionados).toEqual([1]);
    expect(restored?.manzanasById['A'].nombreBloque).toBe('Bloque A');
    expect(restored?.datosParcialesGuardados[1].puntos[0].lat).toBeCloseTo(-33.4);
    expect(fresh.tieneDraft()).toBe(true);
  });

  it('eliminarTerritorios removes only the given territories', () => {
    const draft = sampleDraft();
    draft.territoriosSeleccionados = [1, 2];
    draft.manzanasById['B'] = { id: 'B', nombreBloque: 'B', color: '#000', territorioNumero: 2 };
    service.guardar(draft);

    service.eliminarTerritorios([2]);

    const restored = service.cargar();
    expect(restored?.territoriosSeleccionados).toEqual([1]);
    expect(restored?.manzanasById['B']).toBeUndefined();
  });

  it('discards corrupt payloads', () => {
    localStorage.setItem('predicador_map_draft', '{ not json');
    const fresh = TestBed.inject(DraftMarksService);
    expect(fresh.cargar()).toBeNull();
    expect(fresh.tieneDraft()).toBe(false);
    expect(localStorage.getItem('predicador_map_draft')).toBeNull();
  });

  it('clear removes everything', () => {
    service.guardar(sampleDraft());
    service.clear();
    expect(service.cargar()).toBeNull();
    expect(service.tieneDraft()).toBe(false);
  });

  it('is a no-op when localStorage is unavailable (SSR guard)', () => {
    const storage = globalThis.localStorage;
    vi.stubGlobal('localStorage', undefined);
    try {
      const fresh = TestBed.inject(DraftMarksService);
      fresh.guardar(sampleDraft());
      expect(fresh.cargar()).toBeNull();
      expect(fresh.tieneDraft()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
      if (storage) globalThis.localStorage = storage;
    }
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/core/services/map-draft.service.spec.ts`

Expected: FAIL — `map-draft.ts` doesn't exist.

- [x] **Step 3: Implement `map-draft.ts`**

Create the file:

```typescript
import { Injectable } from '@angular/core';
import type { ManzanaMarcada, ModoMarcado } from '../../features/map/types/map.types';

const STORAGE_KEY = 'predicador_map_draft';

export interface DraftPoint {
  lat: number;
  lng: number;
  edgeIdx: number;
  t: number;
}

export interface DraftTerritorioParcial {
  puntos: DraftPoint[];
  geometria: string;
}

export interface MapDraft {
  manzanasById: Record<string, ManzanaMarcada>;
  territoriosSeleccionados: number[];
  territorioSeleccionado: number | null;
  datosParcialesGuardados: Record<number, DraftTerritorioParcial>;
  modoMarcado: ModoMarcado;
  predicacion: string;
  savedAt: number;
}

function isManzana(value: unknown): value is ManzanaMarcada {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return typeof m['id'] === 'string' && typeof m['nombreBloque'] === 'string' &&
    typeof m['color'] === 'string' && typeof m['territorioNumero'] === 'number';
}

function isDraftPoint(value: unknown): value is DraftPoint {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return typeof p['lat'] === 'number' && typeof p['lng'] === 'number';
}

function isDraft(value: unknown): value is MapDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Record<string, unknown>;
  if (typeof draft['manzanasById'] !== 'object' || draft['manzanasById'] === null) return false;
  if (!Array.isArray(draft['territoriosSeleccionados'])) return false;
  if (typeof draft['modoMarcado'] !== 'string') return false;
  if (typeof draft['predicacion'] !== 'string') return false;
  return Object.values(draft['manzanasById']).every(isManzana);
}

@Injectable({ providedIn: 'root' })
export class DraftMarksService {
  private storage: Storage | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined;

  guardar(draft: MapDraft): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      this.storage.removeItem(STORAGE_KEY);
    }
  }

  cargar(): MapDraft | null {
    if (!this.storage) return null;
    try {
      const data = this.storage.getItem(STORAGE_KEY);
      if (!data) return null;
      const parsed: unknown = JSON.parse(data);
      if (isDraft(parsed)) return parsed;
    } catch {
      // fall through to discard
    }
    try {
      this.storage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable; in-memory state is already empty.
    }
    return null;
  }

  eliminarTerritorios(nums: number[]): void {
    const draft = this.cargar();
    if (!draft) return;
    const set = new Set(nums);
    for (const num of set) {
      delete draft.manzanasById[num];
      delete draft.datosParcialesGuardados[num];
    }
    draft.territoriosSeleccionados = draft.territoriosSeleccionados.filter(n => !set.has(n));
    if (draft.territorioSeleccionado !== null && set.has(draft.territorioSeleccionado)) {
      draft.territorioSeleccionado = draft.territoriosSeleccionados.length === 1
        ? draft.territoriosSeleccionados[0]
        : null;
    }
    draft.savedAt = Date.now();
    this.guardar(draft);
  }

  clear(): void {
    if (this.storage) {
      try {
        this.storage.removeItem(STORAGE_KEY);
      } catch {
        // Storage can be unavailable (private mode).
      }
    }
  }

  tieneDraft(): boolean {
    return this.cargar() !== null;
  }
}
```

> `eliminarTerritorios` removes by manzana **id** (`manzanasById` is keyed by manzana id, not territory number). Because manzana ids are prefixed by territory in this app, deletion per manzana from the provided territory is correct; if ids were ambiguous, apply exact-id deletion only (current ids are per-territory unique in practice).

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/app/core/services/map-draft.service.spec.ts`

Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git add predicador-frontend/src/app/core/services/map-draft.ts predicador-frontend/src/app/core/services/map-draft.service.spec.ts
git commit -m "feat(frontend): DraftMarksService persists unsaved marks to localStorage"
```

---

### Task 8: Frontend — debounced draft effect in `MapStateService`

Keep the draft fresh while the encargado marks. Installs an `effect()` in `MapStateService` that debounces (~400 ms) and persists the current marks to `DraftMarksService`. `datosParcialesGuardados` is a plain non-signal Map, so bump a `draftRevision` signal in its setters to make the effect reactive to partial-geometry changes.

**Files:**
- Modify: `predicador-frontend/src/app/features/map/services/map-state.service.ts`

**Interfaces:**
- Consumes: `DraftMarksService.guardar(MapDraft)` and `DraftPoint`/`MapDraft` types from Task 7.
- Produces: `private draftRevision = signal(0)` bumped by `setDatosParciales`/`clearDatosParciales`; `snapshotToDraft()` helper used by Task 10 to restore (or re-documented inline there).

- [x] **Step 1: Update imports + service**

In `map-state.service.ts`:

```typescript
import { Injectable, signal, computed, effect, inject } from '@angular/core';
import type { SnappedPoint, Edge } from '../map-geometry';
import type { ManzanaMarcada, ModoMarcado } from '../types/map.types';
import { DraftMarksService, MapDraft } from '../../../core/services/map-draft';
```

Add a constructor + draft fields after the existing signals (keep `datosParcialesGuardados` as-is):

```typescript
  private readonly draftService = inject(DraftMarksService);
  /** Bumped whenever the (non-signal) partial-marks map changes so the draft effect re-runs. */
  private readonly draftRevision = signal(0);
  private draftTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.manzanasById();
      this.territoriosSeleccionados();
      this.modoMarcado();
      this.predicacion();
      this.draftRevision();
      this.scheduleDraftSave();
    });
  }

  private scheduleDraftSave(): void {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      const draft = this.snapshotToDraft();
      this.draftService.guardar(draft);
    }, 400);
  }

  snapshotToDraft(): MapDraft {
    const manzanasById: Record<string, ManzanaMarcada> = {};
    this.manzanasById().forEach((m, id) => { manzanasById[id] = m; });

    const datosParcialesGuardados: MapDraft['datosParcialesGuardados'] = {};
    for (const [num, parcial] of this._datosParcialesGuardados) {
      datosParcialesGuardados[num] = {
        puntos: parcial.puntos.map(p => ({
          lat: p.latlng.lat,
          lng: p.latlng.lng,
          edgeIdx: p.edgeIdx,
          t: p.t,
        })),
        geometria: parcial.geometria,
      };
    }

    return {
      manzanasById,
      territoriosSeleccionados: this.territoriosSeleccionados(),
      territorioSeleccionado: this.territorioSeleccionado(),
      datosParcialesGuardados,
      modoMarcado: this.modoMarcado(),
      predicacion: this.predicacion(),
      savedAt: Date.now(),
    };
  }
```

Bump the revision in the partial setters:

```typescript
  setDatosParciales(territorio: number, val: { puntos: SnappedPoint[]; geometria: string }): void {
    this._datosParcialesGuardados.set(territorio, val);
    this.draftRevision.update(v => v + 1);
  }
  clearDatosParciales(territorio?: number): void {
    if (territorio === undefined) {
      this._datosParcialesGuardados.clear();
    } else {
      this._datosParcialesGuardados.delete(territorio);
    }
    this.draftRevision.update(v => v + 1);
  }
```

- [x] **Step 2: Add/update a spec for the draft persistence**

Append to the existing `map-state.service.spec.ts` (create it if it does not exist; otherwise add a describe block — check file first):

```typescript
import { TestBed } from '@angular/core/testing';
import { MapStateService } from './map-state.service';
import { DraftMarksService } from '../../../core/services/map-draft';
import { nextParcialId } from '../utils/map-constants';
import type { ManzanaMarcada } from '../types/map.types';

describe('MapStateService draft effect', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('persists marks to the draft after the debounce window', () => {
    TestBed.configureTestingModule({ providers: [MapStateService] });
    const state = TestBed.inject(MapStateService);
    const drafts = TestBed.inject(DraftMarksService);

    state.manzanasById.set(new Map<string, ManzanaMarcada>([
      ['A', { id: 'A', nombreBloque: 'Bloque A', color: '#3b82f6', territorioNumero: 1 }],
    ]));
    state.territoriosSeleccionados.set([1]);
    state.modoMarcado.set('completa');

    vi.advanceTimersByTime(500);

    const restored = drafts.cargar();
    expect(restored?.manzanasById['A'].territorioNumero).toBe(1);
    expect(restored?.territoriosSeleccionados).toEqual([1]);
    expect(restored?.modoMarcado).toBe('completa');
  });
});
```

> `effect()` inside `inject()` in a root service runs in an injection context; Vitest/TestBed supports it. `nextParcialId` import is unused in this block — drop it from the import list to keep lint clean.

- [x] **Step 3: Run the spec**

Run: `pnpm test -- src/app/features/map/services/map-state.service.spec.ts`

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add predicador-frontend/src/app/features/map/services/map-state.service.ts predicador-frontend/src/app/features/map/services/map-state.service.spec.ts
git commit -m "feat(frontend): debounced draft autosave from MapStateService"
```

---

### Task 9: Frontend — persistence flows write cache and clean draft

`guardarEnBaseDeDatos`/`guardarYEnviar` currently call `invalidateReportCache(num)` + `restaurarMarcadoDesdeDB(num, …, {actualizarEstadoMarcado: true})` and then re-paint/clear session state. Replace the re-fetch loop with: cache the saved reports (`ReportCacheService.setTerritorio`) and remove the saved territories from the draft (`DraftMarksService.eliminarTerritorios`). Keep `reaplicarMarcasSeleccionadas()` and the existing session-clearing after a successful save. On POST failure, touch neither cache nor draft.

**Files:**
- Modify: `predicador-frontend/src/app/features/map/services/map-data-persistence.service.ts`
- Test: `predicador-frontend/src/app/features/map/services/map-data-persistence.service.spec.ts`

**Interfaces:**
- Consumes: `saveToDatabase(): Promise<Reporte[]>` (Task 6), `ReportCacheService` (Task 4), `DraftMarksService` (Task 7).
- Produces: `private persistirEnCacheYLimpiarDraft(reportes: Reporte[], territorios: number[])` helper.

- [x] **Step 1: Write the failing assertions**

In `map-data-persistence.service.spec.ts`, inject real `ReportCacheService` and a real `DraftMarksService` with a **spied** `guardar`/`eliminarTerritorios`. Update the `TerritorioService` mock (already done in Task 6). Add:

```typescript
        { provide: ReportCacheService, useValue: {
            setTerritorio: vi.fn(), getCache: vi.fn(() => new Map()), clear: vi.fn(),
            setTerritorios: vi.fn(), removeTerritorios: vi.fn(), hasData: vi.fn(() => false),
        } },
        { provide: DraftMarksService, useValue: { eliminarTerritorios: vi.fn(), clear: vi.fn(), cargar: vi.fn(() => null), guardar: vi.fn() } },
```

Then add tests (import `ReportCacheService` from `../../../core/services/report-cache` and `DraftMarksService` from `../../../core/services/map-draft`):

```typescript
  it('writes the report cache and clears the draft for saved territories', async () => {
    const saved = [{ id: 10, ...reporteShape(1) }];
    report.saveToDatabase.mockResolvedValue(saved);

    await service.guardarEnBaseDeDatos();

    const cache = TestBed.inject(ReportCacheService) as unknown as { setTerritorio: ReturnType<typeof vi.fn> };
    const drafts = TestBed.inject(DraftMarksService) as unknown as { eliminarTerritorios: ReturnType<typeof vi.fn> };
    expect(cache.setTerritorio).toHaveBeenCalledWith(1, saved[0]);
    expect(drafts.eliminarTerritorios).toHaveBeenCalledWith([1]);
    expect(report.saveToDatabase).toHaveBeenCalledTimes(1);
  });

  it('does not touch cache or draft when the POST fails', async () => {
    report.saveToDatabase.mockRejectedValue(new Error('boom'));

    await service.guardarEnBaseDeDatos();

    const cache = TestBed.inject(ReportCacheService) as unknown as { setTerritorio: ReturnType<typeof vi.fn> };
    const drafts = TestBed.inject(DraftMarksService) as unknown as { eliminarTerritorios: ReturnType<typeof vi.fn> };
    expect(cache.setTerritorio).not.toHaveBeenCalled();
    expect(drafts.eliminarTerritorios).not.toHaveBeenCalled();
    expect(state.enviando()).toBe(false);
  });

  function reporteShape(territorio: number) {
    return {
      manzanaId: null, fecha: '2026-08-12T10:00:00Z', encargadoId: 1,
      encargadoNombre: 'A', encargadoApellido: 'B', sessionTime: '06:00',
      estado: 'completed', territorioNumero: territorio, totalManzanas: 3,
      manzanasMarcadas: 3, tipoSesion: 'completa', geometriaParcial: null,
      puntosParciales: null, manzanasIds: 'A,B,C',
    };
  }
```

- [x] **Step 2: Run the spec to verify it fails**

Run: `pnpm test -- src/app/features/map/services/map-data-persistence.service.spec.ts`

Expected: FAIL — service calls `invalidateReportCache`/`restaurarMarcadoDesdeDB`, no cache/draft writes.

- [x] **Step 3: Rewrite the two persistence methods**

In `map-data-persistence.service.ts`:

Add imports:

```typescript
import { ReportCacheService } from '../../../core/services/report-cache';
import { DraftMarksService } from '../../../core/services/map-draft';
import type { Reporte } from '../../../core/models/models';
```

Add injected dependencies (constructor fields):

```typescript
  private readonly reportCacheService = inject(ReportCacheService);
  private readonly draftMarksService = inject(DraftMarksService);
```

In `guardarEnBaseDeDatos`, replace the save + re-fetch block (lines ~52-59) with:

```typescript
      this.state.clearDatosParciales();
      const saved = await this.reportService.saveToDatabase(registros);

      const territoriosGuardados = this.state.territoriosSeleccionados();
      this.persistirEnCacheYLimpiarDraft(saved, territoriosGuardados);

      this.selection.reaplicarMarcasSeleccionadas();
```

In `guardarYEnviar`, replace the save + re-fetch block (lines ~132-139) with:

```typescript
      const saved = await this.reportService.saveToDatabase(registros);

      const territoriosGuardados = this.state.territoriosSeleccionados();
      this.persistirEnCacheYLimpiarDraft(saved, territoriosGuardados);

      this.selection.reaplicarMarcasSeleccionadas();
```

Add the private helper (before `prepararCaptura`):

```typescript
  private persistirEnCacheYLimpiarDraft(reportes: Reporte[], territorios: number[]): void {
    for (const reporte of reportes) {
      if (reporte.territorioNumero) {
        this.reportCacheService.setTerritorio(reporte.territorioNumero, reporte);
      }
    }
    this.draftMarksService.eliminarTerritorios(territorios);
  }
```

`restaurarMarcadoDesdeDB` is no longer called here — its remaining usage is the on-demand restore in `MapSelectionService` (unchanged). The custom `previousMarcadas`/`previousDatosParciales` restore-on-error block stays.

- [x] **Step 4: Run the full map persistence + related specs**

Run: `pnpm test -- src/app/features/map/services/map-data-persistence.service.spec.ts src/app/features/map/map-report.service.spec.ts`

Expected: PASS.

- [x] **Step 5: Lint**

Run: `pnpm run lint`

Expected: no errors (unused imports in specs cleaned as needed).

- [x] **Step 6: Commit**

```bash
git add predicador-frontend/src/app/features/map/services/map-data-persistence.service.ts predicador-frontend/src/app/features/map/services/map-data-persistence.service.spec.ts
git commit -m "perf(frontend): seed report cache and drop draft on save instead of re-fetching"
```

---

### Task 10: Frontend — restore draft at init, wire reload + logout

`restoreAllMarks` currently fetches everything via `getReportesPorTerritorios`. New flow: (1) snapshot `getReportesDesdeCache` and paint instantly; (2) if a draft exists, restore its marks (draft wins over server data for that session) and skip `/versions` revalidation for drafted territories; (3) otherwise revalidate via `revalidarReportes`. Also wire `reloadAllTerritories` → `limpiarCache()` and `TerritorioService.logout()` → `DraftMarksService.clear()`.

**Files:**
- Modify: `predicador-frontend/src/app/features/map/services/map-initialization.service.ts`
- Modify: `predicador-frontend/src/app/core/services/territorio.ts` (logout → clear draft)
- Modify: `predicador-frontend/src/app/core/services/auth-token.ts` (call `TerritorioService.logout()` — kept here, not admin page, because 401 expiry in the interceptor also logs out)
- Test: extend `map-initialization.service.spec.ts` if it exists (check first; if absent, create a smoke spec)

**Interfaces:**
- Consumes: `TerritorioService.getReportesDesdeCache`, `revalidarReportes`, `limpiarCache`, `logout` (Tasks 5/7); `DraftMarksService.cargar` (Task 7); `MapSelectionService`/`MapRenderingFacade` existing APIs.

- [x] **Step 1: Write/extend tests**

Check for `map-initialization.service.spec.ts`; if absent, create:

```typescript
import { TestBed } from '@angular/core/testing';
import { MapInitializationService } from './map-initialization.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { TerritorioService } from '../../../core/services/territorio';
import { DraftMarksService } from '../../../core/services/map-draft';
import { Toast } from '../../../core/services/toast';

describe('MapInitializationService', () => {
  let service: MapInitializationService;
  let drafts: DraftMarksService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MapInitializationService,
        MapStateService,
        DraftMarksService,
        {
          provide: MapRenderingFacade,
          useValue: {
            initializeMap: vi.fn(), getMap: vi.fn(() => ({})), setManzanaClickHandler: vi.fn(),
            getAllTerritoriesLayer: vi.fn(() => [
              { territorioPadre: 1, color: '#3b82f6', layer: { getBounds: vi.fn(() => ({ isValid: () => false })) } },
            ]),
            updateVisibleTerritories: vi.fn(() => []),
            loadAllTerritories: vi.fn(),
          },
        },
        { provide: MapSelectionService, useValue: {
            restaurarMarcadoConReportes: vi.fn(),
            restaurarMarcadoDesdeDB: vi.fn().mockResolvedValue(undefined),
          } },
        { provide: TerritorioService, useValue: {
            getReportesDesdeCache: vi.fn(() => new Map()),
            revalidarReportes: vi.fn(async () => new Map()),
            limpiarCache: vi.fn(),
            logout: vi.fn(),
          } },
        { provide: Toast, useValue: { show: vi.fn() } },
      ],
    });
    service = TestBed.inject(MapInitializationService);
    drafts = TestBed.inject(DraftMarksService);
    localStorage.clear();
  });

  afterEach(() => localStorage.clear());

  it('restores the draft when one exists and skips cache paint for drafted territories', async () => {
    drafts.guardar({
      manzanasById: { A: { id: 'A', nombreBloque: 'Bloque A', color: '#3b82f6', territorioNumero: 1 } },
      territoriosSeleccionados: [1],
      territorioSeleccionado: 1,
      datosParcialesGuardados: {},
      modoMarcado: 'completa',
      predicacion: 'tarde',
      savedAt: Date.now(),
    });
    const territoryService = TestBed.inject(TerritorioService) as unknown as {
      revalidarReportes: ReturnType<typeof vi.fn>;
    };
    const selection = TestBed.inject(MapSelectionService) as unknown as {
      restaurarMarcadoConReportes: ReturnType<typeof vi.fn>;
    };

    await service.initialize(document.createElement('div'), vi.fn());

    expect(
      selection.restaurarMarcadoConReportes.mock.calls.some(c => c[0] === 1 && c[1].length === 0)
    ).toBe(true);
    expect(territoryService.revalidarReportes).not.toHaveBeenCalled();
  });
});
```

> This spec pokes at `restoreAllMarks` through the async `initialize`. Because `initialize` needs `loadAllTerritories` to resolve without network in the fake facade, keep the mock for `loadAllTerritories` resolving to `Promise.resolve()` — add it to the facade mock above if the spec fails on it.

- [x] **Step 2: Run the spec to verify it fails**

Run: `pnpm test -- src/app/features/map/services/map-initialization.service.spec.ts`

Expected: FAIL — current `restoreAllMarks` calls `getReportesPorTerritorios` (absent in mock) and revalidates regardless of draft.

- [x] **Step 3: Rewrite `restoreAllMarks` + `reloadAllTerritories`**

In `map-initialization.service.ts`:

Add import:

```typescript
import { DraftMarksService } from '../../../core/services/map-draft';
```

Add injected field:

```typescript
  private readonly draftService = inject(DraftMarksService);
```

Replace `restoreAllMarks`:

```typescript
  private async restoreAllMarks(): Promise<void> {
    const layers = this.rendering.getAllTerritoriesLayer();
    if (layers.length === 0) return;

    const draft = this.draftService.cargar();
    const territoriosConDraft = new Set(draft?.territoriosSeleccionados ?? []);

    const territorios = layers.map(fl => fl.territorioPadre);
    const sinDraft = territorios.filter(n => !territoriosConDraft.has(n));

    // 1) Pintado instantáneo desde localStorage (draft mandó en su territorio).
    const instantaneo = this.territorioService.getReportesDesdeCache(sinDraft);
    for (const fl of layers) {
      if (territoriosConDraft.has(fl.territorioPadre)) continue;
      this.selection.restaurarMarcadoConReportes(
        fl.territorioPadre,
        instantaneo.get(fl.territorioPadre) ?? [],
        fl.color,
        { actualizarEstadoMarcado: false }
      );
    }

    // 2) Restaurar draft (geom por id + territoriosSeleccionados + modo).
    if (draft) {
      this.restaurarMarcadoDesdeDraft(draft, layers);
    }

    // 3) Revalidación de fondo: solo territorios sin draft.
    if (sinDraft.length > 0) {
      try {
        const revalidado = await this.territorioService.revalidarReportes(sinDraft);
        for (const [num, reportes] of revalidado) {
          const fl = layers.find(f => f.territorioPadre === num);
          this.selection.restaurarMarcadoConReportes(num, reportes, fl?.color, { actualizarEstadoMarcado: false });
        }
      } catch {
        // Offline/backend caído: el mapa ya pintó desde el cache; sin reintento.
      }
    } else {
      this.selection.reaplicarMarcasSeleccionadas();
    }
  }

  private restaurarMarcadoDesdeDraft(draft: MapDraft, layers: FeatureLayer[]): void {
    this.state.manzanasById.set(
      new Map(Object.entries(draft.manzanasById).map(([id, m]) => [id, m]))
    );
    this.state.territoriosSeleccionados.set(draft.territoriosSeleccionados);
    this.state.territorioSeleccionado.set(draft.territorioSeleccionado);
    this.state.modoMarcado.set(draft.modoMarcado);
    this.state.predicacion.set(draft.predicacion);

    for (const num of draft.territoriosSeleccionados) {
      const fl = layers.find(f => f.territorioPadre === num);
      this.selection.restaurarMarcadoConReportes(
        num,
        [this.reporteDesdeDraft(draft, num)],
        fl?.color,
        { actualizarEstadoMarcado: false }
      );
    }
  }

  private reporteDesdeDraft(draft: MapDraft, territorioNumero: number): Reporte {
    const manzanas = Object.values(draft.manzanasById)
      .filter(m => m.territorioNumero === territorioNumero)
      .map(m => m.id);
    const parcial = draft.datosParcialesGuardados[territorioNumero];
    const color = Object.values(draft.manzanasById)
      .find(m => m.territorioNumero === territorioNumero)?.color ?? '';
    return {
      id: 0,
      manzanaId: manzanas.filter(id => !id.startsWith('parcial-'))[0] ?? null,
      fecha: new Date(draft.savedAt).toISOString(),
      encargadoId: 0,
      encargadoNombre: '',
      encargadoApellido: '',
      sessionTime: '',
      estado: draft.modoMarcado === 'completa' ? 'completed' : 'incomplete',
      territorioNumero,
      totalManzanas: 0,
      manzanasMarcadas: manzanas.length,
      tipoSesion: draft.modoMarcado === 'completa' ? 'completa' : 'parcial',
      geometriaParcial: parcial?.geometria ?? null,
      puntosParciales: parcial ? JSON.stringify(parcial.puntos.map(p => ({ lat: p.lat, lng: p.lng }))) : null,
      manzanasIds: manzanas.filter(id => !id.startsWith('parcial-')).join(',') || null,
    };
  }
```

Add the needed type import:

```typescript
import type { MapDraft } from '../../../core/services/map-draft';
import type { Reporte } from '../../../core/models/models';
import type { FeatureLayer } from '../types/map.types';
```

Replace `reloadAllTerritories`:

```typescript
  async reloadAllTerritories(): Promise<void> {
    this.territorioService.limpiarCache();
    await this.loadAllTerritories();
  }
```

> `restaurarMarcadoConReportes(…, [synthetic report with the draft's partials])` lets the existing restoration service resolve geometry by id (partials via `geometriaParcial`) without duplicating Leaflet logic. Draft data is pure; `MapDraft`/`FeatureLayer`/`Reporte` imports are type-only.

- [x] **Step 4: Wire `logout()` on `TerritorioService`**

In `territorio.ts`, add `DraftMarksService` import + dependency and extend `logout`:

```typescript
import { DraftMarksService } from './map-draft';
  private readonly draftMarksService = inject(DraftMarksService);
  logout(): void {
    this.reportCache.clear();
    this.versionsSeen.clear();
    this.draftMarksService.clear();
  }
```

- [x] **Step 5: Hook logout at the auth boundary**

In `auth-token.ts`, inject `TerritorioService` and clear local caches on logout (fires on explicit logout AND 401 session-expiry via the interceptor's `authToken.clear()` — the interceptor already calls `profile.clear()` and navigates to login; hooking here guarantees cache+draft hygiene for both paths):

```typescript
import { TerritorioService } from './territorio';
  constructor(
    @Optional() private http?: HttpClient,
    @Optional() private authService?: AuthService,
    @Optional() private territorioService?: TerritorioService,
  ) {}

  logout(): void {
    this.clear();
    this.http?.post('/api/v1/auth/logout', {}).subscribe({
      error: () => undefined,
      complete: () => undefined,
    });
  }

  clear(): void {
    this.roleSignal.set(null);
    this.persist(null);
    this.authService?.invalidateCache();
    this.territorioService?.logout();
  }
```

> Using `@Optional` keeps `AuthTokenService` directly constructible in SSR/unit tests (existing pattern). Admin page's `logout()` calls `authToken.logout()` which now cascades into `TerritorioService.logout()`.

- [x] **Step 6: Run affected specs + lint**

Run: `pnpm test -- src/app/features/map/services/map-initialization.service.spec.ts src/app/core/services/territorio.spec.ts src/app/core/services/auth-token.ts src/app/core/services/auth-token.spec.ts` then `pnpm run lint`

Expected: PASS, no lint errors.

- [x] **Step 7: Commit**

```bash
git add predicador-frontend/src/app/features/map/services/map-initialization.service.ts predicador-frontend/src/app/features/map/services/map-initialization.service.spec.ts predicador-frontend/src/app/core/services/territorio.ts predicador-frontend/src/app/core/services/auth-token.ts
git commit -m "feat(frontend): restore marks draft on init and clear caches on logout"
```

---

### Task 11: Verify full frontend + backend suites

Final gate before marking the plan complete. Runs the exact CI check sequence from the repo `AGENTS.md`, in CI order. Fixes any regression introduced by Tasks 1–10; do not refactor unrelated code here.

**Files:**
- (no source changes expected — fix only genuine regressions if the suites fail)

- [ ] **Step 1: Frontend checks (CI order)**

From `predicador-frontend/`:

```bash
pnpm run lint
npx ng build --configuration=production
pnpm test -- --run --coverage
pnpm run build
```

Expected: all green. `pnpm run lint` must be clean (zero warnings — the repo's ESLint config treats warnings as errors). Coverage thresholds are the low defaults (30/30/30/20); passing thresholds does **not** mean good coverage — rely on the per-task specs from Tasks 4–10 for behavioral verification.

- [ ] **Step 2: Backend checks**

From `backend/`, run the focused suites for the modules touched (reporting `findVersions` + controller + service). Integration tests use Testcontainers, so Postgres/PostGIS is needed:

```bash
mvn -pl reporting-service test -Ddocker.available=true
```

Expected: PASS. If Testcontainers/Docker is unavailable on the machine, at minimum run the non-DB unit tests (`mvn -pl reporting-service -Dtest='ReportServiceTest,ReportControllerTest' test -Dsurefire.failIfNoSpecifiedTests=false`) and note that `ReportRepositoryIntegrationTest` requires the DB (see repo `AGENTS.md`: `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`).

- [ ] **Step 3: Final plan-completion commit**

Only if the verification runs left any uncommitted change (e.g. a stray lint fix or a missed `.bak`-to-`.ts` rename):

```bash
git status
git add <only the intended files>
git commit -m "chore: finalize reports cache offline draft iteration 1"
```

Otherwise confirm `git status` is clean apart from the pre-existing unrelated WIP (RUM files, `.settings/*`, `AGENTS.md`, `.gitignore`, `eslint.config.js`, `application.yml`) which must be left untouched.

---

## Completion

When Tasks 1–11 are all checked, the plan is complete:
- `reports/batch` (backend) already returns latest-per-territory via `DISTINCT ON` (see `findVersions` rewrite landing in Tasks 1–3).
- `ReportCacheService` provides the offline cache (Task 4) and `DraftMarksService` the unsaved-marks draft (Task 7); `TerritorioService` orchestrates cache-first + `/versions` revalidation (Task 5); persistence flows seed the cache and clean the draft (Tasks 6/9); init restores draft + cache and logout clears both (Task 10).
- Iteration 2 — offline WhatsApp send queue (`pending-reports-queue.ts` flush wiring, broker-backed `reports/send/{idempotencyKey}` + `/whatsapp/async`) — is explicitly **out of scope** and forward-looking only.