# Plan de mejora — Auditoría Angular `predicador-frontend`

> Fecha: 2026-08-01 · Angular 22.0.8 (última estable) · Branch: dedicado
> Contexto (Fase 0): app de gestión de territorio para predicadores. Flujos
> críticos: (1) login/autenticación HMAC vía gateway + lectura de
> territorios/asignaciones; (2) registro de actividad + generación/reporte.
> Requisito destacado: SEO/SSR. Tolerancia: **solo incremental y reversible**.

## 1. Resumen ejecutivo

El frontend es un proyecto Angular 22 moderno y bien construido: standalone,
zoneless (`provideZonelessChangeDetection`), Signals, control de flujo
`@if/@for`, Vitest, SSR con `provideClientHydration()`, PWA, interceptors
propios (auth/CSRF/error), guards funcionales, lazy-loading por feature y
TypeScript estricto. No hay `*ngIf`, `ngClass`, `bypassSecurityTrust*`,
`console.log`, `: any` ni `.subscribe()` sin gestión de ciclo de vida.

El problema central **no es la técnica del código, sino el riesgo de
regresión en los flujos críticos**: la cobertura real es de ~24% de líneas y
los umbrales del CI son "de vanidad" (20/20/10/20). Los módulos de
autenticación (`encargado.ts`, `login.ts`, `phone.ts`) están a **0%**, y el
corazón del mapa (`map-selection.service.ts`, 417 líneas) a **0.86%**.
Además existe un spec (`map-envio.spec.ts`) que reimplementa funciones
locales en vez de probar el código real — y además documenta un
comportamiento distinto al real.

Este plan prioriza **quick wins reversibles**: cerrar los huecos de cobertura
de los flujos críticos, subir los umbrales de cobertura, y eliminar código
muerto/engañoso de bajo riesgo. No se proponen refactors estructurales ni
migraciones de alto riesgo (Signal Forms, Nx, micro-frontends, cambio de
builder) porque el proyecto no los justifica hoy.

## 2. Hallazgos por severidad y área

### Crítico

| # | Área | Hallazgo | Ubicación |
|---|---|---|---|
| C1 | Testing | Umbrales de cobertura del CI no protegen los flujos críticos: 20/20/10/20, y los módulos de auth están a 0%. | `vitest.config.ts:38-43` |

### Alto

| # | Área | Hallazgo | Ubicación |
|---|---|---|---|
| A1 | Testing | `encargado.ts` (login `buscarOCrear`/`loginByPhone`) sin tests (0%). | `core/services/encargado.ts` |
| A2 | Testing | `login.ts` y `profile.ts` (features de auth/creación de perfil) sin tests (0%). | `features/auth/login.ts`, `features/profile/profile.ts` |
| A3 | Testing | `phone.ts` (normalización de teléfono del login) sin tests (0%). | `core/utils/phone.ts` |
| A4 | Testing | `map-selection.service.ts` (417 líneas, lógica central de marcado) a 0.86%. | `features/map/services/map-selection.service.ts` |
| A5 | Testing | `map-geometry.ts` (snapping/geometría del marcado parcial) a 1.14%; funciones puras fáciles de testear. | `features/map/map-geometry.ts` |
| A6 | Testing | `map.ts` (página principal) a 0%: `map.spec.ts` solo prueba utils, no el componente. | `features/map/map.ts` |
| A7 | Testing | `map-envio.spec.ts` = cobertura de vanidad: reimplementa `requiereScreenshot` y `generarParametros` locales cuyo comportamiento **difiere del código real** (`map-data-persistence.service.ts:94` usa solo `.some(t => !t.finalizado)`). | `features/map/map-envio.spec.ts` |

### Medio

