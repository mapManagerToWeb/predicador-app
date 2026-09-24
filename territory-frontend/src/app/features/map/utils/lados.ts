import polygonClipping from 'polygon-clipping';
import type { MultiPolygon, Polygon, Position } from 'geojson';

/**
 * Marcado parcial "por lados": una manzana se divide en sus lados (las calles
 * que la rodean) y el encargado marca los que predicó. La zona marcada es una
 * franja interior a lo largo de esos lados.
 *
 * Todo este módulo es geometría pura sobre GeoJSON ([lng, lat]) sin Leaflet,
 * para poder reutilizarlo tal cual cuando el mapa pase a MapLibre.
 */

export type GeometriaManzana = Polygon | MultiPolygon;

export interface Lado {
  indice: number;
  /** Vértices del lado, en orden, como [lng, lat]. */
  puntos: Position[];
  largoM: number;
}

/** Zona parcial marcada (lo que se guarda en el reporte y en el borrador). */
export interface ZonaParcialDatos {
  /** Id de la manzana; null en zonas de reportes anteriores (trazo libre). */
  manzanaId: string | null;
  manzanaNombre: string;
  /** Índices de {@link calcularLados}; vacío en zonas antiguas. */
  lados: number[];
  geometria: GeometriaManzana;
}

/** Giro acumulado a partir del cual un vértice cuenta como esquina. */
const GIRO_ESQUINA = (35 * Math.PI) / 180;
const MAX_LADOS_POR_ANILLO = 8;
const METROS_POR_GRADO_LAT = 110_540;

type XY = [number, number];

interface Proyeccion {
  aMetros(p: Position): XY;
  aGrados(p: XY): Position;
}

/** Proyección equirectangular local: sobra precisión para una manzana. */
function proyeccion(ref: Position): Proyeccion {
  const kx = 111_320 * Math.cos((ref[1] * Math.PI) / 180);
  return {
    aMetros: p => [(p[0] - ref[0]) * kx, (p[1] - ref[1]) * METROS_POR_GRADO_LAT],
    aGrados: ([x, y]) => [ref[0] + x / kx, ref[1] + y / METROS_POR_GRADO_LAT],
  };
}

export function anillosExteriores(g: GeometriaManzana): Position[][] {
  return g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map(p => p[0]);
}

