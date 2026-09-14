## Purpose

Optimizar el rendimiento del renderizado del mapa en dispositivos de gama baja y medianas, reduciendo el trabajo por frame durante pinch-zoom y carga de múltiples territorios con geometrías complejas.

## ADDED Requirements

### Requirement: Geometry simplification
The system SHALL apply Douglas-Peucker simplification to GeoJSON manzana geometries when loading territories, reducing vertex count without significant visual loss.

#### Scenario: Simplification at load time
- **WHEN** a territory GeoJSON is loaded from cache or network
- **THEN** each manzana polygon SHALL be simplified using `@turf/simplify` with tolerance 0.0001 before being added to the map

#### Scenario: Visual preservation
- **WHEN** simplification is applied
- **THEN** the simplified geometry SHALL maintain the original polygon shape within 2px deviation at zoom 15

### Requirement: Mark renderer isolation
The system SHALL use a separate Canvas renderer for layers that receive `setStyle` calls (marked/selected manzanas) to isolate redrawing.

#### Scenario: Marked manzana uses separate renderer
- **WHEN** a manzana is marked or selected
- **THEN** its layer SHALL use a dedicated `markRenderer` instance separate from the default map renderer

#### Scenario: Isolated redraw
- **WHEN** a manzana is marked
- **THEN** only the marked manzana layer SHALL be redrawn, not other territory layers

### Requirement: Level of detail by zoom
The system SHALL show simplified dissolved polygons per territory at low zoom levels, and individual manzanas only above the `labelMinZoom` threshold.

#### Scenario: Low zoom shows territory outlines
- **WHEN** zoom level is below `labelMinZoom` (14)
- **THEN** each territory SHALL display a single dissolved polygon (~20 shapes total) instead of individual manzanas

#### Scenario: High zoom shows individual manzanas
- **WHEN** zoom level is at or above `labelMinZoom` (14)
- **THEN** individual manzana polygons SHALL be displayed as currently

### Requirement: Disable animations
The system SHALL disable map animations to eliminate extra transformation frames during pinch-zoom on low-end devices.

#### Scenario: Animations disabled
- **WHEN** the map is initialized
- **THEN** `zoomAnimation`, `markerZoomAnimation`, `inertia`, and `fadeAnimation` SHALL all be set to `false`

### Requirement: Reduce visual weight
The system SHALL reduce border weight and fill opacity in base styles to decrease canvas compositing cost per pixel.

#### Scenario: Reduced weight in base styles
- **WHEN** base territory styles are applied
- **THEN** `weight` SHALL be reduced from 4 to 2 for unselected territories

#### Scenario: Reduced fill opacity
- **WHEN** base territory styles are applied
- **THEN** `fillOpacity` SHALL be reduced from 0.85 to 0.6 for completed territories
