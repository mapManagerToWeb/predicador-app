# Referencia de Accesibilidad

## Estándar objetivo

**WCAG 2.1 AA** — nivel mínimo para aplicaciones web.

## Checklist de accesibilidad

### Semántica HTML
- [ ] **Estructura jerárquica**: `<h1>` → `<h2>` → `<h3>`, no saltar niveles
- [ ] **Landmarks**: `<main>`, `<nav>`, `<header>`, `<footer>` donde corresponda
- [ ] **Listas**: usar `<ul>`/`<ol>` para colecciones de items
- [ ] **Tablas**: `<caption>`, `<th>` con `scope`, `<thead>`/`<tbody>`

### ARIA
- [ ] **Labels siempre**: botones sin texto visible → `aria-label`
- [ ] **Roles correctos**: `role="status"` para toasts, `role="alert"` para errores críticos
- [ ] **Live regions**: `aria-live="polite"` para actualizaciones asíncronas, `aria-live="assertive"` para errores
- [ ] **Estados**: `aria-pressed`, `aria-expanded`, `aria-selected` para elementos interactivos
- [ ] **Referenced elements**: `aria-labelledby`, `aria-describedby` cuando el label no es suficiente

### Contraste
- [ ] **Texto normal**: ratio ≥ 4.5:1 (AA), ≥ 7:1 (AAA)
- [ ] **Texto grande** (≥18px o ≥14px bold): ratio ≥ 3:1 (AA)
- [ ] **Componentes UI**: ratio ≥ 3:1 para bordes, iconos, focus indicators
- [ ] **No información solo por color**: territorios marcados deben tener indicador visual + texto

### Teclado
- [ ] **Focus visible**: `:focus-visible` con outline claro
- [ ] **Tab order lógico**: `tabindex` solo para elementos interactivos
- [ ] **No keyboard traps**: modales y dropdowns deben poder cerrarse con Escape
- [ ] **Skip links**: link al contenido principal para usuarios de teclado
- [ ] **Focus management**: al abrir modal, mover foco al primer elemento; al cerrar, restaurar

### Formularios
- [ ] **Labels asociados**: `<label for="id">` o `aria-label`
- [ ] **Errores descriptivos**: no solo "campo requerido", sino "El teléfono debe tener 9 dígitos"
- [ ] **Required indicado**: visualmente y con `aria-required="true"`
- [ ] **Autocomplete**: `autocomplete="tel"`, `autocomplete="name"` etc.

### Movimiento y animaciones
- [ ] **Respetar `prefers-reduced-motion`**: `@media (prefers-reduced-motion: reduce)`
- [ ] **Sin contenido parpadeante**: no más de 3 parpadeos por segundo
- [ ] **Pausar animaciones**: animaciones automáticas deben poder pausarse

### Touch targets
- [ ] **Tamaño mínimo**: 44x44 CSS pixels para elementos interactivos (WCAG 2.5.5)
- [ ] **Espaciado**: mínimo 8px entre touch targets
- [ ] **Margen de error**: áreas de touch no deben superponerse accidentalmente

## Ejemplos en el proyecto

### Toast (bien implementado)
```html
<div class="toast" role="status" aria-live="polite" aria-atomic="true">
  <span class="toast-text">{{ message }}</span>
</div>
```

### Botón con solo icono (bien implementado)
```html
<button (click)="toggleSatellite()" [attr.aria-label]="isSatellite() ? 'Vista normal' : 'Vista satélite'">
  <svg aria-hidden="true">...</svg>
</button>
```

### Loading overlay (bien implementado)
```html
<div class="loading-overlay" role="status" aria-live="polite">
  <span class="loading-text">Cargando territorios...</span>
</div>
```

## Verificación

### Herramientas
- **axe DevTools**: extensión de navegador para auditoría automática
- **Lighthouse**: auditoría de accesibilidad integrada
- **Screen reader**: probar con VoiceOver (macOS) o NVDA (Windows)
- **Keyboard navigation**: navegar toda la app sin mouse
- **Zoom 200%**: verificar que todo sigue siendo usable

### Verificación manual rápida
1. Activar VoiceOver → navegar login → mapa → admin
2. Usar solo Tab/Shift+Tab/Enter/Escape
3. Activar `prefers-reduced-motion` en SO
4. Zoom al 200% en navegador
5. Activar alto contraste en SO
