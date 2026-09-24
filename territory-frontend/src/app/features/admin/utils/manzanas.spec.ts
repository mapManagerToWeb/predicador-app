import { sugerirNombre, siguienteTerritorio, sinManzanas } from './manzanas';

describe('utilidades de manzanas', () => {
  it('sugiere la siguiente letra libre', () => {
    expect(sugerirNombre(12, [])).toBe('12.a');
    expect(sugerirNombre(12, ['12.a', '12.B', '12.d'])).toBe('12.c');
    const veintiseis = Array.from({ length: 26 }, (_, i) => `7.${String.fromCharCode(97 + i)}`);
    expect(sugerirNombre(7, veintiseis)).toBe('7.aa');
  });

  it('siguiente territorio', () => {
    expect(siguienteTerritorio([])).toBe(1);
    expect(siguienteTerritorio([3, 130, 7])).toBe(131);
  });

  it('sinManzanas quita por id sin mutar la colección', () => {
    const coleccion = {
      type: 'FeatureCollection' as const,
      features: [1, 2, 3].map(id => ({
        type: 'Feature' as const,
        id,
        geometry: { type: 'Polygon' as const, coordinates: [] },
        properties: { id, territorio: 1, nombre: `1.${id}`, areaM2: 1, valida: true },
      })),
    };
    const resultado = sinManzanas(coleccion, [2]);
    expect(resultado.features.map(f => f.id)).toEqual([1, 3]);
    expect(coleccion.features).toHaveLength(3);
  });
});
