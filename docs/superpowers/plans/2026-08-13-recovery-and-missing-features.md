# Recovery + Missing Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover accidentally-overwritten committed work, implement the two features that were never committed (`html-to-image` migration and marking-mode territory lock), apply the post-review requirements (restore the map view with marks visible after sending, better capture styling for incomplete territories), and verify the full marking → save → WhatsApp-send flow end-to-end.

**Architecture:** The committed HEAD (`perf/reports-latest-per-territory`, `6a657f6`) already contains the localStorage report cache, draft marks, `/versions` endpoint, pnpm, `signal<Map>`, and Postgres GeoJSON. The working tree was overwritten with older versions — Task 1 restores it. The two missing features are pure frontend changes: (1) swap the `html2canvas` dynamic import in `MapReportService.captureScreenshot` for `html-to-image`'s `toPng`, and (2) a territory select/deselect lock while a marking mode (`completa`/`parcial`) is ON — implemented at the service level (`MapInteractionService.handleMapClick`) plus a guard on the `app-territory-search` entry point (`MapPage.onTerritorioSeleccionado`). Post-send restore uses a new facade method `MapRenderingFacade.restaurarVistaConMarcas` that re-applies base + marked styles over the full map without clearing `manzanasById`. Capture styling adds `getCaptureIncompleteStyle` (thick stroke) and paints marked layers with `getMarkedManzanaStyle` so marks are visible in the screenshot.

**Tech Stack:** Angular 22 (signals, SSR, Vitest/jsdom, pnpm 9.15.0), Leaflet, `html-to-image`, Spring Boot / Java 25 backends (unchanged — no backend edits).

## Global Constraints

- **Frontend uses pnpm only** — never npm. Run checks in CI order from `predicador-frontend/`: `pnpm run lint`, `npx ng build --configuration=production`, `pnpm test -- --run --coverage`.
- Run one spec: `pnpm test -- src/path/to/file.spec.ts`. Vitest + jsdom, setup `src/test-setup.ts`.
- **TDD discipline** per task: specs first (RED), then implementation (GREEN).
- **SSR guards**: `html-to-image` is only used inside `captureScreenshot`, which already guards with `typeof document === 'undefined'`; keep that. Do not touch browser-only APIs elsewhere in SSR paths.
- **ESLint**: `no-floating-promises` is error (await promises), `@typescript-eslint/no-unused-vars` error with `caughtErrorsIgnorePattern: '^_'`, no `any` (typed guards), Prettier via `pnpm run lint:fix`.
- **No backend changes** — `/versions`, `findVersions`, optimized queries already committed. Do not touch `docs/superpowers/plans/2026-08-12-reports-localstorage-cache.md` or any `target/`, `dist/`, `coverage/` artifact.
- `pending-reports-queue.ts` (untracked) stays unwired — do NOT touch it. `whatsapp-simulation/`, `territorios.geojson`, `scripts/`, `pnpm-workspace.yaml`, `.opencode/`, `.agents/`, `.claude/`, `.github/workflows/security.yml` are untracked and must be preserved.
- **Task 1 must NOT revert the working-tree design doc** `docs/superpowers/specs/2026-08-13-recovery-and-missing-features-design.md` (it holds the post-review Steps 4-6 not present in commit `3d57ba9`) — exclude it from `git restore .`.
- Commit messages in repo style: lowercase Conventional Commits (`feat(frontend):`, `test:`, `refactor:`, `docs(spec):`).

---

### Task 1: Restore the committed working tree (exclude design doc)

The working tree contains older versions of tracked files; HEAD is the correct/newer state. Restore tracked files to HEAD while preserving the updated design doc (post-review requirements) and all untracked files.

**Files:**
- Restore: all `M` tracked files.
- Exclude from restore: `docs/superpowers/specs/2026-08-13-recovery-and-missing-features-design.md`.

- [ ] **Step 1: Verify pre-restore state**

```bash
git status --short | wc -l
git diff --name-only docs/superpowers/specs/2026-08-13-recovery-and-missing-features-design.md
```

Confirm the design doc is modified vs HEAD (it must survive).

- [ ] **Step 2: Restore tracked files to HEAD, excluding the design doc**

```bash
git restore . -- ':!docs/superpowers/specs/2026-08-13-recovery-and-missing-features-design.md'
git status --short
```

Expected: no `M` lines for source/config files; remaining changes = the design doc `M` plus `??` untracked (`docs/superpowers/plans/2026-08-13-recovery-and-missing-features.md`, `.opencode/`, `.agents/`, `.claude/`, `.github/workflows/security.yml`, `backend/.../Encargado*Request.java`, `predicador-frontend/package-lock.json`, `predicador-frontend/pnpm-workspace.yaml`, `pending-reports-queue.ts`, `whatsapp-simulation/`, `scripts/`, `territorios.geojson`).

