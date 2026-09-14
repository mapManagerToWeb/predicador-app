## Why

El renderizado del mapa presenta problemas de rendimiento en dispositivos de gama baja y medianas, especialmente durante pinch-zoom y al cargar múltiples territorios con geometrías complejas. El canvas software-rendered de Leaflet genera frames lentos cuando hay muchos vértices, polígonos semitransparentes y animaciones activas. Las optimizaciones propuestas atacan la causa raíz: reducir vértices, aíslar redibujados, y eliminar frames innecesarios.

## What Changes

- **Simplificación de geometría**: Aplicar Douglas-Peucker (`@turf/simplify`) a los GeoJSON de manzanas para reducir vértices sin pérdida visual significativa
- **Renderer separado para marcados**: Usar `markRenderer` en capas que reciben `setStyle` para aislar el redibujado de manzanas marcadas/seleccionadas
- **LOD por zoom**: Mostrar polígonos disueltos por territorio (~20 formas) en zoom bajo, y manzanas individuales solo pasado el umbral `labelMinZoom`
- **Desactivar animaciones**: Configurar `zoomAnimation: false`, `markerZoomAnimation: false`, `inertia: false`, `fadeAnimation: false` en el mapa
- **Reducir weight/fillOpacity**: Disminuir grosor de borde y opacidad de relleno en estilos base para reducir compositing costoso

## Capabilities

### New Capabilities
- `map/performance`: Optimizaciones de rendimiento del renderizado del mapa (simplificación de geometría, LOD por zoom, renderer separado, desactivación de animaciones, reducción de peso visual)

### Modified Capabilities

## Impact

- **Archivos afectados**:
  - `map-engine.service.ts` — opciones de animación del mapa
  - `map-territory-layer.service.ts` — simplificación GeoJSON, LOD por zoom
  - `map-style.service.ts` — weight/fillOpacity reducidos, markRenderer
  - `map-constants.ts` — nuevos umbrales LOD
  - `map-selection.service.ts` — usar markRenderer para marcados
- **Dependencias nuevas**: `@turf/simplify` (geometría simplificación)
- **Riesgo**: Bajo — cambios son incrementales y no afectan la API existente
- **Testing**: Verificar que el mapa se renderiza correctamente en zoom bajo/alto, que los marcados se aíslan, y que las animaciones desactivadas no rompan la UX
