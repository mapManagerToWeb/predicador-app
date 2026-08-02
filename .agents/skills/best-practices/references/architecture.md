# Arquitectura — proyecto `predicador-frontend`

## Estructura objetivo (ya en uso)
```
src/app/
  core/       # singletons: Profile, AuthTokenService, TerritorioService, Toast,
              # WhatsAppService, EncargadoService, RumService; guards, interceptors, models
  features/   # standalone lazy pages: auth/login, map, profile, admin
  shared/     # componentes reutilizables
```

## Reglas
- **Organizar por feature, no por tipo.** No crear `components/`, `services/`
  globales; agrupar por dominio (aquí: `core/`, `features/`, `shared/`).
- **Standalone siempre.** Nuevos componentes/páginas sin NgModule.
- **Lazy loading real por página**: `loadComponent: () => import('./features/...').then(m => m.X)`.
- **Guards funcionales** (`CanActivateFn`) con `inject()`, nunca class-based.
- **Un concepto por archivo.** Nombres kebab-case; spec co-localizado y del
  mismo nombre que su fuente (`map-style.service.ts` ↔ `map-style.service.spec.ts`).

## Patrones recomendados (según `ARCHITECTURE.md` del repo)
- Extraer lógica de negocio de componentes a services/use-cases (el mapa usa
  ya facades/services: `map-rendering.facade`, `map-selection.service`...).
- Repository Pattern vía `TerritorioService`/`WhatsAppService`; mappers de DTO
  a dominio.
- Estado centralizado con Signals (`MapStateService`).
- No se justifica hoy: monorepo Nx ni micro-frontends (Module Federation).
  Si el árbol crece, el siguiente paso es límites de librería por feature,
  no micro-frontends.

## DI
- Preferir `inject()` sobre constructor-DI (guía oficial).
- `providedIn: 'root'` para singletons; considerar `providedIn` por feature
  solo si el servicio va asociado a una ruta lazy.
- `auth-token.ts` usa constructor-DI con `@Optional() http?: HttpClient` y
  `eslint-disable @angular-eslint/prefer-inject`: decisión documentada para
  permitir construcción directa en tests/SSR. El oficial es
  `inject(HttpClient, { optional: true })`; migrarlo es un refactor válido
  pero requiere ajustar los callers que construyen el servicio a mano.
- El estado del mapa (`MapStateService`) mezcla signals reactivas con
  getters/setters mutables (`_manzanaEdges`, `_manzanaSeleccionada*`): estado
  híbrido. Al refactorizar, convertir a signals las piezas que alimentan
  templates o computeds.