- [ ] **Step 3: Verify HEAD key features are back**

```bash
grep -n "packageManager" predicador-frontend/package.json
grep -n "signal<Map>" predicador-frontend/src/app/features/map/services/map-state.service.ts
grep -n "findVersions" backend/reporting-service/src/main/java/com/predicador/reporting/repository/ReportRepository.java
```

Expected: `packageManager: "pnpm@9.15.0"`, `signal<Map>` present, `findVersions` present.

- [ ] **Step 4: Baseline sanity check (frontend)**

```bash
cd predicador-frontend && pnpm install
pnpm test -- --run
```

Expected: suite green (this is the committed baseline). If Testcontainers/Docker backend tests are skipped, that is fine — frontend only.

- [ ] **Step 5: Commit the updated design doc so it is not lost**

```bash
git add docs/superpowers/specs/2026-08-13-recovery-and-missing-features-design.md
git commit -m "docs(spec): add post-review requirements: restore-with-marks, capture quality, E2E verification"
```

---

### Task 2: Migrate `html2canvas` → `html-to-image`

**Files:**
- Modify: `predicador-frontend/src/app/features/map/map-report.service.ts` (`captureScreenshot`, ~line 114)
- Test: `predicador-frontend/src/app/features/map/map-report.service.spec.ts`

**Interfaces:**
- Produces: `captureScreenshot(prepararCaptura, restaurarMapaPostCaptura): Promise<string | null>` now returns the base64 body of an HTML canvas PNG via `html-to-image` `toPng`, keeping the `dataUrl.split(',')[1]` shape so `buildWhatsAppRequest.screenshotBase64` is unchanged.

- [ ] **Step 1: Update the failing spec (mock swap + dataUrl assertion)**

In `map-report.service.spec.ts`, replace the module mock:

```ts
vi.mock('html-to-image', () => ({
  toPng: vi.fn().mockRejectedValue(new Error('capture failed')),
}));
```

Update the `'restores map state when screenshot rendering fails'` test to keep expecting `rejects.toThrow('capture failed')` (the new mock rejects by default, same as before). Add a success-path test:

```ts
it('returns the base64 body of the captured element', async () => {
  const mapElement = document.createElement('div');
  mapElement.id = 'map';
  document.body.appendChild(mapElement);
  const toPng = (await import('html-to-image')).toPng as ReturnType<typeof vi.fn>;
  toPng.mockResolvedValue('data:image/png;base64,ABC123');

  await expect(service.captureScreenshot(vi.fn().mockResolvedValue(undefined), restoreMap)).resolves.toBe('ABC123');

  expect(toPng).toHaveBeenCalledWith(mapElement, expect.objectContaining({ pixelRatio: expect.any(Number) }));
  expect(restoreMap).toHaveBeenCalledOnce();
  mapElement.remove();
});
```

- [ ] **Step 2: Run the spec to confirm it fails**

```bash
cd predicador-frontend && pnpm test -- src/app/features/map/map-report.service.spec.ts
```

Expected: FAIL — module `html-to-image` not installed/mocked, or `toPng` not exported.

- [ ] **Step 3: Swap the dependency**

```bash
pnpm remove html2canvas
pnpm add html-to-image
```

- [ ] **Step 4: Replace the capture implementation**

In `predicador-frontend/src/app/features/map/map-report.service.ts`, replace:

```ts
const html2canvas = (await import('html2canvas')).default;
const canvas = await html2canvas(mapElement, {
  useCORS: true,
  scale: 1,
  backgroundColor: null,
  logging: false
});
const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
return dataUrl.split(',')[1];
```

with:

```ts
const { toPng } = await import('html-to-image');
const dataUrl = await toPng(mapElement, { useCORS: true, pixelRatio: 2, cacheBust: true });
return dataUrl.split(',')[1];
```

> `pixelRatio: 2` ≈ the old `scale` but sharper for the WhatsApp screenshot; `cacheBust: true` forces fresh tile fetches. SSR guard (`typeof document === 'undefined'`) already short-circuits before this import.

- [ ] **Step 5: Run the spec to confirm it passes**

```bash
pnpm test -- src/app/features/map/map-report.service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add predicador-frontend/package.json predicador-frontend/pnpm-lock.yaml
git add predicador-frontend/src/app/features/map/map-report.service.ts predicador-frontend/src/app/features/map/map-report.service.spec.ts
git commit -m "feat(frontend): migrate map screenshot capture from html2canvas to html-to-image"
```

---

### Task 3: Marking-mode territory lock (select/deselect blocked while `completa`/`parcial`)