| # | Área | Hallazgo | Ubicación |
|---|---|---|---|
| M1 | Reactividad | Código muerto/engañoso en `AuthTokenService`: signal `token` siempre `null` y parámetro `_token` de `set()` ignorado. | `core/services/auth-token.ts:15,20-22` |
| M2 | Seguridad | Docblock de `authInterceptor` afirma que adjunta `X-Session-Token`, pero solo fija `withCredentials`. Comentario desactualizado. | `core/interceptors/auth.interceptor.ts:3-9` |
| M3 | Error handling | No se registran `provideBrowserGlobalErrorListeners()` (default oficial para capturar `error`/`unhandledrejection`). | `app.config.ts` |
| M4 | Rendimiento | `zone.js` permanece como dependencia de producción a pesar de ser zoneless; solo se necesita para tests (`setup-zone`). | `package.json:35` |
| M5 | Seguridad | `admin.guard.ts` es permissivo (`return true`). Decisión documentada, pero el área `/admin` con login real de credenciales depende de enforcement server-side. | `core/guards/admin.guard.ts:16-17` |
| M6 | Seguridad/Infra | Sin cabeceras de seguridad en el servidor SSR (`server.ts`): CSP, `X-Content-Type-Options`, `frame-ancestors`. `allowedHosts` de build vacío (`security.allowedHosts: []`). | `src/server.ts`, `angular.json:57-59` |
| M7 | Rendimiento | Sin bloques `@defer`; `html2canvas` (~200 KB) se importa dinámicamente al capturar, pero un `@defer` con `prefetch` en la UI de envío sería más predecible. | `map-report.service.ts:121` |

### Bajo

| # | Área | Hallazgo | Ubicación |
|---|---|---|---|
| L1 | Legibilidad | Nombres de specs que no coinciden con su fuente: `map-style.spec.ts` ↔ `map-style.service.ts`. | `features/map/services/` |
| L2 | Legibilidad | `errorInterceptor` usa `req.url.includes(...)` (coincidencia por substring) en vez de coincidencia de ruta precisa. | `core/interceptors/error.interceptor.ts:21` |
| L3 | Arquitectura | `RumService` envía RUM con `sendBeacon`/`fetch` directo, fuera de `HttpClient` (no pasa por interceptores). Correcto para `keepalive`, pero la cookie de sesión viaja sin `XSRF` (lectura). Bajo riesgo. | `core/services/rum.ts:84-96` |
| L4 | Estado | `territorio.ts` mantiene caché manual (`geoJsonCache`, `reportCache`) sin invalidación reactiva; funcional pero frágil ante multi-sesión. | `core/services/territorio.ts:13-14` |

## 3. Roadmap priorizado

1. **QW1 — Cobertura flujo login** (A1/A2/A3): specs de `phone.ts`, `encargado.ts`, `login.ts`.
2. **QW2 — Cobertura geometría/estado** (A5, parcial A4): specs de `map-geometry.ts` y `map-state.service.ts`.
3. **QW3 — Cobertura reporte real** (A7, A6 parcial): reemplazar `map-envio.spec.ts` por tests reales de `MapReportService.buildRegistros/buildTerritoriosEnvio/buildWhatsAppRequest`; testear `map-data-persistence.service`.
4. **QW4 — Limpieza** (M1/M2): eliminar signal `token` muerta y parámetro `_token`; corregir docblock del interceptor; añadir `provideBrowserGlobalErrorListeners()`.
5. **QW5 — Subir umbrales** (C1): elevar thresholds de cobertura de forma gradual y verificable.
6. **Deuda** (M3-M7, L1-L4): documentar en `references/` y dejar como recomendaciones; requerirían validación de comportamiento/deploy.

## 4. Matriz impacto/esfuerzo

| Ítem | Impacto | Esfuerzo | Fase |
|---|---|---|---|
| Specs login (`phone`, `encargado`, `login`) | Alto (flujo crítico) | Bajo | 1 |
| Specs `map-geometry`, `map-state` | Alto | Bajo | 1 |
| Specs reales de reporte | Alto | Medio | 2 |
| Limpieza código muerto + error listeners | Bajo | Bajo | 2 |
| Subir umbrales de cobertura | Alto | Trivial | 2 |
| `@defer` html2canvas / cabeceras SSR / allowedHosts | Medio | Medio | 3 (requiere validación) |
| Signal Forms / Nx / cambio de builder | — | Alto | No procede hoy |

## 5. Riesgos de breaking changes y mitigación

- **Ninguno de los cambios QW1–QW5 altera comportamiento visible** para el
  usuario: son tests, limpieza de código muerto y configuración de error
  handling con defaults oficiales.
- Mitigación: branch dedicado; tras cada cambio `npm run lint` + build +
  `npm test -- --run --coverage` en verde; commits atómicos por hallazgo.
- La subida de umbrales (QW5) solo se aplica **después** de que la cobertura
  real supere los nuevos umbrales, nunca antes.
