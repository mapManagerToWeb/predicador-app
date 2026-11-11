import { agruparParaCaptura, cajaDePuntos, disposicion, ladoMayorM, rotuloDe, type Caja } from './captura';

/** Caja cuadrada de `lado` grados con la esquina suroeste en (x, y), cerca de Curanilahue. */
const caja = (x: number, y: number, lado = 0.004): Caja => [
  [-73.35 + x, -37.48 + y],
  [-73.35 + x + lado, -37.48 + y + lado],
];

describe('captura del mapa para el WhatsApp', () => {
  it('la caja de unos puntos y su lado mayor en metros', () => {
    const c = cajaDePuntos([[-73.35, -37.48], [-73.34, -37.475]])!;
    expect(c).toEqual([[-73.35, -37.48], [-73.34, -37.475]]);
    // 0,01° de longitud a esta latitud son ~880 m; 0,005° de latitud, ~560 m.
    expect(ladoMayorM(c)).toBeGreaterThan(850);
    expect(ladoMayorM(c)).toBeLessThan(900);
    expect(cajaDePuntos([])).toBeNull();
  });

  it('territorios cercanos salen en una sola foto', () => {
    const grupos = agruparParaCaptura(new Map([[42, caja(0.004, 0)], [40, caja(0, 0)], [41, caja(0, 0.004)]]));
    expect(grupos).toHaveLength(1);
    expect(grupos[0].territorios).toEqual([40, 41, 42]);
    const [[o, s], [e, n]] = grupos[0].caja;
    for (const [v, esperado] of [[o, -73.35], [s, -37.48], [e, -73.342], [n, -37.472]]) expect(v).toBeCloseTo(esperado, 9);
  });

  it('uno en cada extremo de la ciudad: una foto de cerca de cada uno, de oeste a este', () => {
    const grupos = agruparParaCaptura(new Map([[90, caja(0.04, 0)], [12, caja(0, 0)], [13, caja(0.004, 0)]]));
    expect(grupos.map(g => g.territorios)).toEqual([[12, 13], [90]]);
  });

  it('nunca más de cuatro partes: se juntan las más cercanas', () => {
    const lejos = new Map([1, 2, 3, 4, 5].map(t => [t, caja(t * 0.03, 0)] as [number, Caja]));
    const grupos = agruparParaCaptura(lejos);
    expect(grupos).toHaveLength(4);
    expect(grupos.flatMap(g => g.territorios).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('sin territorios no hay fotos', () => {
    expect(agruparParaCaptura(new Map())).toEqual([]);
  });

  it('las partes van de a dos por fila; si sobra una, va centrada', () => {
    expect(disposicion(2)).toEqual({ ancho: 1608, alto: 800, lugares: [{ x: 0, y: 0 }, { x: 808, y: 0 }] });
    const tres = disposicion(3);
    expect(tres.alto).toBe(1608);
    expect(tres.lugares[2]).toEqual({ x: 404, y: 808 });
  });

  it('el rótulo de cada parte', () => {
    expect(rotuloDe([72])).toBe('Territorio 72');
    expect(rotuloDe([40, 41])).toBe('Territorios 40, 41');
  });
});