Two entry points can change the territory selection: leaflet map clicks (`MapInteractionService.handleMapClick`) and the `app-territory-search` widget (`MapPage.onTerritorioSeleccionado`). Both must be guarded while a marking mode is ON. In HEAD, `completa` already returns `none` for foreign-territory clicks (silently), but `parcial` has a real bypass: an **already-marked** manzana in another territory returns `toggle_manzana` (it is checked before the selected-territory guard).

**Files:**
- Modify: `predicador-frontend/src/app/features/map/services/map-interaction.service.ts`
- Modify: `predicador-frontend/src/app/features/map/map.ts`
- Modify: `predicador-frontend/src/app/features/map/utils/map-constants.ts`
- Test: `predicador-frontend/src/app/features/map/services/map-interaction.service.spec.ts`
- Test: `predicador-frontend/src/app/features/map/map.spec.ts`

**Interfaces:**
- Adds `TOAST_MESSAGES.territoryLock` (e.g. `'No se puede cambiar de territorio mientras se marca'`).
- `MapInteractionService` gains a `Toast` injection; `handleMapClick` shows the toast and returns `{ action: 'none' }` for foreign-territory hits in `completa`/`parcial`.
- `MapPage.onTerritorioSeleccionado` returns early (with toast) when a non-empty selection arrives while `modoMarcado() !== 'none'`, blocking the search widget. Mode `none` behavior is unchanged (`select_territory`/`toggle_manzana` proceed).

- [ ] **Step 1: Write the failing specs**

In `map-interaction.service.spec.ts`:

```ts
let toast: { show: ReturnType<typeof vi.fn> };
// in beforeEach providers:
//   { provide: Toast, useValue: toast },
// with toast = { show: vi.fn() }
```

Add to `describe('modo completa')`:

```ts
it('locks and toasts on a foreign-territory manzana click', () => {
  state.modoMarcado.set('completa');
  state.territoriosSeleccionados.set([5]);
  rendering.getManzanaIndex.mockReturnValue([fakeManzana('m1', 9)]);

  const result = service.handleMapClick(clickAt(0.5, 0.5));

  expect(result.action).toBe('none');
  expect(toast.show).toHaveBeenCalled();
});
```

Add to `describe('modo parcial')` — this is the regression that catches the HEAD bypass:

```ts
it('does NOT toggle an already-marked manzana of a foreign territory (lock + toast)', () => {
  state.modoMarcado.set('parcial');
  state.territoriosSeleccionados.set([5]);
  rendering.getManzanaIndex.mockReturnValue([fakeManzana('m9', 9)]);
  state.manzanasById.set(new Map([['m9', { id: 'm9', nombreBloque: 'Bloque-m9', color: '#ff0000', territorioNumero: 9 }]]));

  const result = service.handleMapClick(clickAt(0.5, 0.5));

  expect(result.action).toBe('none');
  expect(result.manzana).toBeUndefined();
  expect(toast.show).toHaveBeenCalled();
});
```

In `describe('modo none')` add a guard test (unchanged behavior):

```ts
it('still selects a foreign territory in mode none', () => {
  state.modoMarcado.set('none');
  rendering.getManzanaIndex.mockReturnValue([fakeManzana('m9', 9)]);

  const result = service.handleMapClick(clickAt(0.5, 0.5));

  expect(result.action).toBe('select_territory');
  expect(toast.show).not.toHaveBeenCalled();
});
```

In `map.spec.ts` `describe('onTerritorioSeleccionado')` (the `app-territory-search` entry point):

```ts
let toast: { show: ReturnType<typeof vi.fn> };
// in providers: { provide: Toast, useValue: toast }

it('blocks selection via the search widget while a marking mode is active', async () => {
  state.modoMarcado.set('completa');

  await component.onTerritorioSeleccionado([5]);

  expect(selection.prepareTerritorioSeleccionado).not.toHaveBeenCalled();
  expect(toast.show).toHaveBeenCalled();
});

it('allows selection via the search widget in mode none', async () => {
  selection.prepareTerritorioSeleccionado.mockReturnValue([5]);
  rendering.getFeatureLayerByTerritorio.mockReturnValue({ territorioPadre: 5, color: '#ff0000', layer: {} });

  await component.onTerritorioSeleccionado([5]);

  expect(selection.prepareTerritorioSeleccionado).toHaveBeenCalledWith([5]);
  expect(toast.show).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the specs to confirm they fail**

```bash
pnpm test -- src/app/features/map/services/map-interaction.service.spec.ts src/app/features/map/map.spec.ts
```

Expected: FAIL — toast not injected yet; `parcial` still returns `toggle_manzana`; search guard missing.

- [ ] **Step 3: Add the toast message**

In `map-constants.ts`, inside `TOAST_MESSAGES` (after `completeMode`):

```ts
territoryLock: 'No se puede cambiar de territorio mientras se marca',
```

- [ ] **Step 4: Implement the lock in `MapInteractionService`**

Inject `Toast`:

```ts
private readonly toastService = inject(Toast);
```

Reorder the `parcial` branch so the selected-territory guard runs **before** the `isMarked` toggle, and add toasts to both locked branches:

```ts
if (modo === 'completa') {
  const hit = this.findManzanaInside(e.latlng);
  if (hit) {
    if (this.state.territoriosSeleccionados().includes(hit.territorioNumero)) {
      return { action: 'toggle_manzana', manzana: hit };
    }
    this.toastService.show(TOAST_MESSAGES.territoryLock);
    return { action: 'none' };
  }
  return { action: 'none' };
}

