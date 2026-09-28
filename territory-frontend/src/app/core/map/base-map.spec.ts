import { cajaVisible, encuadrarDentroDeLimites, estiloBase, limitesDeNavegacion } from './base-map';

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

  it('lo que se ve con una cámara: más zoom, menos área', () => {
    const lejos = cajaVisible([-73.34, -37.48], 12, 400, 800);
    const cerca = cajaVisible([-73.34, -37.48], 13, 400, 800);
    expect(lejos[1][0] - lejos[0][0]).toBeCloseTo(2 * (cerca[1][0] - cerca[0][0]));
    expect(lejos[0][1]).toBeLessThan(-37.48);
    expect(lejos[1][1]).toBeGreaterThan(-37.48);
  });

  it('un territorio en el borde estira el límite solo lo necesario para verlo sobre el panel', () => {
    const base: [[number, number], [number, number]] = [[-73.5, -37.7], [-73.2, -37.3]];
    const map = {
      cameraForBounds: vi.fn(() => ({ center: [-73.3, -37.75] as [number, number], zoom: 12 })),
      getContainer: () => ({ clientWidth: 400, clientHeight: 800 }),
      setMaxBounds: vi.fn(),
      fitBounds: vi.fn(),
    };
    encuadrarDentroDeLimites(map as never, base, [[-73.31, -37.72], [-73.29, -37.7]], { padding: 20 });
    const [[oeste, sur], [este, norte]] = map.setMaxBounds.mock.calls[0][0] as [[number, number], [number, number]];
    expect(sur).toBeLessThan(-37.75);
    expect([oeste, este, norte]).toEqual([-73.5, -73.2, -37.3]);
    expect(map.fitBounds).toHaveBeenCalled();
  });
});
