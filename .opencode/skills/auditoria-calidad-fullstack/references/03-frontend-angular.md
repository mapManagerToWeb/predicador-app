# Frontend Angular — bugs, rendimiento, código muerto, configuración

## Bugs y code smells comunes

- **Fugas de memoria por suscripciones**: `.subscribe()` sin gestión de
  ciclo de vida (sin `async` pipe, sin `takeUntilDestroyed()`, sin
  `Subscription` acumulada y desuscrita en `ngOnDestroy`).
- **Manipulación directa del DOM** vía `ElementRef.nativeElement`/`document`
  saltándose el `Renderer2` de Angular — riesgo de XSS y rompe SSR/hydration.
- **`any` extendido** en los límites con el backend (respuestas HTTP sin
  tipar) — se pierde el tipado justo donde más importa.
- **`@for` sin `track`** (o `*ngFor` sin `trackBy`) sobre listas que
  cambian — fuerza destrucción/recreación de nodos DOM innecesaria.
- **Mutación directa de `@Input()`/`input()`** en vez de tratarlo como dato
  de solo lectura y emitir cambios hacia arriba.
- **Cadenas mágicas** para rutas, roles o claves de configuración repetidas
  por el código en vez de constantes/enums/tipos.
- **Promesas sin manejar** o errores de Observable sin `catchError`, que
  terminan como errores silenciosos en consola.

## Rendimiento

- **Componentes sin `OnPush`** (o, en proyectos zoneless, sin aprovechar
  signals) que se re-renderizan más de lo necesario.
- **Rutas/módulos sin lazy loading**: features completas cargadas en el
  bundle inicial en vez de `loadComponent`/`loadChildren`.
- **Importaciones no tree-shakeables**: importar una librería completa
  (`import * as _ from 'lodash'`) cuando solo se usan 2 funciones.
- **Imágenes sin optimizar**: no usar `NgOptimizedImage`, imágenes sin
  dimensiones explícitas (causan layout shift), formatos pesados donde
  WebP/AVIF servirían mejor.
- **Objetos/arrays/funciones nuevas en cada ciclo de detección de cambios**
  dentro del template (p. ej. `[config]="{a: 1}"` inline) — genera trabajo
  de comparación innecesario y rompe memoización.
- **Sin `@defer`** en componentes pesados fuera del viewport inicial
  (gráficos, editores, modales complejos).
- **Presupuestos de build no configurados o ignorados**: sin `budgets` en
  `angular.json`, un bundle puede crecer sin que nadie lo note hasta que el
  CI empiece a fallar en un warning que nadie mira.

## Código muerto

- Componentes, pipes, directivas o servicios que no aparecen referenciados
  en ninguna plantilla, ruta ni import — se pueden detectar con
  herramientas como `ts-prune` o `knip`.
- Dependencias en `package.json` que no se importan en ningún lado
  (`depcheck`/`knip`).
- Bloques de plantilla comentados, clases CSS/SCSS definidas pero nunca
  aplicadas.
- `console.log`/`debugger` olvidados, código detrás de flags que nunca se
  activan (o siempre están activos).

## Archivos de configuración

- **Secretos en `environment.ts`/`environment.prod.ts`**: cualquier API key
  o secreto committeado ahí queda público en el bundle del navegador —
  debe pasar por un backend/proxy o inyectarse en build time desde un
  secreto real.
- **`tsconfig.json` sin `strict: true`** (o al menos `strictNullChecks`) —
  se pierde gran parte del valor de TypeScript; señálalo como mejora de
  alto impacto y bajo riesgo si aún no está.
- **Formato de ESLint obsoleto**: presencia de `.eslintrc.json`/`.eslintrc.js`
  en vez de `eslint.config.js`/`.mjs` (flat config) — desde ESLint 10 el
  formato clásico ya no funciona; si el proyecto sigue en él, es una
  migración pendiente urgente, no opcional.
- **Test runner**: si `karma.conf.js` sigue presente, es señal de deuda
  técnica de tooling (Karma está deprecado desde 2023; Angular usa Vitest
  por defecto desde la v21) — recomienda migrar
  (`ng generate @angular/core:karma-to-vitest` si el CLI del proyecto lo
  soporta).
- **Cabeceras de seguridad** ausentes a nivel de hosting/reverse proxy (CSP,
  `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`) — no es
  responsabilidad exclusiva de Angular, pero conviene señalarlo si no
  aparece configurado en ningún lado del repo (`nginx.conf`, `vercel.json`,
  etc.).

## Huecos de cobertura

- Componentes/servicios sin archivo de test asociado (`*.spec.ts`
  ausente).
- Flujos críticos de usuario (login, checkout, formularios con validación
  compleja) sin cobertura e2e (Playwright es el estándar actual; Cypress
  sigue siendo válido si ya está en el proyecto).
- Tests deshabilitados dejados en el código: `xit`, `xdescribe`,
  `it.skip`, `fdescribe`/`fit` olvidados (estos últimos hacen que SOLO ese
  test corra, silenciando el resto sin que nadie lo note).
