# Rendimiento — proyecto `predicador-frontend`

Verificar contra la doc oficial vigente: https://angular.dev/best-practices/performance

## Carga
- **Lazy routes** por feature (`loadComponent`) — ya en uso en este proyecto.
- **`@defer`** con `@placeholder`/`@loading` para componentes pesados fuera del
  viewport inicial (mapa, modales de captura, libs de terceros).
- **Librerías grandes**: `html2canvas` (~200 KB) y `leaflet` ya viven en chunks
  lazy por el import dinámico; mantener esa estrategia. `leaflet` está
  declarado como CommonJS permitido en `angular.json` (`allowedCommonJsDependencies`).
- **`NgOptimizedImage`** para imágenes estáticas (aquí los avatares son emoji,
  no aplica; si llegan imágenes reales, usar el directive con `priority` en LCP).

## Gotcha PWA: Leaflet CSS (resuelto 2026-08)
- `leaflet.css` se bundlea localmente vía `angular.json` → `styles`
  (`node_modules/leaflet/dist/leaflet.css`); sus imágenes se copian a `media/`
  con hash y las URLs se reescriben. Ambos entran en ngsw (grupos `app`
  `/*.css` y `assets` `/**/*.png`) → el mapa funciona offline. Ya **no** hay
  dependencia de `unpkg.com` en `index.html`. Si se reintroduce una lib CSS de
  CDN, aplicar el mismo criterio: mismo origen + caché ngsw.

## SSR / SEO (requisito del proyecto)
- SSR + `provideClientHydration()` activos. Considerar hydration incremental
  para secciones pesadas cuando la app crezca.
- Presupuestos de bundle en `angular.json` (`initial`: warning/error) ya
  configurados; mantenerlos y vigilarlos.
- RUM real (`web-vitals` + `sendBeacon` a `/api/v1/rum`) ya implementado; no
  bloquear nunca el UX con él.

## Runtime / detección de cambios
- **Zoneless** ya activo (`provideZonelessChangeDetection`). No reintroducir
  dependencias de `zone.js` en el bundle de producción (solo se necesita para
  tests: `@analogjs/vitest-angular/setup-zone`).
- `ChangeDetectionStrategy.OnPush` en componentes con estado derivado por
  Signals; no forzarlo donde el default ya es óptimo.
- Evitar objetos/funciones nuevas inline en templates que rompan memoización.
- `computed()` para lógica derivada; `@for` con `track` para listas.

## Aparición de regresiones
- Tras tocar templates/imports: comparar tamaños de chunk del `ng build`
  (output de `Lazy chunk files`).
- Si una librería pesada aparece en el chunk principal, mover a import
  dinámico o `@defer`.
