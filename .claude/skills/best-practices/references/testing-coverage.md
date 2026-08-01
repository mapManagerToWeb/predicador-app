# Testing y cobertura — proyecto `predicador-frontend`

## Estado del proyecto (2026-08)
- **Vitest 4** + jsdom + `@analogjs/vite-plugin-angular` + `@analogjs/vitest-angular`
  (`vitest.config.ts`). Sin Karma.
- Config en `vitest.config.ts`: cobertura V8, thresholds ahora en
  `lines/statements/functions: 30`, `branches: 20`.
- CI (`ci-frontend.yml`): `npm run lint` → `ng build` → `npm test -- --run --coverage` → `npm run build`.

## Cobertura real vs. "de vanidad"
- **Cobertura real**: el spec importa el módulo real y ejercita su
  comportamiento (firma de `HttpClient`, respuestas, transiciones de estado).
- **Vanidad** (prohibida): reimplementar la función dentro del `.spec.ts`
  (verificado: `map-envio.spec.ts` copiaba `requiereScreenshot`/`generarParametros`
  locales y además documentaba un comportamiento distinto al real — fue
  eliminado y reemplazado por tests de `MapReportService`).

## Cómo testear cada pieza (patrones del repo)
- **Servicios con HTTP**: `TestBed` + `provideHttpClient()` +
  `provideHttpClientTesting()`; `HttpTestingController.expectOne(...)` y
  `req.flush(...)`; `afterEach(() => httpMock.verify())`.
- **Servicios sin DI pesada**: instanciar directo (`new Profile()`,
  `new MapStateService()`) con `localStorage` real y `vi.stubGlobal` para SSR.
- **Componentes**: `TestBed.configureTestingModule({ imports: [Componente],
  providers: [mocks de servicios y Router/ActivatedRoute] })`.
  Si el template usa `RouterLink`, mockear `Router` con `createUrlTree`,
  `serializeUrl`, `isActive` y proveer `ActivatedRoute` (`{ snapshot: {} }`).
- **Funciones puras**: test directo sin Angular (`map-geometry.spec.ts`,
  `phone.spec.ts`). Muy barato y de alto valor en flujos de geometría.
- **`vi.mock`** para librerías de captura (`html2canvas`) que no deben ejecutarse.

## Prioridad de cobertura (flujos críticos del negocio)
1. **Login/auth**: `phone.ts`, `encargado.ts`, `login.ts` (YA cubiertos, antes a 0%).
2. **Perfil**: `profile.ts` (feature) y `Profile` service (cubiertos).
3. **Reportes**: `map-report.service` (buildRegistros/buildTerritoriosEnvio/
   buildWhatsAppRequest/captureScreenshot — cubiertos), `map-data-persistence`.
4. **Mapa**: `map-geometry`, `map-state` (cubiertos); pendientes de más
   cobertura: `map-selection.service` (417 líneas), `map-partial-draw`,
   `map-initialization`, `map-tile-layer`, `map-interaction`.

## Criterios de calidad
- Nunca subir un umbral de cobertura "por subir": primero medir con
  `npm test -- --run --coverage`, y solo después subir el threshold si hay
  margen real (evita CI rojo).
- Un spec que cambia la API de producción (p. ej. `authToken.set(role)`) debe
  actualizar TODOS los callers y specs (`rg "\.set\("`).
- No dejar `fit`/`fdescribe`/`xit`. Con `skipTests: true` en schematics,
  activar tests explícitamente al crear componentes.
