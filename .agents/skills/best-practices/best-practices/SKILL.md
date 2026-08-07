---
name: best-practices
description: Audita y corrige malas prácticas en este proyecto Angular (arquitectura, signals, rendimiento, seguridad, accesibilidad, testing y cobertura, legibilidad). Úsalo antes de un PR, al revisar código nuevo o al planear refactors.
license: MIT
compatibility: opencode
metadata:
  framework: angular
  angular-version: "22"
  last-verified: "2026-08-07"
---

# Best Practices — predicador-frontend

Skill de auditoría y corrección para el frontend Angular 22 de Predicador (app móvil-first de gestión de territorios y reportes de predicación).

## Contexto del proyecto

- **Angular 22** standalone, zoneless (`provideZonelessChangeDetection`), Signals + `computed`
- **Vitest** (migrado de Karma), ESLint + Prettier
- **SSR** con prerender solo de `/login`, `/map` y resto client-only
- **PWA** con Service Worker
- **Flujos críticos**: login por teléfono → marcado de territorios (completo/parcial) → envío por WhatsApp

## Checklist de detección rápido

### Arquitectura y rendimiento

- [ ] **Zoneless activo**: `provideZonelessChangeDetection()` en `app.config.ts`
- [ ] **OnPush en todos los componentes**: `changeDetection: ChangeDetectionStrategy.OnPush`
- [ ] **Signals para estado reactivo**: `signal()`, `computed()` — NO RxJS para estado UI
- [ ] **inject() sobre inyección por constructor**: salvo casos documentados (SSR tests)
- [ ] **Lazy loading real**: `loadComponent: () => import(...)` en rutas
- [ ] **Control de flujo moderno**: `@if`, `@for`, `@switch` — NO `*ngIf`, `*ngFor`
- [ ] **`track` en `@for`**: siempre expresión de track (`@for (item of items(); track item.id)`)
- [ ] **OnPush + zoneless compatible**: sin lógica que dependa de Zone.js en templates

### Hot paths (rendimiento en móvil)

- [ ] **O(1) lookups en arrays grandes**: usar `Map<K, V>` en vez de `.find()`/`.filter()` en loops
- [ ] **Sin signal arrays con spread copies**: `signal<T[]>` con `update(arr => [...arr, item])` crea copias innecesarias. Usar estructuras plain + Map
- [ ] **Sin querySelector en hot paths**: labels/elementos Leaflet gestionados por Map, no por DOM traversal
- [ ] **Singleton para objetos inmutables**: estilos compartidos como `Object.freeze()` constante
- [ ] **CSS de terceros en lazy bundle**: librerías pesadas (Leaflet, html2canvas) no en initial bundle
- [ ] **Promise.all para operaciones paralelas**: no `for await` cuando las operaciones son independientes
- [ ] **Timers limpiados**: `setTimeout`/`setInterval` siempre con cleanup en `DestroyRef.onDestroy`

### Seguridad

- [ ] **Sin bypassSecurityTrust***: nunca `bypassSecurityTrustHtml`, `bypassSecurityTrustUrl`, etc.
- [ ] **Sin innerHTML sin sanitizar**: usar `DomSanitizer` si es inevitable
- [ ] **CSRF configurado**: `withInterceptors([csrfInterceptor])` + cookie XSRF-TOKEN
- [ ] **allowedHosts en SSR**: `angular.json` → `security.allowedHosts` no vacío en producción
- [ ] **Cabeceras de seguridad**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` en server.ts

### Testing y cobertura

- [ ] **Vitest como runner**: `npm test` usa Vitest, no Karma
- [Tests de comportamiento real](references/testing-coverage.md): verificar lógica, no solo constructores
- [ ] **Mocks completos**: cuando se mockea un servicio, incluir todos los métodos públicos que se usan
- [ ] **Cobertura de flujos críticos**: login, marcado, envío WhatsApp, selección múltiple

### Accesibilidad

- [ ] **ARIA labels**: botones sin texto visible siempre tienen `aria-label`
- [ ] **role/aria-live**: toasts y loading con `role="status"` y `aria-live="polite"`
- [ ] **Foco manejado**: modales y dropdowns atrapan y restauran el foco
- [ ] **Contraste WCAG AA**: verificar colores de territorio contra fondo

### Legibilidad

- [ ] **Nomenclatura**: kebab-case archivos, `.spec.ts` sufijo, un concepto por archivo
- [ ] **Sin `any` explícito**: usar tipos propios o `unknown` con type guards
- [ ] **Sin floating promises**: ESLint `@typescript-eslint/no-floating-promises: error`
- [ ] **No-console**: solo `console.warn`/`console.error` permitidos

## Flujo de trabajo del agente

1. **Escanear**: ejecutar `npm run lint` y revisar archivos modificados
2. **Clasificar**: para cada hallazgo, asignar severidad (Crítico / Alto / Medio / Bajo)
3. **Proponer fix**: antes de editar, explicar el cambio y por qué
4. **Aplicar con tests**: cada cambio debe incluir tests si afecta lógica de negocio
5. **Verificar**: `npm run lint` + `npm run build` + `npm test -- --run` en verde

## Quick wins más comunes en este proyecto

| Problema | Fix |
|---|---|
| `array.find()` en hot path | Usar `Map<K, V>` para O(1) |
| `signal<T[]>` con spread | Estructura plain + Map para datos Leaflet |
| `querySelector` en loop | Map con key directa |
| Librería pesada en initial bundle | Mover a componente lazy via `@import` |
| `setTimeout` sin cleanup | Guardar timer ID + `DestroyRef.onDestroy` |
| `for await` de ops independientes | `Promise.all(array.map(...))` |
| CSS de terceros global | Mover a componente que lo usa |

## Nota de mantenimiento

> **Angular publica una versión mayor cada ~6 meses.** Antes de aplicar cualquier regla de este skill, verifica que sigue vigente en:
> - `angular.dev/style-guide`
> - `angular.dev/best-practices`
> - `angular.dev/guide/zoneless` (cambios en zoneless API)
> - CHANGELOG de github.com/angular/angular para la versión detectada

## Referencia cruzada

Para dudas puntuales de sintaxis, APIs o scaffolding, consultar el skill oficial `angular-developer` (instalado en `.claude/skills/angular-developer/`). Este skill se enfoca en auditoría, diagnóstico y remediación específicos de este proyecto, no duplica contenido del skill oficial.

## Referencias detalladas

- [Arquitectura](references/architecture.md)
- [Seguridad](references/security.md)
- [Rendimiento](references/performance.md)
- [Testing y cobertura](references/testing-coverage.md)
- [Accesibilidad](references/accessibility.md)
