# Plan de mejora — Auditoría Angular `predicador-frontend`

> Fecha: 2026-08-01 · Angular `^22.0.0` instalado vs. `22.1.0/22.1.2` último estable (brecha menor de patch, sin saltos de mayor) · Branch: dedicado
>
> Contexto (Fase 0, confirmado por el usuario): PWA **móvil-first interna** de gestión de
> territorios y reportes de predicación. Flujos críticos: **(1) login por teléfono + sesión**,
> **(2) marcado de manzanas en el mapa** (completo y parcial), **(3) envío de reporte por
> WhatsApp con captura**. Requisito destacado: Core Web Vitals / TTFB. Tolerancia:
> **solo incremental y reversible**. CI: mantener el existente, sin endurecer umbrales.
>
> Este documento **sustituye** a la versión previa (misma fecha), que describía un estado ya
> superado: la cobertura real subió de ~24% a ~40% de líneas, los módulos de auth pasaron de
> 0% a 96–100%, `map-geometry.ts` de 1% a 87%, y `map-envio.spec.ts` (spec de vanidad) ya no existe.

## 1. Resumen ejecutivo

El frontend es un proyecto Angular 22 moderno y bien construido: standalone, **zoneless**
(`provideZonelessChangeDetection`), Signals + `computed`, control de flujo `@if/@for/@switch`,
Vitest + jsdom con cobertura V8, SSR (`provideClientHydration`, prerender solo de `/login`),
PWA (`ngsw`), interceptors propios (auth/CSRF/error), guards funcionales, lazy-loading por
feature, `OnPush` en todos los componentes y TypeScript estricto (`noImplicitReturns`,
`noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noFallthroughCasesInSwitch`).

Verificado en esta auditoría: **sin** `bypassSecurityTrust*`, **sin** `innerHTML`, **sin**
directivas legacy (`*ngIf`/`ngClass`/`@HostBinding`), `localStorage`/`document` correctamente
guardados para SSR en casi todo el código, `lint` limpio, **197 tests en verde (26 files)** y
listeners globales de error (`provideBrowserGlobalErrorListeners`) activos.

El riesgo principal **no es la técnica del código, sino la cobertura del flujo crítico #2
(marcado)**: el componente `map.ts` está a 0% y los servicios de decisión/interacción del mapa
(`map-interaction.service.ts`, `map-partial-mark.service.ts`, `map-initialization.service.ts`) a
0%. El "cerebro" de cada click en el mapa (5 acciones: `remove_partial`, `toggle_manzana`,
`select_territory`, `select_manzana`, `add_partial_point`) no tiene red de seguridad.

El plan prioriza **quick wins reversibles y sin cambio de comportamiento visible**: cerrar los
huecos de cobertura de los flujos críticos con tests de comportamiento real. No se proponen
refactors estructurales ni migraciones de alto riesgo (Signal Forms, Nx, micro-frontends,
zoneless — ya aplicado —, cambio de builder): el proyecto no los justifica hoy.

## 2. Hallazgos por severidad y área

### Crítico

| # | Área | Hallazgo | Ubicación |
|---|---|---|---|
| C1 | Testing | ~~Flujo crítico #2 (marcado) sin red de seguridad: `map.ts` (componente) 0%, `map-interaction.service.ts` 0%, `map-partial-mark.service.ts` 0%, `map-initialization.service.ts` 0%, `map-capture.service.ts` 4.2%, `map-partial-draw.service.ts` 4.76%.~~ **RESUELTO (2026-08):** specs añadidos; `map.ts` 64%, `map-interaction` 94%, `map-partial-mark` 93%, `map-initialization` 88%, `map-capture` 79%, `map-partial-draw` 63%, `map-engine` 100% (líneas). | `features/map/` (reporte de cobertura) |
| C2 | Rendimiento/PWA | ~~Leaflet CSS cargado desde CDN (`unpkg.com`) con `integrity`; es render-blocking y **no entra en el cache del service worker**, que solo cachea `/*.css` de origen. En modo offline (propósito PWA) o si unpkg falla, el mapa pierde estilos.~~ **RESUELTO (2026-08):** `leaflet.css` se bundlea localmente (`angular.json` styles) con sus imágenes en `media/`; ambos entran en ngsw (grupos `app`/`assets`) y ya no depende de unpkg. | `src/index.html:29-31`, `ngsw-config.json` |

