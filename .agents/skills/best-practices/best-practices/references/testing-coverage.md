# Referencia de Testing y Cobertura

## Configuración

- **Runner**: Vitest (migrado de Karma/Jasmine)
- **Entorno**: jsdom
- **Setup**: `src/test-setup.ts` (`@analogjs/vitest-angular/setup-zone`)
- **Cobertura**: V8 (`@vitest/coverage-v8`)
- **Umbrales**: lines/statements/functions ≥30%, branches ≥20%

## Convenciones

### Ubicación
Los specs van co-locados con el fuente: `foo.ts` → `foo.spec.ts` en el mismo directorio.

### Naming
- Describe el comportamiento, no la implementación: `'should restore marks from DB'` no `'should call service method'`
- Agrupar por método/comportamiento: `describe('methodName')`

### Mocks

**Siempre mockear las dependencias externas** (servicios HTTP, Leaflet):

```typescript
const rendering = {
  getManzanaIndex: vi.fn().mockReturnValue([]),
  getAllTerritoriesLayer: vi.fn().mockReturnValue([]),
  getFeatureLayerByTerritorio: vi.fn().mockReturnValue(undefined),
  getManzanaCountByTerritorio: vi.fn().mockReturnValue(0),
  // ...todos los métodos que el SUT usa
};
```

**Cuando se añade un método público a un servicio**, actualizar TODOS los tests que lo mockean. El error `'method' is not a function` indica un mock incompleto.

### Patrón Arrange-Act-Assert

```typescript
it('should toggle manzana when clicking in completa mode', () => {
  // Arrange
  state.modoMarcado.set('completa');
  const polygon = fakePolygon();

  // Act
  service.toggleManzana('m1', 'Block-A', polygon, '#ff0000', 5);

  // Assert
  expect(polygon.setStyle).toHaveBeenCalledWith(getMarkedManzanaStyle('#ff0000'));
  expect(state.manzanasMarcadas().length).toBe(1);
});
```

## Tests de comportamiento real (no vanidad)

### ✅ Bien
```typescript
it('should restore marks from DB when territory is selected', async () => {
  rendering.getFeatureLayerByTerritorio.mockReturnValue({ territorioPadre: 5, color: '#f00', layer: {} });
  await service.onTerritorioSeleccionado([5]);
  expect(selection.restaurarMarcadoDesdeDB).toHaveBeenCalledWith(5, '#f00', expect.any(Object));
});
```

### ❌ Mal (vanidad)
```typescript
it('should create the service', () => {
  expect(service).toBeTruthy(); // No verifica comportamiento
});
```

## Cobertura de flujos críticos

### Flujos críticos del proyecto
1. **Login**: teléfono → validación → guardado perfil → navegación a mapa
2. **Marcado**: selección territorio → toggle manzana → estilo aplicado → estado actualizado
3. **Envío**: captura screenshot → construcción request → POST → polling → respuesta
4. **Selección múltiple**: selección → restauración paralela → visibilidad filtrada

### Huecos de cobertura a vigilar
- `map.ts` (componente): 0% es inaceptable
- Servicios de decisión: `map-interaction.service.ts`, `map-selection.service.ts`
- Servicios de datos: `map-data-persistence.service.ts`, `territorio.ts`

## Ejecución

```bash
# Todos los tests
npm test -- --run

# Con cobertura
npm test -- --run --coverage

# Un spec específico
npm test -- src/app/features/map/services/map-selection.service.spec.ts

# Watch mode
npm test
```

## Mocks de Leaflet

```typescript
// fakePath simula L.Polygon / L.Path
function fakePath(): { setStyle: ReturnType<typeof vi.fn>; getLatLngs: ReturnType<typeof vi.fn> } {
  return {
    setStyle: vi.fn(),
    getLatLngs: vi.fn(() => [[{ lat: 0, lng: 0 }, { lat: 1, lng: 0 }, { lat: 1, lng: 1 }, { lat: 0, lng: 1 }, { lat: 0, lng: 0 }]]),
  };
}
```