if (modo === 'parcial') {
  const hit = this.findManzanaInside(e.latlng);
  if (hit) {
    // Territorio no seleccionado: bloquear antes de cualquier toggle/select
    if (!this.state.territoriosSeleccionados().includes(hit.territorioNumero)) {
      this.toastService.show(TOAST_MESSAGES.territoryLock);
      return { action: 'none' };
    }
    const isMarked = this.state.manzanasById().has(hit.id);
    if (isMarked) {
      return { action: 'toggle_manzana', manzana: hit };
    }
  }
  // ...rest unchanged (select_manzana / add_partial_point for the selected territory)
}
```

- [ ] **Step 5: Implement the guard in `MapPage.onTerritorioSeleccionado`**

In `map.ts`, at the top of `onTerritorioSeleccionado`, before the existing empty-array branch:

```ts
async onTerritorioSeleccionado(numeros: number[]): Promise<void> {
  if (numeros.length > 0 && this.modoMarcado() !== 'none') {
    this.toastService.show(TOAST_MESSAGES.territoryLock);
    return;
  }
  // ...existing logic unchanged
}
```

> This covers the `app-territory-search` widget; map-click territory changes can no longer reach here while marking because `handleMapClick` never returns `select_territory` in `completa`/`parcial`. The empty-array clean path (used by `setModoMarcado('none')` → clean) stays reachable.

- [ ] **Step 6: Run the specs to confirm they pass**

```bash
pnpm test -- src/app/features/map/services/map-interaction.service.spec.ts src/app/features/map/map.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add predicador-frontend/src/app/features/map/services/map-interaction.service.ts
git add predicador-frontend/src/app/features/map/map.ts
git add predicador-frontend/src/app/features/map/utils/map-constants.ts
git add predicador-frontend/src/app/features/map/services/map-interaction.service.spec.ts
git add predicador-frontend/src/app/features/map/map.spec.ts
git commit -m "feat(frontend): lock territory select/deselect while marking a territory"
```

---

### Task 4: Restore the full map view with the marks after saving/sending (no active selection)

Currently `guardarEnBaseDeDatos` and `guardarYEnviar` wipe the marked state after success: they clear `manzanasById` and call `restaurarVisibilidadPoligonos(marcadas, [])`, whose empty-selection path re-applies territory base style but loses the per-manzana highlight. Post-review requirement (user choice): after a successful send/save, restore the full map with the created marks still visible and **no active territory selection**; the report stays persisted (already via `persistirEnCacheYLimpiarDraft`). No re-fetch needed.

**Files:**
- Modify: `predicador-frontend/src/app/features/map/services/map-rendering.facade.ts` (new method `restaurarVistaConMarcas`)
- Modify: `predicador-frontend/src/app/features/map/services/map-data-persistence.service.ts`
- Test: `predicador-frontend/src/app/features/map/services/map-rendering.facade.spec.ts`
- Test: `predicador-frontend/src/app/features/map/services/map-data-persistence.service.spec.ts`

**Interfaces:**
- Adds `MapRenderingFacade.restaurarVistaConMarcas(manzanasMarcadaList: ManzanaMarcada[]): void`.
- `guardarEnBaseDeDatos`/`guardarYEnviar` success + catch (`whatsappSent`) paths replace the `restaurarVisibilidadPoligonos(marcadas, [])` + `manzanasById.set(new Map())` combo with `restaurarVistaConMarcas(marcadas)` and **keep** `manzanasById` (marks render from memory). Transient selection clearing stays: `territoriosSeleccionados.set([])`, `territorioSeleccionado.set(null)`, `totalManzanas.set(0)`, `clearDatosParciales()`.

- [ ] **Step 1: Write the failing facade spec**

In `map-rendering.facade.spec.ts` (mirror the existing `restaurarVisibilidadPoligonos` setup):

```ts
it('restaurarVistaConMarcas sizes the queue and re-applies marked styles for all territories', async () => {
  const fl1 = fakeFeatureLayer(1, '#a00');   // existing helper in the spec
  const fl2 = fakeFeatureLayer(2, '#0a0');
  territories.getAllTerritoriesLayer.mockReturnValue([fl1, fl2]);
  territories.getManzanaCountByTerritorio.mockReturnValue(3);

  const marked: ManzanaMarcada[] = [
    { id: 'm1', nombreBloque: 'A1', color: '#a00', territorioNumero: 1 },
    { id: 'm2', nombreBloque: 'B1', color: '#0a0', territorioNumero: 2 },
  ];

  facade.restaurarVistaConMarcas(marked);

  vi.waitFor(() => expect(styles.queueStyleUpdate).toHaveBeenCalled());
  expect(styles.cancelPendingStyleUpdates).toHaveBeenCalled();
  // assert style application uses getBaseTerritoryStyle for the territory and
  // getMarkedManzanaStyle for the marked layers via registry.get('m1')/get('m2'),
  // and territories.updateLabelsVisibility was scheduled.
});
```

- [ ] **Step 2: Run the spec to confirm it fails**

```bash
pnpm test -- src/app/features/map/services/map-rendering.facade.spec.ts
```

Expected: FAIL — `restaurarVistaConMarcas` does not exist.

- [ ] **Step 3: Add `restaurarVistaConMarcas` to the facade**

Place it next to `restaurarVisibilidadPoligonos` in `map-rendering.facade.ts`:

```ts
restaurarVistaConMarcas(manzanasMarcadaList: ManzanaMarcada[]): void {
  this.styles.cancelPendingStyleUpdates();

  this.styles.queueStyleUpdate(() => {
    for (const fl of this.territories.getAllTerritoriesLayer()) {
      this.styles.applyStyleToFeatureLayer(fl, this.computeBaseStyle(fl.territorioPadre, manzanasMarcadaList));
    }

    for (const m of manzanasMarcadaList) {
      const layer = this.registry.get(m.id);
      if (!layer) continue;
      const featureLayer = this.territories.getFeatureLayerByTerritorio(m.territorioNumero);
      if (!featureLayer) continue;
      layer.setStyle(getMarkedManzanaStyle(featureLayer.color));
    }

    this.territories.updateLabelsVisibility();
  });
}
```

> `getMarkedManzanaStyle` is already imported in this facade. Non-selected territories keep their base/completeness fill (no hiding), and every marked manzana across all territories re-gets its highlight — the "previous view with the change".

- [ ] **Step 4: Write the failing persistence specs**

In `map-data-persistence.service.spec.ts`, extend the facade + selection mocks:

```ts
{ provide: MapRenderingFacade, useValue: {
    getAllTerritoriesLayer: vi.fn().mockReturnValue([]),
    restaurarVistaConMarcas: vi.fn(),
    restaurarVisibilidadPoligonos: vi.fn(),
} },
```

Add tests:

```ts
it('restores the full view with marks (no active selection) after a successful save', async () => {
  state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]));
  const marcadas = state.manzanasMarcadaList();

  await service.guardarEnBaseDeDatos();

  const rendering = TestBed.inject(MapRenderingFacade) as unknown as {
    restaurarVistaConMarcas: ReturnType<typeof vi.fn>;
    restaurarVisibilidadPoligonos: ReturnType<typeof vi.fn>;
  };
  expect(rendering.restaurarVistaConMarcas).toHaveBeenCalledWith(expect.arrayContaining(marcadas));
  expect(rendering.restaurarVisibilidadPoligonos).not.toHaveBeenCalled();
  expect(state.territoriosSeleccionados()).toEqual([]);
  expect(state.territorioSeleccionado()).toBeNull();
  expect(state.manzanasById().size).toBeGreaterThan(0);
});