const dist = (a: XY, b: XY) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Ángulo con signo que gira el recorrido en el vértice b (de a→b a b→c). */
function giro(a: XY, b: XY, c: XY): number {
  const a1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Lados de una manzana, en orden de recorrido. Las esquinas se detectan por
 * el giro acumulado en unos metros (así una esquina redondeada dibujada con
 * muchos vértices cuenta como una sola), y los tramos muy cortos se unen al
 * vecino para no ofrecer "lados" de dos metros.
 */
export function calcularLados(g: GeometriaManzana): Lado[] {
  const lados: Omit<Lado, 'indice'>[] = [];
  for (const anillo of anillosExteriores(g)) lados.push(...ladosDeAnillo(anillo));
  return lados.map((l, indice) => ({ ...l, indice }));
}

function ladosDeAnillo(anillo: Position[]): Omit<Lado, 'indice'>[] {
  if (anillo.length < 4) return [];
  const proy = proyeccion(anillo[0]);
  // Sin el vértice de cierre y sin puntos repetidos.
  const pts: Position[] = [];
  const xy: XY[] = [];
  for (const p of anillo.slice(0, -1)) {
    const m = proy.aMetros(p);
    if (xy.length && dist(xy[xy.length - 1], m) < 0.3) continue;
    pts.push(p);
    xy.push(m);
  }
  if (xy.length > 2 && dist(xy[0], xy[xy.length - 1]) < 0.3) {
    pts.pop();
    xy.pop();
  }
  const n = xy.length;
  if (n < 3) return [];

  const largo = xy.map((p, i) => dist(p, xy[(i + 1) % n]));
  const perimetro = largo.reduce((a, b) => a + b, 0);
  const posicion: number[] = [];
  largo.reduce((acc, l, i) => ((posicion[i] = acc), acc + l), 0);
  const giros = xy.map((p, i) => giro(xy[(i - 1 + n) % n], p, xy[(i + 1) % n]));

  const ventana = Math.min(8, perimetro * 0.06);
  const distanciaArco = (i: number, j: number) => {
    const d = Math.abs(posicion[i] - posicion[j]);
    return Math.min(d, perimetro - d);
  };
  const giroVentana = giros.map((_, i) => {
    let suma = 0;
    for (let j = 0; j < n; j++) if (distanciaArco(i, j) <= ventana) suma += giros[j];
    return Math.abs(suma);
  });

  let esquinas: number[] = [];
  for (let i = 0; i < n; i++) {
    if (giroVentana[i] < GIRO_ESQUINA) continue;
    let esMaximo = true;
    for (let j = 0; j < n && esMaximo; j++) {
      if (j === i || distanciaArco(i, j) > ventana) continue;
      if (giroVentana[j] > giroVentana[i] || (giroVentana[j] === giroVentana[i] && j < i)) esMaximo = false;
    }
    if (esMaximo) esquinas.push(i);
  }

  if (esquinas.length < 3) {
    // Manzana casi redonda o triangular sin esquinas claras: 4 tramos iguales.
    esquinas = [0, 1, 2, 3].map(k => {
      const objetivo = (perimetro * k) / 4;
      let mejor = 0;
      for (let i = 0; i < n; i++) if (Math.abs(posicion[i] - objetivo) < Math.abs(posicion[mejor] - objetivo)) mejor = i;
      return mejor;
    });
    esquinas = [...new Set(esquinas)].sort((a, b) => a - b);
    if (esquinas.length < 2) return [{ puntos: [...pts, pts[0]], largoM: perimetro }];
  }

  const largoEntre = (a: number, b: number) => {
    let total = 0;
    for (let i = a; i !== b; i = (i + 1) % n) total += largo[i];
    return total;
  };
  const tramoMinimo = Math.max(5, perimetro * 0.05);
  // Une tramos cortos (o de más) quitando la esquina más débil que los limita.
  for (;;) {
    const k = esquinas.length;
    if (k <= 3) break;
    const largos = esquinas.map((e, i) => largoEntre(e, esquinas[(i + 1) % k]));
    const corto = largos.reduce((m, l, i) => (l < largos[m] ? i : m), 0);
    let quitar: number;
    if (largos[corto] < tramoMinimo) {
      const inicio = esquinas[corto];
      const fin = esquinas[(corto + 1) % k];
      quitar = giroVentana[inicio] <= giroVentana[fin] ? corto : (corto + 1) % k;
    } else if (k > MAX_LADOS_POR_ANILLO) {
      quitar = esquinas.reduce((m, e, i) => (giroVentana[e] < giroVentana[esquinas[m]] ? i : m), 0);
    } else {
      break;
    }
    esquinas = esquinas.filter((_, i) => i !== quitar);
  }

  return esquinas.map((inicio, i) => {
    const fin = esquinas[(i + 1) % esquinas.length];
    const puntos: Position[] = [pts[inicio]];
    for (let j = (inicio + 1) % n; ; j = (j + 1) % n) {
      puntos.push(pts[j]);
      if (j === fin) break;
    }
    return { puntos, largoM: largoEntre(inicio, fin) };
  });
}

/** Ancho de la franja marcada: proporcional al tamaño de la manzana, entre 4 y 14 m. */
export function anchoFranja(g: GeometriaManzana): number {
  const [anillo] = anillosExteriores(g);
  const proy = proyeccion(anillo[0]);
  const xy = anillo.map(p => proy.aMetros(p));
  let area = 0;
  for (let i = 0; i < xy.length - 1; i++) area += xy[i][0] * xy[i + 1][1] - xy[i + 1][0] * xy[i][1];
  return Math.min(14, Math.max(4, Math.sqrt(Math.abs(area) / 2) * 0.2));
}

/**
 * Franja interior a lo largo de los lados elegidos: cada tramo se ensancha
 * hacia ambos lados y el resultado se recorta con la manzana, así queda solo
 * la parte de adentro. Devuelve null si no hay lados o la franja queda vacía.
 */
export function franjaDeLados(g: GeometriaManzana, indices: number[], anchoM = anchoFranja(g)): GeometriaManzana | null {
  const lados = calcularLados(g).filter(l => indices.includes(l.indice));
  if (lados.length === 0) return null;
  const proy = proyeccion(anillosExteriores(g)[0][0]);

  const piezas: [number, number][][][] = [];
  for (const lado of lados) {
    const xy = lado.puntos.map(p => proy.aMetros(p));
    for (let i = 0; i < xy.length - 1; i++) {
      const [a, b] = [xy[i], xy[i + 1]];
      const l = dist(a, b);
      if (l < 0.01) continue;
      const nx = (-(b[1] - a[1]) / l) * anchoM;
      const ny = ((b[0] - a[0]) / l) * anchoM;
      const rect: XY[] = [
        [a[0] + nx, a[1] + ny],
        [b[0] + nx, b[1] + ny],
        [b[0] - nx, b[1] - ny],
        [a[0] - nx, a[1] - ny],
      ];
      piezas.push([[...rect, rect[0]].map(p => proy.aGrados(p) as [number, number])]);
    }
    // Relleno en los vértices intermedios para que no queden cuñas sin marcar.
    for (let i = 1; i < xy.length - 1; i++) {
      const c = xy[i];
      const octogono = Array.from({ length: 8 }, (_, k) => {
        const ang = (k * Math.PI) / 4;
        return proy.aGrados([c[0] + anchoM * Math.cos(ang), c[1] + anchoM * Math.sin(ang)]) as [number, number];
      });
      piezas.push([[...octogono, octogono[0]]]);
    }
  }
  if (piezas.length === 0) return null;

  const manzana =
    g.type === 'Polygon'
      ? [g.coordinates as [number, number][][]]
      : (g.coordinates as [number, number][][][]);
  const [primera, ...resto] = piezas;
  const union = polygonClipping.union(primera, ...resto);
  const resultado = polygonClipping.intersection(union, manzana);
  if (resultado.length === 0) return null;
  return resultado.length === 1
    ? { type: 'Polygon', coordinates: resultado[0] }
    : { type: 'MultiPolygon', coordinates: resultado };
}

// ── Formato guardado en reportes y borradores ──

interface ZonaGuardada {
  m: string | null;
  n: string;
  l: number[];
  g: GeometriaManzana;
}

/**
 * Serializa las zonas parciales de un territorio para el reporte:
 * `geometriaParcial` es un GeoJSON con todas las zonas (lo que ya leían el
 * mapa y el panel), y `puntosParciales` guarda qué lados de qué manzana se
 * marcaron (`{"v":2,"zonas":[...]}`) para poder retomarlo.
 */
export function serializarZonas(zonas: ZonaParcialDatos[]): {
  geometriaParcial: string | null;
  puntosParciales: string | null;
} {
  if (zonas.length === 0) return { geometriaParcial: null, puntosParciales: null };
  const poligonos = zonas.flatMap(z =>
    z.geometria.type === 'Polygon' ? [z.geometria.coordinates] : z.geometria.coordinates,
  );
  const geometria: GeometriaManzana =
    poligonos.length === 1 ? { type: 'Polygon', coordinates: poligonos[0] } : { type: 'MultiPolygon', coordinates: poligonos };
  const guardadas: ZonaGuardada[] = zonas.map(z => ({ m: z.manzanaId, n: z.manzanaNombre, l: z.lados, g: z.geometria }));
  return { geometriaParcial: JSON.stringify(geometria), puntosParciales: JSON.stringify({ v: 2, zonas: guardadas }) };
}

function esGeometria(v: unknown): v is GeometriaManzana {
  const g = v as { type?: unknown; coordinates?: unknown } | null;
  return !!g && (g.type === 'Polygon' || g.type === 'MultiPolygon') && Array.isArray(g.coordinates);
}

/**
 * Lee las zonas de un reporte. Reportes anteriores (trazo libre, con
 * `puntosParciales` como lista de puntos) se devuelven como zonas sin
 * manzana, una por polígono, para que se sigan viendo en el mapa.
 */
export function leerZonas(geometriaParcial: string | null, puntosParciales: string | null): ZonaParcialDatos[] {
  try {
    const detalle = puntosParciales ? (JSON.parse(puntosParciales) as { v?: unknown; zonas?: unknown }) : null;
    if (detalle && detalle.v === 2 && Array.isArray(detalle.zonas)) {
      return (detalle.zonas as ZonaGuardada[])
        .filter(z => esGeometria(z?.g))
        .map(z => ({
          manzanaId: typeof z.m === 'string' ? z.m : null,
          manzanaNombre: typeof z.n === 'string' ? z.n : 'Zona parcial',
          lados: Array.isArray(z.l) ? z.l.filter(i => Number.isInteger(i)) : [],
          geometria: z.g,
        }));
    }
  } catch {
    // Detalle ilegible: se usa solo la geometría.
  }
  if (!geometriaParcial) return [];
  try {
    const g = JSON.parse(geometriaParcial) as unknown;
    if (!esGeometria(g)) return [];
    const poligonos = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    return poligonos.map(coordinates => ({
      manzanaId: null,
      manzanaNombre: 'Zona parcial',
      lados: [],
      geometria: { type: 'Polygon', coordinates },
    }));
  } catch {
    return [];
  }
}
