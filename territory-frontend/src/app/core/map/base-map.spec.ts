import { cajaVisible, cambiarFondo, encuadrarDentroDeLimites, estiloBase, limitesDeNavegacion } from './base-map';

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

  it('el satélite lleva encima las calles con su nombre; el mapa normal no las necesita', () => {
    const satelite = estiloBase('satelite', false);
    expect(satelite.layers.map(l => l.id)).toEqual(['fondo', 'calles-satelite']);
    expect((satelite.sources['calles-satelite'] as { tiles: string[] }).tiles[0]).toContain('Reference/World_Transportation');
    const mapa = estiloBase('mapa', false);
    expect(mapa.layers.map(l => l.id)).toEqual(['fondo']);
    expect(mapa.sources['calles-satelite']).toBeUndefined();
  });

  it('cambiar el fondo reemplaza el fondo y las calles, debajo de las capas de la app', () => {
    const capas = ['fondo', 'manzanas', 'etiquetas'];
    const fuentes = new Set(['fondo', 'manzanas']);
    const map = {
      getStyle: () => ({ layers: capas.map(id => ({ id })) }),
      getLayer: (id: string) => capas.includes(id),
      getSource: (id: string) => fuentes.has(id),
      removeLayer: vi.fn((id: string) => capas.splice(capas.indexOf(id), 1)),
      removeSource: vi.fn((id: string) => fuentes.delete(id)),
      addSource: vi.fn((id: string) => fuentes.add(id)),
      addLayer: vi.fn(),
    };
    cambiarFondo(map as never, 'satelite', false);
    expect(map.addLayer.mock.calls.map(([capa, antes]) => [capa.id, antes])).toEqual([
      ['fondo', 'manzanas'],
      ['calles-satelite', 'manzanas'],
    ]);
    // De vuelta al mapa: se quitan las calles del satélite.
    capas.splice(0, 0, 'fondo', 'calles-satelite');
    fuentes.add('calles-satelite');
    map.addLayer.mockClear();
    cambiarFondo(map as never, 'mapa', true);
    expect(map.removeLayer).toHaveBeenCalledWith('calles-satelite');
    expect(map.addLayer.mock.calls.map(([capa]) => capa.id)).toEqual(['fondo']);
    // En tema oscuro el mapa normal va atenuado.
    expect(map.addLayer.mock.calls[0][0].paint).toEqual(expect.objectContaining({ 'raster-brightness-max': 0.72 }));
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
