# AI Agent Guidelines for Predicador Frontend

This Angular 22 app manages territory tracking and reporting for door-to-door ministry work, with map-based UI (Leaflet), WhatsApp integration, and SSR support.

## Quick Start

**Build/Run Commands:**
- `pnpm start` — Dev server (http://localhost:4200)
- `pnpm test` / `pnpm run test:watch` — Vitest with jsdom environment
- `pnpm run build` — Production build
- `pnpm run lint` / `pnpm run lint:fix` — ESLint check/fix
- `pnpm run serve:ssr:predicador-frontend` — Run SSR production server

**Key Files:**
- [src/app/app.routes.ts](src/app/app.routes.ts) — Routing config (standalone components, lazy-loaded)
- [src/app/core/models/models.ts](src/app/core/models/models.ts) — All domain interfaces (UserProfile, Reporte, WhatsAppSendRequest, etc.)
- [src/app/core/guards/profile.guard.ts](src/app/core/guards/profile.guard.ts) — Route protection
- [angular.json](angular.json) — Build config and schematics

## Architecture

**Feature-based structure:**
- `core/` — Singleton services (Profile, TerritorioService, Toast, WhatsAppService, EncargadoService), guards, interceptors, models
- `features/` — Standalone lazy-loaded page components: auth/login, map, profile, admin
- `shared/` — Reusable components (avatar-selector, screenshot-modal, toast, pipes)
- `environments/` — Runtime config

**Key Services:**
- `Profile` — User login/profile state
- `TerritorioService` — Territory data (manzanas/blocks)
- `Toast` — Alert notifications (info|success|error|warning)
- `WhatsAppService` — Send reports via WhatsApp with screenshot
- `EncargadoService` — Coordinator/supervisor data

## Conventions & Patterns

**Angular Standards:**
- Selector prefixes: Component `app-` (kebab-case), Directive `app` (camelCase)
- Standalone components (no NgModule)
- Route guards: `canActivate: [profileGuard]` protects map
- Lazy loading: `loadComponent: () => import('./features/...').then(m => m.PageComponent)`
- Specs enabled by default in schematics (`skipTests: false`); review the generated `.spec.ts` so it follows the repo's Vitest/TestBed conventions

**TypeScript Strictness:**
- `noImplicitAny` — Use `@ts-expect-error` comment if needed (prefer fixing)
- `noImplicitReturns` — All code paths must return
- `noFallthroughCasesInSwitch` — Explicit breaks in switches
- `noPropertyAccessFromIndexSignature` — Type-safe property access

**ESLint Rules:**
- `@typescript-eslint/no-explicit-any`: warn — Any types are flagged; fix them
- `@typescript-eslint/no-floating-promises`: error — Must `await` Promises
- `no-console`: warn (allow warn/error) — Debug logs should use console.warn/error
- Prettier enforced — Use `pnpm run lint:fix` to auto-format

**Testing:**
- Vitest + jsdom (browser-like DOM)
- Setup: [src/test-setup.ts](src/test-setup.ts)
- Spec files: `*.spec.ts` co-located with source
- DTO/Model testing: Verify interface shapes with test data

## Domain Knowledge

**Territorio (Territory):**
- Divided into **manzanas** (city blocks) identified by string IDs
- Reports track progress: `manzanasMarcadas` (visited) vs `totalManzanas`
- States: pending, in-progress, completed
- Session types: predicacion (preaching), otro (other)

**Reporte (Report):**
- Links encargado (coordinator) to territorio work session
- Captures: date, blocks visited, session time, notes
- Can include geometry (partial coverage) and points (GPS/coordinates)
- Sendable via WhatsApp with screenshot

**Authentication:**
- Login required (profileGuard on /map route)
- UserProfile: name, lastName, avatar (index), phone, encargadoId
- Session persisted (check Profile service for storage mechanism)

**Map UI:**
- Leaflet-based territory visualization
- Territory search component for quick lookup
- Screenshot capture for WhatsApp reports

## Common Tasks

**Adding a new feature page:**
1. Create component in `features/{feature-name}/` with lazy route
2. Use `profileGuard` if auth required
3. Import core services via DI
4. Add route to [src/app/app.routes.ts](src/app/app.routes.ts)

**Adding a shared component:**
1. Create in `shared/components/{name}/`
2. Export in feature/page component
3. Follow selector prefix: `app-{name}`

**Modifying models:**
1. Update interface in [src/app/core/models/models.ts](src/app/core/models/models.ts)
2. Regenerate DTO mappings if backend API changes
3. Update tests to reflect new shape

**Working with maps:**
- Leaflet docs: https://leafletjs.com
- Territory markers typically use manzana IDs
- See `map-geometry.ts` and `map-report.service.ts` for patterns

## Testing Strategy

- `skipTests: false` is set in `angular.json`, so `ng generate` produces `.spec.ts` files by default
- Test file location: co-located `*.spec.ts`
- Use `@analogjs/vitest-angular` helpers for Angular testing
- Mock services with `vi.spyOn` or `vi.mock`

## Key Gotchas

1. **Floating Promises** — ESLint enforces Promise handling; always `await` or `.subscribe()`
2. **Any Type** — `any` triggers warnings; use proper types or `unknown` with type guards
3. **Tests Disabled by Default** — Remember to enable if scaffolding new components
4. **SSR Differences** — `window` / `document` don't exist in server context; wrap in platform check
5. **Territory Geometry** — Geometry strings are JSON; parse before rendering

## Useful Aliases & Paths

Check `tsconfig.app.json` for path aliases (likely `@app`, `@core`, etc.):
- Run `ng generate component component-name` for proper scaffolding
- Always use absolute imports via aliases for clarity

## Architecture & Design Patterns

**IMPORTANT:** Review [ARCHITECTURE.md](ARCHITECTURE.md) for comprehensive guidance on:
- **Current Strengths & Pain Points** — Analysis of what's working and what needs improvement
- **Recommended Patterns** — Repository Pattern, Use Cases, Clean Architecture layers, State Management
- **Refactoring Strategy** — How to incrementally improve MapPage, services, and testing
- **5-Phase Implementation Plan** — Roadmap to scale the codebase cleanly

Key recommendations:
- Extract business logic from components into use cases (domain layer)
- Implement Repository Pattern for data abstraction
- Create DTO Mappers to decouple API models from domain entities
- Centralize state management with AppStore (Signals)
- Split large components (e.g., MapPage) into smaller, focused services

---

**Need help on a specific area?** Mention territory logic, map interactions, authentication, or reporting workflows, and reference the relevant service or feature.
