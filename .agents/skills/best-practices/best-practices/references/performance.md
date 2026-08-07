# Referencia de Rendimiento

## Rendimiento de carga

### Lazy loading
- **Rutas**: todas las features usan `loadComponent: () => import(...)`
- **CSS de terceros**: mover a componente lazy via `@import 'library/path.css'`
- **Librerías pesadas**: Leaflet, html2canvas, polygon-clipping deben estar en chunks lazy

### Presupuestos de bundle (angular.json)
```json
"budgets": [
  { "type": "initial", "maximumWarning": "320kB", "maximumError": "600kB" },
  { "type": "anyComponentStyle", "maximumWarning": "24kB", "maximumError": "32kB" }
]
```

### Optimización de imágenes
- `NgOptimizedImage` para imágenes estáticas
- `preconnect` y `dns-prefetch` en `index.html` para CDNs
- `font-display: swap` en Google Fonts

## Rendimiento de runtime

### Hot paths comunes en este proyecto

| Hot path | Problema típico | Solución |
|---|---|---|
| Click en mapa | `.find()` en array de territorios | `Map<number, FeatureLayer>` → O(1) |
| Pan/zoom del mapa | `new Set(array.map())` en cada moveend | `map.has(key)` directo |
| Selección de territorio | `.filter().length` en manzanas | `Map<number, ManzanaIndex[]>` → O(1) count |
| Labels de territorio | `querySelector` en cada label | `Map<number, L.Marker>` → O(1) acceso |
| Estilos ocultos | `{ ...STYLE }` spread por llamada | Singleton `Object.freeze()` |
| Restauración DB | `for await` secuencial | `Promise.all(array.map())` |

### Reglas para hot paths

1. **Arrays → Maps para lookups frecuentes**: si haces `.find()` o `.filter()` en un loop, usa Map
2. **Sin signal arrays con spread**: `signal<T[]>` + `update(arr => [...arr, item])` crea copias. Usa estructura plain + Map para datos que no se leen en templates
3. **Sin querySelector en hot paths**: gestiona referencias Leaflet por Map, no por DOM traversal
4. **Singleton para objetos inmutables**: estilos compartidos, configuraciones constantes
5. **CSS de terceros en lazy bundle**: no en `angular.json` global styles
6. **Timers limpiados**: `setTimeout`/`setInterval` siempre con cleanup en `DestroyRef.onDestroy`
7. **Promise.all para ops paralelas**: no `for await` cuando las operaciones son independientes

### Camb detection optimization

- **OnPush en todos los componentes**: ya implementado
- **Zoneless**: `provideZonelessChangeDetection()` — elimina sobrecarga de Zone.js
- **`track` en `@for`**: siempre para reutilizar nodos DOM
- **Lógica compleja en `computed()`**: no embeber en templates
- **`ChangeDetectorRef.markForCheck()`**: solo cuando sea necesario en zoneless

### Leaflet específico

- **Viewport-based loading**: cargar/descargar capas según bounds del mapa
- **rAF batching**: `queueStyleUpdate()` agrupa cambios de estilo en un frame
- **GeoJSON parse una vez**: parsear al cargar, no en cada render
- **Layer registry**: `Map<string, L.Path>` para acceso O(1) a manzanas marcadas

## Medición

```bash
# Build con análisis de bundles
npm run build

# Lighthouse (requiere servidor corriendo)
npx lighthouse http://localhost:4000 --view

# Angular DevTools Profiler (extensión de Chrome)
# → Registrar ciclo de detección de cambios
```

## Web Vitals objetivo

| Métrico | Objetivo |
|---|---|
| LCP | < 2.5s |
| INP | < 200ms |
| CLS | < 0.1 |
| TTFB | < 800ms |
| FCP | < 1.8s |
