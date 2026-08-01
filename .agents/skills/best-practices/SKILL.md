---
name: best-practices
description: Audita y corrige malas prácticas en este proyecto Angular (arquitectura, signals, rendimiento, seguridad, accesibilidad, testing y cobertura, legibilidad). Úsalo antes de un PR, al revisar código nuevo o al planear refactors.
license: MIT
compatibility: opencode
metadata:
  framework: angular
  angular-version: "22"
  last-verified: 2026-08-01
---

# best-practices — auditoría Angular para `predicador-frontend`

Skill de auditoría y remediación **específica de este proyecto** (Angular 22,
zoneless, Signals, Vitest, SSR). No duplica el skill oficial
`angular-developer` (sintaxis/APIs/scaffolding); para dudas puntuales de API o
scaffolding carga `angular-developer` primero.

## Nota de mantenimiento (léela siempre)

Angular publica una versión mayor cada ~6 meses; antes de aplicar cualquier
regla de este skill, verifica que sigue vigente en
https://angular.dev/style-guide y https://angular.dev/best-practices (y el
radar del proyecto en `.opencode/skills/auditoria-calidad-fullstack/references/06-radar-tecnologico.md`).

## Flujo de trabajo

Para cada tarea: **escanear → clasificar por severidad → proponer fix → aplicar con tests**.

1. **Escanea** con grep dirigido (nunca leas `node_modules/`, `dist/`, `coverage/`, `.angular/`).
2. **Clasifica** cada hallazgo: Crítico / Alto / Medio / Bajo con `archivo:línea` y justificación.
3. **Propon** el fix más pequeño y reversible; si cambia comportamiento visible para el usuario, indícalo antes de aplicarlo.
4. **Aplica con tests**: tras cada cambio corre `npm run lint`, `npm run build` y `npm test -- --run --coverage`; deben quedar en verde. Commit atómico por hallazgo (conventional commits).

## Checklist de detección (distilada de la auditoría de 2026-08)

### Arquitectura y estructura
- [ ] ¿Organización por features (`core/`, `features/`, `shared/`) en vez de por tipo (`components/`, `services/`)?
- [ ] ¿NgModules legacy pendientes de migrar a standalone? (`imports`/`providers` en lugar de `declarations`)
- [ ] ¿Barrel files (`index.ts`) con dependencias circulares? (evitar; importar rutas directas)
- [ ] ¿Un concepto por archivo y nombres kebab-case con `.spec.ts` de nombre coincidente?
- [ ] ¿Componentes de >300 líneas con lógica de negocio embebida que debería vivir en services/use-cases?

### Reactividad y estado
- [ ] ¿`provideZonelessChangeDetection()` activo y `zone.js` fuera del bundle de producción?
- [ ] ¿Señales para estado (`signal`, `computed`) en vez de `.subscribe()` imperativo sin gestión?
- [ ] ¿Signals muertas/engañosas? (p. ej. una signal `token` siempre `null` — eliminar)
- [ ] ¿`inject()` en lugar de constructor-DI, y `@Injectable({providedIn:'root'})` con el alcance correcto?
- [ ] ¿`computed()` para lógica derivada que hoy vive en el template?

### Componentes y templates
- [ ] ¿`ChangeDetectionStrategy.OnPush` donde importa (no forzado si ya es default en tu versión)?
- [ ] ¿`@if/@for/@switch` en vez de `*ngIf/*ngFor/*ngSwitch`? ¿`@for` con `track`?
- [ ] ¿Bindings `class`/`style` en vez de `ngClass`/`ngStyle`?
- [ ] ¿`host` (objeto) en vez de `@HostBinding`/`@HostListener`?
- [ ] ¿`protected`/`readonly` en `input()`, `output()`, `model()` y queries?
- [ ] ¿Lógica compleja en templates que debería estar en `computed()`?
- [ ] ¿Handlers nombrados por la acción (`saveUser()`) y no por el evento (`handleClick()`)?

### Formularios
- [ ] ¿Reactive Forms / Signal Forms consistentes (no mezclar indiscriminadamente)?
- [ ] ¿Validaciones duplicadas o dispersas entre componente y servicio?

