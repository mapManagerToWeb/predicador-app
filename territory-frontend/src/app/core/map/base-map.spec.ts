import { estiloBase, limitesDeNavegacion } from './base-map';

const manzana = (territorio: number, x: number, y: number) => ({
  type: 'Feature' as const,
  properties: { territorio },
  geometry: {
    type: 'Polygon' as const,
    coordinates: [[[x, y], [x + 0.001, y], [x + 0.001, y + 0.001], [x, y + 0.001], [x, y]]],
  },
});

describe('base-map', () => {
  it('el mapa se puede mover hasta un poco más allá de los territorios, no más', () => {
    const caja = limitesDeNavegacion({ type: 'FeatureCollection', features: [manzana(1, -73.35, -37.48), manzana(2, -73.3, -37.45)] });
    expect(caja).not.toBeNull();
    const [[oeste, sur], [este, norte]] = caja!;
    expect(oeste).toBeCloseTo(-73.38);
    expect(sur).toBeCloseTo(-37.51);
    expect(este).toBeCloseTo(-73.269);
    expect(norte).toBeCloseTo(-37.419);
    expect(limitesDeNavegacion({ type: 'FeatureCollection', features: [] })).toBeNull();
  });

  it('el satélite no pide teselas donde no hay imagen (más cerca amplía la última)', () => {
    const fondo = (f: 'mapa' | 'satelite') => estiloBase(f, false).sources['fondo'] as { maxzoom: number };
    expect(fondo('satelite').maxzoom).toBe(18);
    expect(fondo('mapa').maxzoom).toBe(19);
  });
});