it('restores the full view with marks after a successful send', async () => {
  state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]));
  report.buildTerritoriosEnvioSoloIncompletos.mockReturnValue([
    { numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 },
  ]);
  report.sendWhatsApp.mockResolvedValue(true);
  report.buildWhatsAppRequest.mockReturnValue({
    encargadoNombre: 'A', encargadoApellido: 'B', fechaRegistro: '01-08-2026',
    predicacion: 'tarde', territorios: [], screenshotBase64: null, destinationNumber: '56912345678',
  });

  await service.guardarYEnviar();

  const rendering = TestBed.inject(MapRenderingFacade) as unknown as {
    restaurarVistaConMarcas: ReturnType<typeof vi.fn>;
    restaurarVisibilidadPoligonos: ReturnType<typeof vi.fn>;
  };
  expect(rendering.restaurarVistaConMarcas).toHaveBeenCalled();
  expect(rendering.restaurarVisibilidadPoligonos).not.toHaveBeenCalled();
  expect(state.territoriosSeleccionados()).toEqual([]);
  expect(state.manzanasById().size).toBeGreaterThan(0);
});

it('restores the full view with marks in the whatsapp-sent catch branch', async () => {
  state.manzanasById.set(new Map([['m1', { id: 'm1', nombreBloque: 'A', color: '#f00', territorioNumero: 1 }]]));
  report.buildTerritoriosEnvioSoloIncompletos.mockReturnValue([
    { numero: 1, finalizado: false, totalManzanas: 3, manzanasMarcadas: 1 },
  ]);
  report.sendWhatsApp.mockResolvedValue(true);
  report.buildWhatsAppRequest.mockReturnValue({
    encargadoNombre: 'A', encargadoApellido: 'B', fechaRegistro: '01-08-2026',
    predicacion: 'tarde', territorios: [], screenshotBase64: null, destinationNumber: '56912345678',
  });
  const rendering = TestBed.inject(MapRenderingFacade) as unknown as {
    restaurarVistaConMarcas: { mockImplementationOnce: (fn: () => void) => void };
  };
  rendering.restaurarVistaConMarcas.mockImplementationOnce(() => {
    throw new Error('boom');
  });

  await service.guardarYEnviar();

  // First call threw inside the try; the catch (whatsappSent=true) restores again and keeps marks.
  expect(state.territoriosSeleccionados()).toEqual([]);
  expect(state.manzanasById().size).toBeGreaterThan(0);
});
```

> The third test drives the `catch { ... } else { ... }` branch where `whatsappSent == true` by making the first `restaurarVistaConMarcas` call throw after `sendWhatsApp` succeeded.

- [ ] **Step 5: Run the specs to confirm they fail**

```bash
pnpm test -- src/app/features/map/services/map-data-persistence.service.spec.ts
```

Expected: FAIL — mock lacks `restaurarVistaConMarcas`; current service code clears `manzanasById` and never calls the new method.

- [ ] **Step 6: Update `guardarEnBaseDeDatos`**

Replace the success-path tail:

```ts
      // Guardar referencia ANTES de ejecutar la vista restaurada
      const marcadasParaRestaurar = this.state.manzanasMarcadaList();

      this.state.territoriosSeleccionados.set([]);
      this.state.territorioSeleccionado.set(null);
      this.state.totalManzanas.set(0);
      this.rendering.restaurarVistaConMarcas(marcadasParaRestaurar);