### Alto

| # | Área | Hallazgo | Ubicación |
|---|---|---|---|
| A1 | Testing | `map-interaction.service.ts` a 0%: `handleMapClick` es la máquina de decisión del marcado (función pura sobre `MapStateService`/`MapRenderingFacade`/`MapLayerRegistry`), fácil de testear con mocks. | `features/map/services/map-interaction.service.ts` |
| A2 | Testing | `map.ts` a 0%: `map.spec.ts` solo prueba utils (`report-utils`, `territory-colors`), no el componente. El componente es una cáscara delgada (init en `afterNextRender`), de modo que la cobertura real está en los servicios; el spec actual da sensación de cobertura que no existe. | `features/map/map.ts`, `features/map/map.spec.ts` |
| A3 | Testing | Flujo de marcado parcial (flujo crítico #2) a 0–5%: `map-partial-mark.service.ts` y `map-partial-draw.service.ts` sin tests; `map-capture.service.ts` al 4.2% (captura es parte del flujo #3). | `features/map/services/` |
| A4 | Testing | Umbrales de cobertura bajos (30/30/30/20) y agregados globales: la suite pasa con `branch 26%`, sin distinguir qué flujos críticos quedan sin cubrir. El CI no protege las áreas sin tests. | `vitest.config.ts:38-43` |

### Medio

| # | Área | Hallazgo | Ubicación |
|---|---|---|---|
| M1 | Accesibilidad | `user-scalable=no` en el viewport impide el zoom de accesibilidad (falla WCAG 1.4.4 y 2.5.5). **Cambio de comportamiento visible** → requiere aprobación explícita antes de aplicarlo. | `src/index.html:7` |
| M2 | SSR | `territory-search.ts` accede a `document.documentElement` en `applyTheme()` desde `ngOnInit` **sin guard** de SSR; hoy `/map` no se prerenderiza (el guard redirige en server), pero es un riesgo latente si cambia el render mode. El resto del código sí guarda con `typeof document === 'undefined'`. | `features/map/territory-search/territory-search.ts:100-101` |
| M3 | Seguridad | `admin.guard.ts` es permisivo (`return true`). Decisión documentada (el form de admin vive en la propia ruta), pero `/admin` queda accesible a nivel de ruta; la protección real depende del backend (PUT `/territories/{n}/color` exige token admin). Defensa en profundidad pendiente. | `core/guards/admin.guard.ts:16-17` |
| M4 | Seguridad | Sin cabeceras de seguridad en el servidor SSR (`server.ts` no fija CSP, `X-Content-Type-Options`, `frame-ancestors`) y `security.allowedHosts: []` en el build (`angular.json:57-59`); `AngularNodeAppEngine` sin `allowedHosts`/`trustProxyHeaders`. Si se despliega expuesto directamente, riesgo de host-header injection/SSRF. | `src/server.ts:13`, `angular.json` |
| M5 | Seguridad/Perf | `zone.js` permanece en `dependencies` de producción aunque la app es zoneless; solo se necesita para tests (`@analogjs/vitest-angular/setup-zone`). Debe moverse a `devDependencies` o justificarse. | `package.json:35` |
| M6 | Testing | `skipTests: true` en **todos** los schematics de `angular.json`; el scaffolding nunca genera specs, lo que perpetúa la deuda de cobertura. | `angular.json:12-37` |
| M7 | Robustez | `profile.save()` y `territory-search.toggleTheme()` escriben en `localStorage` sin `try/catch` (el resto del código sí lo hace); en modo privado `setItem` puede lanzar y romper el flujo de login/creación de perfil (flujo crítico #1). | `core/services/profile.ts:44`, `territory-search.ts:106` |
| M8 | Rendimiento | `getColor(numero)` se invoca hasta 3 veces por tarjeta dentro de `@for` en el admin (30 colores × N territorios por ciclo de detección). Extraer a `computed`. | `features/admin/admin.html:95,102,103` |

### Bajo

| # | Área | Hallazgo | Ubicación |
|---|---|---|---|
| L1 | Legibilidad | `buildRegistros` y `buildTerritoriosEnvio` duplican agrupación por territorio y el conteo de `total` (`Array.from(fl.layer.getLayers()).filter(l => 'setStyle' in l).length`). Extraer helper. | `features/map/map-report.service.ts:39-47,92-99` |
| L2 | Legibilidad | La secuencia post-guardado (invalidate → restaurar → reaplicar → reset) se duplica entre `guardarEnBaseDeDatos` y `guardarYEnviar`. | `features/map/services/map-data-persistence.service.ts:49-63,115-139` |
| L3 | Estado | `map-state.service.ts` mezcla signals reactivas con getters/setters imperativos mutables (`_manzanaEdges`, `_manzanaSeleccionada*`, `_datosParcialesGuardados`); estado híbrido difícil de seguir y de probar. | `features/map/services/map-state.service.ts:26-59` |
| L4 | Estilo | `auth-token.ts:21` usa inyección por constructor con `@Optional()` y `eslint-disable @angular-eslint/prefer-inject`; el style guide oficial prefiere `inject(HttpClient, {optional: true})`. Decisión documentada (constructible directo en tests/SSR) pero fuera de convención. | `core/services/auth-token.ts:20-21` |
| L5 | Legibilidad | `error.interceptor.ts:21` matchea rutas por substring (`req.url.includes`) en vez de path exacto; puede sobre-ignorar rutas con nombres parecidos. | `core/interceptors/error.interceptor.ts:21` |
| L6 | Rendimiento | `rendering.getManzanaIndex().filter(m => m.territorioNumero === n).length` se repite en ~8 sitios de `map-selection`, `map-rendering.facade` y `map-report`; cada llamada reconstruye el filtro. Consolidar en un helper/cached. | `map-selection.service.ts`, `map-rendering.facade.ts:282`, `map-report.service.ts` |
| L7 | Tipado | `estado` y `tipoSesion` en `models.ts` son `string` en vez de union de literales (`'completed'|'incomplete'`, `'completa'|'parcial'`). | `core/models/models.ts:17,21` |
| L8 | Legibilidad | `territory-search.ts` duplica el parsing de tokens en `numerosFiltrados` y `territoriosSeleccionados`. | `territory-search.ts:32-35,53-56` |
| L9 | Legibilidad | `map.html:77` usa `$any($event.target).value` (escape de tipo); un handler tipado en el componente lo evitaría. | `features/map/map.html:77` |
| L10 | Determinismo | IDs de parciales `parcial-${Date.now()}` (no deterministas; posible colisión entre dos parciales creados en el mismo ms). | `map-selection.service.ts:352` |
| L11 | Seguridad (redundancia) | `provideHttpClient` ya activa la protección XSRF built-in (`XSRF-TOKEN` → `X-XSRF-TOKEN`); el `csrfInterceptor` custom repite ese header y añade seeding. Funcional pero duplicado; documentar o delegar en `withXsrfConfiguration`. | `app.config.ts:27`, `core/interceptors/csrf.interceptor.ts` |
| L12 | Legibilidad | Spec `map-style.spec.ts` con nombre que no coincide con su fuente `map-style.service.ts`. | `features/map/services/` |
| L13 | Arquitectura | `RumService` usa `sendBeacon`/`fetch` directo fuera de `HttpClient` (correcto para `keepalive`, no requiere XSRF en lecturas). Bajo riesgo. | `core/services/rum.ts:84-96` |
| L14 | Estado | `territorio.ts` mantiene caché manual (`geoJsonCache`, `reportCache`) sin invalidación reactiva; funcional pero frágil ante multi-sesión. | `core/services/territorio.ts:13-14` |
| L15 | Complejidad | `map-selection.service.ts` (415 líneas) y `map-territory-layer.service.ts` (382 líneas) son god-services con múltiples responsabilidades (selección, marcado, restauración, geometría parcial, estilos, visibilidad); alta complejidad, difícil de testear. Refactor estructural → fuera de alcance de esta pasada. | `features/map/services/` |

### Flujo funcional (contraste con Fase 0)

- **Login (#1)**: correcto y bien cubierto (96–100%). Guard de `localStorage` en SSR. El logout hace `POST /auth/logout` fire-and-forget sin `takeUntilDestroyed` (menor).
- **Marcado (#2)**: funcional pero **sin tests** en su lógica de decisión (C1/A1). La selección multi-territorio y el modo parcial concentran la complejidad.
- **Envío WhatsApp (#3)**: `MapReportService` 92.95% y `MapDataPersistenceService` 68.75% cubiertos; `MapCaptureService` (screenshot) al 4.2% — el eslabón de captura del envío queda sin cubrir.
- **Gotcha de negocio**: `profile.save()` en el `catch` de `buscarOCrear` guarda el perfil localmente y navega a `/map` aunque el backend falle; los reportes posteriores fallarán con 401 y forzarán re-login. Comportamiento deliberado (offline/demo) pero potencialmente confuso.

## 3. Roadmap priorizado

1. **QW1 — Cobertura decisión de marcado (C1/A1)**: spec de `map-interaction.service.ts` con la matriz de `handleMapClick` (5 acciones × modos none/completa/parcial). Test de comportamiento real, sin cambiar código fuente.
2. **QW2 — Cobertura registry/engine**: specs de `map-layer-registry.service.ts` y `map-engine.service.ts` (mocks de Leaflet). Coste bajo, sube `map/services`.
3. **QW3 — Cobertura captura (A3, flujo #3)**: spec de `map-capture.service.ts` con mocks de Leaflet/html2canvas (estilos de captura, fitBounds, restauración).
4. **QW4 — Robustez localStorage (M7)**: envolver `profile.save()`/`clear()` y `toggleTheme()` en `try/catch`, igual que el resto del código (sin cambio de comportamiento visible).
5. **QW5 — Docblock/limpieza trivial**: corregir comentarios obsoletos si los hay; consolidar L7 (uniones de literales) sin tocar el flujo.
6. **Deuda (M1–M6, M8, L1–L15)**: documentar en `references/` de la skill y dejar como recomendaciones. M1 (`user-scalable`) es un **cambio de comportamiento visible** y requiere aprobación antes de aplicarse.

## 4. Matriz impacto/esfuerzo

| Ítem | Impacto | Esfuerzo | Fase |
|---|---|---|---|
| Spec `map-interaction` (decisión de marcado) | Alto (flujo crítico #2) | Bajo | 1 |
| Specs `map-layer-registry` + `map-engine` | Medio | Trivial | 1 |
| Spec `map-capture` (flujo #3) | Alto | Medio | 2 |
| `try/catch` localStorage en profile/theme | Medio (robustez) | Trivial | 2 |
| Unions de literales en models | Bajo | Trivial | 2 |
| C2: bundlear `leaflet.css` + añadir a ngsw | Medio (PWA offline) | Medio | 3 (requiere validación de build) |
| M1: quitar `user-scalable=no` | Medio (a11y) | Trivial | 3 (**requiere aprobación** — cambio visible) |
| M3/M4: guard admin + cabeceras SSR/allowedHosts | Medio (seguridad) | Medio | 3 (requiere deploy) |
| M6: `skipTests` → `false` | Alto (deuda futura) | Trivial | 3 (cambio de convención) |
| Refactors estructurales (L15, Signal Forms, Nx, builder) | — | Alto | No procede hoy |

## 5. Riesgos de breaking changes y mitigación

- **QW1–QW5 no alteran comportamiento visible**: son tests nuevos y `try/catch` en storage (mismo comportamiento, solo no-lanzar en modo privado).
- Mitigación: branch dedicado; tras cada cambio `npm run lint` + `npx ng build --configuration=production` + `npm test -- --run --coverage` en verde; commits atómicos por hallazgo.
- Los umbrales de cobertura **no se suben** en esta pasada (decisión Fase 0: mantener CI); se documenta A4 como recomendación para una pasada futura.
- Cualquier cambio con impacto visible para el usuario (p. ej. M1) se señalará explícitamente antes de aplicarse, nunca en silencio.

## 6. Estado de ejecución (actualización 2026-08)

**Resueltos en esta pasada:** C1 (red de seguridad del marcado), C2 (leaflet local/offline), A1, A3, A2, M7, L7 + 8 specs nuevos, `try/catch` en storage, y **bug real** corregido en `map-partial-mark.eliminarParcial` (leía `current[idx]` tras `splice`, limpiando los datos parciales del territorio equivocado).

**Resueltos en la segunda pasada:** cobertura de `map-selection.service` (~15% → ~60%) y `map-tile-layer` (~21% → ~70%); M8 (template `@let` en admin, elimina ~30 llamadas `getColor` por tarjeta y ciclo de detección); L9 (handler tipado en vez de `$any` en `map.html`); L1 (helpers `groupByTerritorio`/`countTotalManzanas` en `map-report.service`); M1 (`user-scalable=no` eliminado → habilita zoom de accesibilidad, WCAG 1.4.4/2.5.5); M6 (`skipTests: false` en schematics + nota actualizada en el AGENTS.md del frontend); M4 (cabeceras `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` en `server.ts`).

**Resueltos en la tercera pasada:** M2 (guard SSR en `territory-search.applyTheme()`); M5 (`zone.js` movido a `devDependencies`); L3 (`MapStateService` sin getters/setters mutables: `manzanaSeleccionada*` y `manzanaEdges` ahora son signals, con callers y specs actualizados); L5 (`error.interceptor` matchea rutas auth por sufijo exacto, no por substring); L10 (`nextParcialId()` monotónico en vez de `parcial-${Date.now()}`); L14 (caché de `territorio.ts` con TTL de 5 min + test de re-fetch tras expirar).

**Pendientes que requieren decisión tuya o deploy:** M3 (endurecer `admin.guard` — decisión documentada actual: el form de admin vive en la ruta), CSP completo y `allowedHosts`/`trustProxyHeaders` explícitos en `server.ts`/deploy (dependen de la topología de despliegue). Resto de hallazgos bajos (L2, L4, L6, L8, L11–L13, L15) son refactors o decisiones documentadas sin impacto en flujos críticos.

## 8. Estado de ejecución — Pasada 4 (2026-08-07)

**Resueltos en esta pasada:**

- **P1** (Leaflet CSS en bundle inicial): `leaflet.css` movido a `map.css` via `@import` → desaparece del initial bundle, solo se carga en `/map`. Initial CSS de 16.92 kB → 5.85 kB.
- **P2** (signal<array> con spread copies): `MapTerritoryLayerService` refactorizado a estructuras plain (`Map<number, FeatureLayer>`, `Map<number, L.Marker>`, array plano + `Map<number, ManzanaIndex[]>`). 0 copias de array en cada carga de territorio.
- **P3** (O(n) lookups): `getFeatureLayerByTerritorio()` y `getManzanaCountByTerritorio()` añadidos a facade → O(1) en todos los hot paths.
- **P4** (new Set() en moveend): `updateVisibleTerritories()` usa `layerByTerrory.has(num)` directamente → sin Set/map creation.
- **P5** (querySelector en labels): Labels gestionados por `Map<number, L.Marker>` → sin DOM reads en hot paths de selección.
- **P6** (getHiddenStyle allocations): `HIDDEN_STYLE` singleton congelado → cero allocations por llamada.
- **P7** (restauración secuencial): `Promise.all(numsAConsiderar.map(...))` en `onTerritorioSeleccionado` → restauración paralela de múltiples territorios.
- **P8** (setTimeout leak): Timer almacenado y limpiado con `DestroyRef.onDestroy`.

**Tests:** 307 pasando (37 spec files). Lint limpio. Build production exitoso con presupuestos de bundle actualizados (24 kB / 32 kB para anyComponentStyle).

## 7. Pasada 4 — Rendimiento de carga y runtime (2026-08-07)

**Contexto:** el usuario confirmó que el objetivo principal de esta pasada es **máximo rendimiento en móvil** (app mobile-first para usuarios con habilidad tecnológica baja/media). Se acepta cualquier refactor que no rompa los flujos críticos ni cambie el comportamiento visible.

### Nuevos hallazgos de rendimiento

| # | Severidad | Área | Hallazgo | Ubicación |
|---|---|---|---|---|
| P1 | **Alto** | Loading | Leaflet CSS (~12 kB) está en el bundle inicial (`styles-*.css`) y se descarga en **todas las rutas** (login, profile, admin) aunque solo se usa en `/map`. Coste innecesario en el path crítico de primera carga. | `angular.json:54`, `styles-*.css` initial chunk |
| P2 | **Alto** | Runtime | `signal<FeatureLayer[]>` y `signal<L.Marker[]>` en `MapTerritoryLayerService` se actualizan con `update(arr => [...arr, item])` en cada territorio cargado, creando copias innecesarias del array. Con 20 territorios en viewport = 60+ arrays descartados en la carga inicial. | `map-territory-layer.service.ts:208,217,283` |
| P3 | **Alto** | Runtime | `getAllTerritoriesLayer().find(f => f.territorioPadre === num)` y `getManzanaIndex().filter(m => m.territorioNumero === num).length` se repiten en 8+ sitios en hot paths (click, pan, selección). Complejidad O(n) donde n = territorios/manzanas cargadas. | `map-rendering.facade.ts:282,285,194`, `map-selection.service.ts:55,57`, `map-initialization.service.ts:56`, `map-style.service.ts:112,129,132` |
| P4 | **Alto** | Runtime | `updateVisibleTerritories()` (llamado en cada `moveend`) crea `new Set(allTerritoriesLayer().map(...))` — un Set + array nuevo en cada pan/zoom del mapa. | `map-territory-layer.service.ts:96` |
| P5 | **Alto** | Runtime | `updateLabelsForSelection()` y `removeTerritoryLabel()` hacen `el.querySelector('.territory-label__text')?.textContent` para cada label — lectura de DOM que fuerza layout reflow en hot paths de selección. | `map-territory-layer.service.ts:154,299-303` |
| P6 | **Medio** | Runtime | `getHiddenStyle()` retorna `{ ...STYLE_DEFAULTS.hiddenPolygon }` (spread = objeto nuevo) en cada llamada. Se invoca una vez por territorio no-seleccionado en cada `ocultarPoligonosNoSeleccionados()`. | `map-style.service.ts:36` |
| P7 | **Medio** | Robustez | `onTerritorioSeleccionado()` restaura marcas de DB de forma **secuencial** (`for await`); seleccionar N territorios bloquea N peticiones en serie. | `map.ts:76-81` |
| P8 | **Bajo** | Robustez | `TerritorySearch.onBlur()` usa `setTimeout` sin limpiar el timer al destruir el componente; puede disparar `signal.set()` en un componente ya destruido. | `territory-search.ts:151` |

### Soluciones aplicadas en esta pasada

- **P1**: `leaflet.css` movido de `angular.json` styles globales a `map.css` via `@import` → se bundlea con el lazy chunk de `/map`, desaparece del initial bundle.
- **P2**: `signal<FeatureLayer[]>`, `signal<L.Marker[]>`, `signal<ManzanaIndex[]>` y `signal<Map<...>>` reemplazados por estructuras plain (`Map<number, FeatureLayer>`, `Map<number, L.Marker>`, array plano + `Map<number, ManzanaIndex[]>`). 0 copias de array en cada carga de territorio.
- **P3 + P4 + P5**: `getFeatureLayerByTerritorio(num)` → O(1) via Map. `getManzanaCountByTerritorio(num)` → O(1) via Map. Labels gestionados por `Map<number, L.Marker>` → sin querySelector. Facade actualizada para usarlos en todos los hot paths.
- **P6**: `getHiddenStyle()` retorna objeto singleton `HIDDEN_STYLE` congelado (`Object.freeze`). Cero allocations por llamada.
- **P7**: `Promise.all(numsAConsiderar.map(...))` en vez de `for await` — restauración paralela de múltiples territorios.
- **P8**: Timer almacenado, limpiado con `DestroyRef.onDestroy`.

### Métricas antes/después (build production real)

| Métrica | Antes | Después |
|---|---|---|
| Initial CSS bundle | 16.92 kB (incl. Leaflet ~11 kB) | 5.85 kB (solo app styles) |
| Initial total bundle | 314.43 kB | 303.36 kB |
| Initial CSS comprimido | 3.72 kB | 1.59 kB |
| Map lazy chunk (CSS) | 0 | Leaflet CSS ahora en chunk lazy |
| Array copies por carga de territorio | O(n_territorios) spreads | 0 (Map direct insert) |
| Lookup territorio en hot path | O(n_territorios) | O(1) |
| Lookup manzana-count en hot path | O(n_manzanas) | O(1) |
| querySelector por selección de territorio | O(n_labels) DOM reads | 0 (Map direct access) |