### Routing
- [ ] ¿Lazy loading real por feature (`loadComponent`)? ¿Guards funcionales (`CanActivateFn`)?
- [ ] ¿Guards permissivos que devuelven siempre `true`? Documentar decisión o endurecer.

### Rendimiento
- [ ] ¿`@defer` para componentes pesados (mapa, capturas, gráficos) fuera del viewport inicial?
- [ ] ¿Librerías grandes (`html2canvas`, `leaflet`) importadas dinámicamente o en chunk lazy?
- [ ] ¿`NgOptimizedImage` en imágenes estáticas? (aquí los avatares son emoji, no aplica)
- [ ] ¿SSR + `provideClientHydration()` activos? ¿Cabeceras `allowedHosts`/`trustProxyHeaders` explícitas?
- [ ] ¿Objetos/funciones nuevas inline en templates que rompen memoización?

### Seguridad
- [ ] ¿`bypassSecurityTrust*` o `innerHTML` sin sanitizar? (bloqueante — revisar origen del valor)
- [ ] ¿CSP / Trusted Types configurados (server.ts / infra)? ¿Cabeceras `X-Content-Type-Options`?
- [ ] ¿XSRF/CSRF en `HttpClient` (interceptor o `withXsrfConfiguration`)? ¿Cookies HttpOnly para sesión?
- [ ] ¿Secretos en `environment*.ts` o hardcodeados? (deben pasar por proxy/backend)
- [ ] ¿`npm audit` limpio? ¿`allowedHosts` sin `*`?
- [ ] ¿Comentarios/docblocks que describen comportamiento que ya no existe? (p. ej. "adjunta header X" cuando no lo hace)

### Accesibilidad (WCAG AA)
- [ ] ¿ARIA correcto en elementos interactivos (`aria-label`, `aria-pressed`, `role`, `aria-live`)?
- [ ] ¿Manejo de foco tras navegación de ruta?
- [ ] ¿`aria-current` en links activos (`routerLinkActive` + `ariaCurrentWhenActive`)?
- [ ] ¿`@defer` anunciado con `aria-live`?
- [ ] ¿Elementos nativos (`<button>`, `<label for>`) en vez de divs con `(click)`?

### Testing y cobertura
- [ ] ¿Vitest (no Karma)? ¿Umbrales de cobertura reales y no "de vanidad"?
- [ ] ¿Specs que testean **código real** (importan el módulo) y no funciones copiadas/reimplementadas? (buscar funciones duplicadas dentro de `.spec.ts`)
- [ ] ¿Flujos críticos cubiertos: login/auth, perfil, registro de reportes, guardado/envío?
- [ ] ¿Servicios grandes sin spec (`map-selection.service.ts`)? Priorizar por impacto del flujo.
- [ ] ¿`fit`/`fdescribe`/`xit` olvidados? ¿`skipTests` del scaffolding activado por error?

### Calidad de código
- [ ] ¿`strict: true` en tsconfig? ¿ESLint flat config (`eslint.config.js`), no `.eslintrc.*`?
- [ ] ¿`console.log`/`debugger`/`: any`/TODO/FIXME?
- [ ] ¿Código muerto (signals, métodos, componentes sin referencia)?
- [ ] ¿Rutas/cadenas mágicas repetidas en vez de constantes?

## Referencias bajo demanda
Carga solo el archivo de la fase/área que auditas:
- `references/architecture.md` — estructura, límites, monorepo, DI
- `references/security.md` — XSS, CSP/Trusted Types, CSRF, headers, secrets
- `references/performance.md` — bundles, `@defer`, imágenes, SSR/hydration, zoneless
- `references/testing-coverage.md` — Vitest, umbrales, cobertura real vs. vanidad
- `references/accessibility.md` — WCAG AA, ARIA, foco, Angular Aria

## Cómo verificar (proyecto)
- `npm run lint` · `npm run build` · `npm test -- --run --coverage`
- Backend (si el cambio toca flujos): `mvn verify -B` desde `backend/` (requiere PostgreSQL si usa BD).
