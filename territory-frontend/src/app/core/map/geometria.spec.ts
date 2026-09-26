import type { Polygon } from 'geojson';
import { area, contiene, puntoDeRotulo, puntoInterior } from './geometria';
import { MANZANAS_71_72 } from './geometria.fixtures';

const cuadrado = (x: number, y: number, lado: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + lado, y], [x + lado, y + lado], [x, y + lado], [x, y]]],
});

// Una "L": el centro de su caja cae afuera.
const ele: Polygon = {
  type: 'Polygon',
  coordinates: [[[0, 0], [0.002, 0], [0.002, 0.0005], [0.0005, 0.0005], [0.0005, 0.002], [0, 0.002], [0, 0]]],
};

describe('geometria', () => {
  it('calcula el área en metros cuadrados', () => {
    // 0.001° de lado cerca del ecuador ≈ 111 m × 110 m.
    expect(area(cuadrado(0, 0, 0.001))).toBeGreaterThan(12_000);
    expect(area(cuadrado(0, 0, 0.001))).toBeLessThan(12_500);
  });

  it('el punto interior de una L cae dentro de la L', () => {
    expect(contiene(ele, [0.001, 0.001])).toBe(false);
    expect(contiene(ele, puntoInterior(ele))).toBe(true);
  });

  it('rotula el 72 dentro de sus propias manzanas aunque rodee al 71', () => {
    const del = (t: number) => MANZANAS_71_72.filter(m => m.t === t).map(m => m.g);
    for (const t of [71, 72]) {
      const punto = puntoDeRotulo(del(t))!;
      expect(del(t).some(g => contiene(g, punto))).toBe(true);
      const otro = t === 71 ? 72 : 71;
      expect(del(otro).some(g => contiene(g, punto))).toBe(false);
    }
  });

  it('sin manzanas no hay rótulo', () => {
    expect(puntoDeRotulo([])).toBeNull();
  });
});
