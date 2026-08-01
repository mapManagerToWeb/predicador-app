# Accesibilidad (WCAG AA) — proyecto `predicador-frontend`

Verificar contra la doc oficial vigente: https://angular.dev/best-practices/a11y

## Estado actual (2026-08)
- El template del mapa (`map.html`) ya usa buenas prácticas: `role="status"`,
  `aria-live="polite"`, `aria-label`/`aria-pressed` en botones de estado,
  SVGs con `aria-hidden="true" focusable="false"`, `label for` para selects.
- ESLint con `angular.configs.templateAccessibility` activo en
  `eslint.config.js` — los cambios en templates deben mantenerlo en verde.

## Checklist
- **Elementos nativos**: `<button>`, `<a>`, `<input>`, `<label for>` antes que
  divs con `(click)`.
- **ARIA**: `aria-label`/`aria-labelledby` en controles sin texto visible;
  `role` y `aria-live` en regiones dinámicas; `aria-pressed`/`aria-current`
  para estado visual.
- **Foco tras navegación**: gestionar el foco al cambiar de ruta (p. ej.
  `NavigationEnd` → focus al header del contenido); evitar que el foco vuelva
  a `body`.
- **Links activos**: `routerLinkActive` + `ariaCurrentWhenActive="page"`.
- **`@defer`**: envolver bloques diferidos en `aria-live` para anunciar
  contenido que llega asíncrono.
- **Modales/dialogs**: trampa de foco (`cdkTrapFocus` del CDK o Angular Aria)
  y gestión de apertura/cierre por teclado.
- **Contraste**: mantener ratios WCAG AA en colores de territorio/estado
  (los polígonos usan `fillOpacity` bajo para incompletos; verificar que el
  estado siga siendo legible).
- **Teclado**: toda acción del mapa accesible por teclado además de clic.

## Angular Aria
- Para patrones WAI-ARIA reutilizables (accordion, combobox, listbox, menu,
  tabs, toolbar) usar `@angular/aria` (headless directives del equipo) o el
  CDK `a11y` (`LiveAnnouncer`, `cdkTrapFocus`) en vez de reimplementar.

## Verificación
- `npm run lint` (incluye reglas de template-accessibility).
- Revisión manual con DevTools: árbol de accesibilidad, orden de tabulación,
  contraste, y prueba con lector de pantalla en el flujo crítico del mapa.
