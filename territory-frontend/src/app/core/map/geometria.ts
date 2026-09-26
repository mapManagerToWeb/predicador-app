import type { MultiPolygon, Polygon, Position } from 'geojson';

/**
 * Geometría plana sobre GeoJSON ([lng, lat]) para los mapas MapLibre: áreas y
 * puntos interiores para rotular. A escala de una ciudad basta una proyección
 * equirectangular local.
 */

export type Poligonal = Polygon | MultiPolygon;

const M_POR_GRADO_LAT = 110_540;

function escalaX(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

/** Área (m²) de un anillo, con signo según el sentido de giro. */
function areaAnillo(anillo: Position[], kx: number): number {
  let a = 0;
  for (let i = 0; i < anillo.length - 1; i++) {
    a += anillo[i][0] * anillo[i + 1][1] - anillo[i + 1][0] * anillo[i][1];
  }
  return (a / 2) * kx * M_POR_GRADO_LAT;
}

function poligonos(g: Poligonal): Position[][][] {
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

export function area(g: Poligonal): number {
  let total = 0;
  for (const p of poligonos(g)) {
    if (!p[0]?.length) continue;
    const kx = escalaX(p[0][0][1]);
    total += Math.abs(areaAnillo(p[0], kx));
    for (const hueco of p.slice(1)) total -= Math.abs(areaAnillo(hueco, kx));
  }
  return Math.max(0, total);
}

function dentroDeAnillo([x, y]: Position, anillo: Position[]): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function dentroDePoligono(p: Position, poligono: Position[][]): boolean {
  if (!dentroDeAnillo(p, poligono[0])) return false;
  return !poligono.slice(1).some(hueco => dentroDeAnillo(p, hueco));
}

export function contiene(g: Poligonal, p: Position): boolean {
  return poligonos(g).some(pol => dentroDePoligono(p, pol));
}

/** Distancia (m) de un punto al borde más cercano del polígono. */
function distanciaAlBorde(p: Position, poligono: Position[][]): number {
  const kx = escalaX(p[1]);
  let min = Infinity;
  for (const anillo of poligono) {
    for (let i = 0; i < anillo.length - 1; i++) {
      const ax = (anillo[i][0] - p[0]) * kx;
      const ay = (anillo[i][1] - p[1]) * M_POR_GRADO_LAT;
      const bx = (anillo[i + 1][0] - p[0]) * kx;
      const by = (anillo[i + 1][1] - p[1]) * M_POR_GRADO_LAT;
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
      min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return min;
}

/**
 * Punto bien adentro del polígono (aproxima el "polo de inaccesibilidad"):
 * el centro de la caja cae afuera en manzanas curvas o en L, y un rótulo ahí
 * parece de otro territorio. Busca en una grilla y la refina alrededor del
 * mejor punto.
 */
export function puntoInterior(g: Poligonal): Position {
  // El polígono más grande manda (un MultiPolygon rara vez tiene partes parejas).
  const pol = poligonos(g).reduce((mejor, p) =>
    area({ type: 'Polygon', coordinates: p }) > area({ type: 'Polygon', coordinates: mejor }) ? p : mejor,
  );
  const anillo = pol[0];
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of anillo) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  let mejor: Position = [(minX + maxX) / 2, (minY + maxY) / 2];
  let mejorD = dentroDePoligono(mejor, pol) ? distanciaAlBorde(mejor, pol) : -1;
  let [cx, cy, w, h] = [mejor[0], mejor[1], maxX - minX, maxY - minY];
  const N = 10;
  for (let ronda = 0; ronda < 4; ronda++) {
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const p: Position = [cx - w / 2 + (w * i) / N, cy - h / 2 + (h * j) / N];
        if (!dentroDePoligono(p, pol)) continue;
        const d = distanciaAlBorde(p, pol);
        if (d > mejorD) {
          mejorD = d;
          mejor = p;
        }
      }
    }
    [cx, cy, w, h] = [mejor[0], mejor[1], (w * 2.5) / N, (h * 2.5) / N];
  }
  return mejorD >= 0 ? mejor : anillo[0];
}

/** Centroide de las áreas (no de los vértices) de varias geometrías. */
export function centroide(gs: Poligonal[]): Position | null {
  let sx = 0;
  let sy = 0;
  let total = 0;
  for (const g of gs) {
    const a = area(g);
    if (a <= 0) continue;
    const p = puntoInterior(g);
    sx += p[0] * a;
    sy += p[1] * a;
    total += a;
  }
  return total > 0 ? [sx / total, sy / total] : null;
}

/**
 * Dónde rotular un territorio: dentro de una de SUS manzanas, la más cercana
 * al centro del territorio. Un territorio que rodea a otro (una franja a lo
 * largo del río) tiene el centro de su caja dentro del vecino.
 */
export function puntoDeRotulo(manzanas: Poligonal[]): Position | null {
  const validas = manzanas.filter(m => area(m) > 0);
  if (validas.length === 0) return null;
  const centro = centroide(validas)!;
  const kx = escalaX(centro[1]);
  const conCentro = validas.find(m => contiene(m, centro));
  if (conCentro) return puntoInterior(conCentro);
  let mejor: Position | null = null;
  let mejorD = Infinity;
  for (const m of validas) {
    const p = puntoInterior(m);
    const d = Math.hypot((p[0] - centro[0]) * kx, (p[1] - centro[1]) * M_POR_GRADO_LAT);
    if (d < mejorD) {
      mejorD = d;
      mejor = p;
    }
  }
  return mejor;
}