```

(Remove `this.rendering.restaurarVisibilidadPoligonos(marcadasParaRestaurar, [])` and `this.state.manzanasById.set(new Map())`; `manzanasById` keeps the marks so they render.)

> `clearDatosParciales()` is already invoked earlier in this method (before `saveToDatabase`); leave it there — do not duplicate.

- [ ] **Step 7: Update `guardarYEnviar` success + catch**

In the `if (success) { ... }` block replace:

```ts
        const marcadasParaRestaurar = this.state.manzanasMarcadaList();

        this.state.clearDatosParciales();
        this.state.territoriosSeleccionados.set([]);
        this.state.territorioSeleccionado.set(null);
        this.state.totalManzanas.set(0);
        this.rendering.restaurarVistaConMarcas(marcadasParaRestaurar);
```

(Remove `restaurarVisibilidadPoligonos` and `manzanasById.set(new Map())`.)

In the `catch { ... else { ... } }` branch (`whatsappSent == true`) replace:

```ts
      } else {
        this.toastService.show(TOAST_MESSAGES.saveSuccess);
        const marcadasParaRestaurar = this.state.manzanasMarcadaList();
        this.state.clearDatosParciales();
        this.state.territoriosSeleccionados.set([]);
        this.state.territorioSeleccionado.set(null);
        this.state.totalManzanas.set(0);
        this.rendering.restaurarVistaConMarcas(marcadasParaRestaurar);
      }
