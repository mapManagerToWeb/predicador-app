import type { Polygon, Position } from 'geojson';
import { anchoFranja, calcularLados, franjaDeLados, leerZonas, serializarZonas } from './lados';

const LAT0 = -37.5;
const M_LAT = 1 / 110_540;
const M_LNG = 1 / (111_320 * Math.cos((LAT0 * Math.PI) / 180));

/** Punto a (x, y) metros del origen. */
const p = (x: number, y: number): Position => [-73.3 + x * M_LNG, LAT0 + y * M_LAT];
const anillo = (pts: Position[]): Position[] => [...pts, pts[0]];
const poligono = (pts: Position[]): Polygon => ({ type: 'Polygon', coordinates: [anillo(pts)] });

/** Cuadra de 80 x 60 m. */
const cuadra = poligono([p(0, 0), p(80, 0), p(80, 60), p(0, 60)]);

/** La misma cuadra con esquinas redondeadas (5 vértices por esquina) y vértices intermedios. */
function cuadraRedondeada(): Polygon {
  const pts: Position[] = [];
  const r = 6;
  const esquinas: [number, number, number][] = [
    [80 - r, r, -90],
    [80 - r, 60 - r, 0],
    [r, 60 - r, 90],
    [r, r, 180],
  ];
  for (const [cx, cy, inicio] of esquinas) {
    for (let k = 0; k <= 4; k++) {
      const a = ((inicio + (k * 90) / 4) * Math.PI) / 180;
      pts.push(p(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
    if (cx > 40 && cy < 30) pts.push(p(80, 30)); // vértice suelto en medio de un lado
  }
  return poligono(pts);
}

function areaM2(g: Polygon): number {
  const xy = g.coordinates[0].map(([lng, lat]) => [(lng + 73.3) / M_LNG, (lat - LAT0) / M_LAT]);
  let a = 0;
  for (let i = 0; i < xy.length - 1; i++) a += xy[i][0] * xy[i + 1][1] - xy[i + 1][0] * xy[i][1];
  return Math.abs(a) / 2;
}

describe('marcado por lados', () => {
  it('una cuadra rectangular tiene 4 lados con sus largos', () => {
    const lados = calcularLados(cuadra);
    expect(lados).toHaveLength(4);
    expect(lados.map(l => Math.round(l.largoM)).sort((a, b) => a - b)).toEqual([60, 60, 80, 80]);
    expect(lados.map(l => l.indice)).toEqual([0, 1, 2, 3]);
  });

  it('las esquinas redondeadas y los vértices sueltos no crean lados de más', () => {
    const lados = calcularLados(cuadraRedondeada());
    expect(lados).toHaveLength(4);
  });

  it('un entrante chico se une al lado vecino', () => {
    const conMuesca = poligono([p(0, 0), p(40, 0), p(40, 2), p(42, 2), p(42, 0), p(80, 0), p(80, 60), p(0, 60)]);
    expect(calcularLados(conMuesca)).toHaveLength(4);
  });

  it('la franja de un lado queda dentro de la manzana y a lo largo de ese lado', () => {
    const [lado] = calcularLados(cuadra).filter(l => Math.round(l.largoM) === 80);
    const ancho = anchoFranja(cuadra);
    expect(ancho).toBeGreaterThanOrEqual(4);
    expect(ancho).toBeLessThanOrEqual(14);

    const franja = franjaDeLados(cuadra, [lado.indice]) as Polygon;
    expect(franja.type).toBe('Polygon');
    expect(areaM2(franja)).toBeGreaterThan(80 * ancho * 0.95);
    expect(areaM2(franja)).toBeLessThan(80 * ancho * 1.05);
    for (const [lng, lat] of franja.coordinates[0]) {
      const x = (lng + 73.3) / M_LNG;
      const y = (lat - LAT0) / M_LAT;
      expect(x).toBeGreaterThan(-0.01);
      expect(x).toBeLessThan(80.01);
      expect(y).toBeGreaterThan(-0.01);
      expect(y).toBeLessThan(60.01);
    }
  });

  it('dos lados vecinos forman una sola zona en L; sin lados no hay zona', () => {
    const franja = franjaDeLados(cuadra, [0, 1]);
    expect(franja?.type).toBe('Polygon');
    expect(franjaDeLados(cuadra, [])).toBeNull();
  });

  it('guarda y recupera las zonas con sus lados', () => {
    const geometria = franjaDeLados(cuadra, [0])!;
    const { geometriaParcial, puntosParciales } = serializarZonas([
      { manzanaId: '793', manzanaNombre: '12.f', lados: [0], geometria },
      { manzanaId: null, manzanaNombre: 'Zona parcial', lados: [], geometria: cuadra },
    ]);
    expect(JSON.parse(geometriaParcial!).type).toBe('MultiPolygon');

    const zonas = leerZonas(geometriaParcial, puntosParciales);
    expect(zonas).toHaveLength(2);
    expect(zonas[0]).toMatchObject({ manzanaId: '793', manzanaNombre: '12.f', lados: [0] });
    expect(zonas[1].manzanaId).toBeNull();
    expect(serializarZonas([])).toEqual({ geometriaParcial: null, puntosParciales: null });
  });

  it('lee reportes antiguos (trazo libre): una zona por polígono, sin manzana', () => {
    const multi = JSON.stringify({ type: 'MultiPolygon', coordinates: [cuadra.coordinates, cuadra.coordinates] });
    const zonas = leerZonas(multi, JSON.stringify([{ lat: -37.5, lng: -73.3 }]));
    expect(zonas).toHaveLength(2);
    expect(zonas.every(z => z.manzanaId === null && z.lados.length === 0)).toBe(true);
    expect(leerZonas(null, null)).toEqual([]);
    expect(leerZonas('no es json', null)).toEqual([]);
  });
});
