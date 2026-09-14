## Context

El mapa usa Leaflet con `preferCanvas: true` para renderizado en Canvas. Actualmente no hay simplificación de geometría, no hay LOD por zoom (solo viewport culling a nivel de territorio), las animaciones están habilitadas por defecto, y los estilos usan weight 4 y fillOpacity 0.85. El viewport culling ya existe en `map-territory-layer.service.ts` usando bounding boxes pre-computadas.

## Goals / Non-Goals

**Goals:**
- Reducir vértices renderizados por frame mediante simplificación Douglas-Peucker
- Aislar redibujado de manzanas marcadas/seleccionadas con renderer separado
- Implementar LOD por zoom para mostrar menos formas en zoom bajo
- Eliminar frames innecesarios deshabilitando animaciones
- Reducir coste de compositing con weight/fillOpacity menores

**Non-Goals:**
- Web Worker offloading (marcado como candidato futuro en comments)
- Cambios en la arquitectura de servicios existente
- Modificar la API del backend o el formato GeoJSON

## Decisions

### 1. Simplificación con @turf/simplify
**Decisión**: Usar `@turf/simplify` con tolerance 0.0001 en `map-territory-layer.service.ts` al cargar GeoJSON.
**Alternativas consideradas**:
- Simplificación pre-computada en backend: Requiere cambios en backend y migración de datos
- Simplificación por zoom en runtime: Más complejo, requiere cache de múltiples versiones
**Razón**: Simplificación en frontend es incremental, no requiere cambios backend, y tolerance 0.0001 preserva forma visual en zoom 15.

### 2. Mark renderer separado
**Decisión**: Crear `L.canvas()` separado para capas que reciben `setStyle`, pasándolo como `renderer` en las opciones de `L.geoJSON` para marcados.
**Alternativas consideradas**:
- SVG solo para marcados: Más overhead de DOM
- RequestAnimationFrame batching: Ya existe en `MapStyleService`, pero no aísla redibujado
**Razón**: Canvas separado es ligero y aísla completamente el redibujado sin overhead de DOM.

### 3. LOD por zoom con geometrías disueltas
**Decisión**: Pre-computar polígonos disueltos por territorio usando `@turf/union` y mostrarlos en zoom < 14.
**Alternativas consideradas**:
- Ocultar manzanas individuales sin disolver: Solo funciona si no hay gaps
- Usar clusterización de polígonos: Más complejo, innecesario para ~20 territorios
**Razón**: Union produce un solo polígono por territorio, reduciendo de ~500+ polígonos a ~20.

### 4. Deshabilitar animaciones
**Decisión**: Configurar `zoomAnimation: false`, `markerZoomAnimation: false`, `inertia: false`, `fadeAnimation: false` en `L.map()`.
**Alternativas consideradas**:
- Reducir duración de animaciones: Menos efectivo en gama baja
- Usar CSS transitions: No aplica a Canvas rendering
**Razón**: Eliminar animaciones es la forma más directa de reducir frames en dispositivos lentos.

### 5. Reducir weight y fillOpacity
**Decisión**: Reducir weight de 4 a 2 y fillOpacity de 0.85 a 0.6 en estilos base.
**Alternativas consideradas**:
- Weight dinámico por zoom: Más complejo, beneficio marginal
- Solo reducir fillOpacity: Weight también contribuye al compositing cost
**Razón**: Reducciones modestas que reducen compositing sin afectar legibilidad.

## Risks / Trade-offs

- **[Simplificación]** → Pérdida de precisión en polígonos complejos. Mitigación: tolerance 0.0001 es conservador, verificable visualmente.
- **[Mark renderer]** → Dos instancias de Canvas en memoria. Mitigación: Canvas es ligero, ~1MB adicional.
- **[LOD disuelto]** → Polígonos disueltos pueden no representar gaps reales. Mitigación: Solo visible en zoom bajo donde gaps no son relevantes.
- **[Animaciones deshabilitadas]** → UX menos pulida. Mitigación: Dispositivos gama baja priorizan rendimiento sobre animación.
- **[Weight reducido]** → Bordes menos prominentes. Mitigación: Solo en territorios no seleccionados, selección mantiene weight 4.

## Migration Plan

1. Instalar `@turf/simplify` y `@turf/union` como dependencias
2. Implementar simplificación en `map-territory-layer.service.ts` (carga GeoJSON)
3. Agregar markRenderer en `map-selection.service.ts` y `map-style.service.ts`
4. Pre-computar polígonos disueltos en `map-territory-layer.service.ts`
5. Configurar LOD en `map-territory-layer.service.ts` (zoom threshold)
6. Deshabilitar animaciones en `map-engine.service.ts`
7. Ajustar estilos en `map-style.service.ts` y `map-constants.ts`

Rollback: Revertir cambios en orden inverso, cada optimización es independiente.