```

- [ ] **Step 8: Run the specs to confirm they pass**

```bash
pnpm test -- src/app/features/map/services/map-rendering.facade.spec.ts src/app/features/map/services/map-data-persistence.service.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add predicador-frontend/src/app/features/map/services/map-rendering.facade.ts
git add predicador-frontend/src/app/features/map/services/map-data-persistence.service.ts
git add predicador-frontend/src/app/features/map/services/map-rendering.facade.spec.ts
git add predicador-frontend/src/app/features/map/services/map-data-persistence.service.spec.ts
git commit -m "feat(frontend): restore full map view with marks after save/send (keep manzanasById)"
```

---

### Task 5: Capture quality — visible marks + thicker incomplete polygons

In the WhatsApp screenshot for incomplete territories (`MapCaptureService.prepararCapturaSoloIncompletos`), `styleTerritoryLayersSoloIncompletos` currently paints **every** layer with `{ opacity: 0.6, fillOpacity: 0.05, weight: 1.5 }`, making marked manzanas indistinguishable from unmarked and incomplete polygons thin.

**Files:**
- Modify: `predicador-frontend/src/app/features/map/services/map-style.service.ts` (new `getCaptureIncompleteStyle`)
- Modify: `predicador-frontend/src/app/features/map/services/map-capture.service.ts`
- Test: `predicador-frontend/src/app/features/map/services/map-style.spec.ts`
- Test: `predicador-frontend/src/app/features/map/services/map-capture.service.spec.ts`

**Interfaces:**
- Adds `getCaptureIncompleteStyle(color: string): L.PathOptions` → `{ opacity: 0.8, fillOpacity: 0.05, color, weight: 4 }` (thick stroke, low fill).
- `styleTerritoryLayersSoloIncompletos` gains a `manzanasMarcadas` parameter; marked layers get `getMarkedManzanaStyle(fl.color)` (highlight kept), unmarked layers get `getCaptureIncompleteStyle(fl.color)`. Completed territories stay hidden; `stylePartialMarks` still runs after.

- [ ] **Step 1: Write the failing style spec**

In `map-style.spec.ts`:

```ts
it('getCaptureIncompleteStyle uses a thick stroke and low fill', () => {
  expect(getCaptureIncompleteStyle('#123456')).toEqual({
    opacity: 0.8,
    fillOpacity: 0.05,
    color: '#123456',
    weight: 4,
  });
});
```

- [ ] **Step 2: Write the failing capture specs**

In `map-capture.service.spec.ts`, add a `prepararCapturaSoloIncompletos` describe using the existing `makePath`/`fakeFeatureLayer`/`fakeLabel` helpers and the existing mock shape (leaflet fake map with `fitBounds`, `getZoom`):

```ts
describe('prepararCapturaSoloIncompletos', () => {
  it('keeps marked layers highlighted and unmarked layers thick in incomplete territories', async () => {
    const markedPath = makePath('m1');          // registered via this.registry
    const unmarkedPath = makePath('m2');
    const completedPath = makePath('m3');
    // fake feature layers: territory 1 (incomplete: 2 of 3 manzanas), territory 2 (complete: 3/3)
    // getManzanaCountByTerritorio: (1) => 3, (2) => 3
    // manzanasMarcadas: [{ id: 'm1', territorioNumero: 1 }, ...]
    // engine.getMap returns fake map

    await service.prepararCapturaSoloIncompletos(marcadas, [1, 2], layers, getCount);

    expect(markedPath.setStyle).toHaveBeenCalledWith(getMarkedManzanaStyle('#a00'));
    expect(unmarkedPath.setStyle).toHaveBeenCalledWith(getCaptureIncompleteStyle('#a00'));
    expect(completedPath.setStyle).toHaveBeenCalledWith(getHiddenStyle());
  });

  it('re-applies partial polygon style over the marked layers', async () => {
    // include a ManzanaMarcada with id starting 'parcial-'
    // expect setStyle called with getPartialPolygonCompleteStyle after the incomplete styling
  });
});
```

- [ ] **Step 3: Run the specs to confirm they fail**

```bash
pnpm test -- src/app/features/map/services/map-style.spec.ts src/app/features/map/services/map-capture.service.spec.ts
```

Expected: FAIL — `getCaptureIncompleteStyle` missing; signature mismatch in `styleTerritoryLayersSoloIncompletos`.

- [ ] **Step 4: Add `getCaptureIncompleteStyle`**

In `map-style.service.ts`, next to `getCaptureUnmarkedStyle`:

```ts
export function getCaptureIncompleteStyle(color: string): L.PathOptions {
  return { opacity: 0.8, fillOpacity: 0.05, color, weight: 4 };
}
```

- [ ] **Step 5: Update `MapCaptureService`**

Import `getCaptureIncompleteStyle` alongside the existing style imports. Change `styleTerritoryLayersSoloIncompletos`:

```ts
private styleTerritoryLayersSoloIncompletos(
  allTerritoriesLayer: FeatureLayer[],
  incompletos: Set<number>,
  manzanasMarcadas: ManzanaMarcada[]
): void {
  const markedLayers = new Set<L.Path>(
    manzanasMarcadas.map(m => this.registry.get(m.id)!).filter(Boolean)
  );
  for (const fl of allTerritoriesLayer) {
    if (incompletos.has(fl.territorioPadre)) {
      fl.layer.eachLayer(l => {
        if (l instanceof L.Path) {
          l.setStyle(markedLayers.has(l) ? getMarkedManzanaStyle(fl.color) : getCaptureIncompleteStyle(fl.color));
        }
      });
    } else {
      // Completado: ocultar
      this.applyHiddenStyle(fl);
    }
  }
}
```

Update the caller `prepararCapturaSoloIncompletos`:

```ts
    // Ocultar territorios completados
    this.styleTerritoryLayersSoloIncompletos(allTerritoriesLayer, incompletos, manzanasMarcadas);
