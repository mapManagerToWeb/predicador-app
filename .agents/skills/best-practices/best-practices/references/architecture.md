# Referencia de Arquitectura

## Estructura del proyecto

```
predicador-frontend/src/app/
├── app.ts              # Componente raíz (OnPush, zoneless)
├── app.config.ts       # Providers (zoneless, router, http, SSR, PWA)
├── app.routes.ts       # Lazy-loaded routes
├── core/               # Servicios singleton, guards, interceptors, models
│   ├── guards/         # profileGuard, adminGuard
│   ├── interceptors/   # auth, csrf, error
│   ├── models/         # Interfaces de dominio (UserProfile, Reporte, etc.)
│   └── services/       # Profile, AuthToken, AuthService, Territorio, WhatsApp, etc.
├── features/           # Páginas lazy-loaded
│   ├── auth/login/
│   ├── map/            # Mapa Leaflet + 15 servicios especializados
│   ├── profile/
│   └── admin/
├── shared/             # Componentes reutilizables
└── environments/       # Config runtime
```

## Patrones arquitectónicos

### Feature-based organization
Cada feature es autocontenido con sus componentes, servicios y tipos. Los servicios compartidos vienen de `core/`.

### Service decomposition (map feature)
El mapa está descompuesto en 15 servicios especializados siguiendo Single Responsibility:
- `MapStateService`: estado reactivo (signals)
- `MapEngineService`: lifecycle del mapa Leaflet
- `MapTerritoryLayerService`: GeoJSON loading + viewport-based rendering
- `MapRenderingFacade`: coordinación de sub-servicios
- `MapSelectionService`: lógica de selección/marcado
- `MapInteractionService`: dispatch de clicks
- `MapDataPersistenceService`: guardado + envío WhatsApp
- ...y más

### State management
- **Signals** para todo el estado reactivo (no NgRx, no BehaviorSubject)
- `computed()` para valores derivados
- Estado Leaflet (layers, markers) usa estructuras plain (Map) — no signals, porque no se lee en templates

### Inyección de dependencias
- `inject()` como patrón principal
- `providedIn: 'root'` para servicios singleton
- `{ providedIn: 'root' }` en `@Injectable` decorator

## Decisiones de diseño documentadas

### Zoneless change detection
La app usa `provideZonelessChangeDetection()` — Zone.js solo se usa en tests. Esto elimina la sobrecarga de Zone.js en producción.

### SSR strategy
- `/login`: prerender estático (RenderMode.Prerender)
- Resto: client-only (RenderMode.Client) — el mapa no se puede prerenderizar
- `afterNextRender()` para inicialización de Leaflet (browser-only)

### Viewport-based territory loading
Las capas de territorio se cargan/descargan según el viewport del mapa, no todo de una vez. Esto es crítico para rendimiento en móvil con muchos territorios.

## Patrones a evitar

- **God services**: un servicio no debe tener >200 líneas o >5 responsabilidades
- **Signal arrays con spread**: `update(arr => [...arr, item])` crea copias innecesarias
- **RxJS para estado UI**: usar Signals, reservar RxJS para streams de eventos (HTTP, WebSockets)
- **Template-driven forms en nuevos componentes**: preferir Reactive Forms o Signals