```

`stylePartialMarks(manzanasMarcadas, allTerritoriesLayer)` already runs right after and re-styles partial polygons with `getPartialPolygonCompleteStyle` — keep it.

- [ ] **Step 6: Run the specs to confirm they pass**

```bash
pnpm test -- src/app/features/map/services/map-style.spec.ts src/app/features/map/services/map-capture.service.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add predicador-frontend/src/app/features/map/services/map-style.service.ts
git add predicador-frontend/src/app/features/map/services/map-capture.service.ts
git add predicador-frontend/src/app/features/map/services/map-style.spec.ts
git add predicador-frontend/src/app/features/map/services/map-capture.service.spec.ts
git commit -m "feat(frontend): keep marks visible and thicken incomplete polygons in capture"
```

---

### Task 6: Full verification (lint, build, tests) + E2E flow

**Files:**
- None (verification only). Fix and re-commit anything that fails.

- [ ] **Step 1: Lint**

```bash
cd predicador-frontend && pnpm run lint
```

Expected: clean. Fix with `pnpm run lint:fix` if formatting-only.

- [ ] **Step 2: Production build (SSR + service worker)**

```bash
npx ng build --configuration=production
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Full frontend test suite with coverage**

```bash
pnpm test -- --run --coverage
```

Expected: all green (including the existing `map.spec.ts`, `map-*.spec.ts` suites, and the two new suites from Tasks 2-5).

- [ ] **Step 4: Backend untouched sanity check**

```bash
git status --short | grep -i backend
```

Expected: only the untracked `Encargado*Request.java` files (or nothing). No backend source was modified by these tasks.

- [ ] **Step 5: Functional E2E — marking → save → WhatsApp send (explicit user requirement)**

With the backends up (start order: `config-server` 8888 → `discovery-server` 8761 → `api-gateway` 8080 → `territory-service` 8081 → `reporting-service` 8082; or `docker compose`), drive the real app (dev server or served production build) and verify:

1. Select a territory and enter `completa` marking mode; mark several manzanas — highlights appear immediately.
2. Try clicking a manzana of a different territory while marking → blocked, toast shown (Task 3).
3. Try selecting another territory via the territory-search widget while marking → blocked, toast shown (Task 3).
4. Save → report saved, cache seeded, draft cleaned, full map restored **with the marks still visible** and **no active selection** in the toolbar (Task 4).
5. Reload the app → saved marks restored from cache/localStorage.
6. Mark more + send → WhatsApp screenshot captured; incomplete territories show **thick strokes** and **marked manzanas keep their highlight**; the message reaches the simulation/whatsapp target; afterwards marks remain visible with selection cleared and the report present in localStorage (Tasks 4 + 5).
7. Reload after send → state restored consistently.

Fix any failure and re-run Steps 1-3.

- [ ] **Step 6: Commit any fixes**

```bash
git add <fixed files>
git commit -m "fix(frontend): <what was fixed>"
```

## Out of scope

- `pending-reports-queue.ts`: stays unwired (iteration 2 per prior plan) — do NOT implement or touch its `flush()`.
- `whatsapp-simulation/`: already present as untracked files, not modified.
- Backend: none — `/versions`, `DISTINCT ON` queries, and optimized frontend cache are already committed at HEAD.
- `docs/superpowers/plans/2026-08-12-reports-localstorage-cache.md` and other prior plans: untouched.

## Success criteria

- Working tree equals HEAD for previously-overwritten committed features (Task 1); design doc with post-review requirements kept and committed.
- `html-to-image` replaces `html2canvas`; specs updated and green.
- Territory cannot be selected/deselected while marking mode is active (both map click and search widget paths); toast informs the user; mode `none` behavior unchanged — including the `parcial` marked-manzana bypass.
- After a successful send and after a successful save, the full map view is restored **with created marks still visible** and **no active territory selection**; report persisted in localStorage and restored on reload.
- WhatsApp screenshot of incomplete territories shows marks with their highlight and unmarked polygons with a thicker stroke.
- Full marking → save → WhatsApp-send flow verified end-to-end against the running app.
- `lint`, production build, and full test suite all green.