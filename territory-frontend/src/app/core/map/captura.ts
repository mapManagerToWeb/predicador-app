import type { LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';
import type { Position } from 'geojson';

/**
 * La imagen del mapa que va en el WhatsApp del reporte (la usan la app de los
 * hermanos y «Registrar salida» del panel).
 *
 * Siempre salen todos los territorios de la salida, enteros. Si están cerca, en
 * una sola foto; si están lejos (p. ej. uno en cada extremo de la ciudad) se
 * saca una foto de cerca de cada grupo y se unen en una sola imagen, con el
 * número de cada parte, porque desde lejos se verían diminutos.
 */

/** `[[oeste, sur], [este, norte]]` en grados. */
export type Caja = [[number, number], [number, number]];

export interface GrupoCaptura {
  territorios: number[];
  caja: Caja;
}

/** Lado mayor (en metros) que puede tener una foto sin que las manzanas se vean diminutas. */
export const LADO_MAXIMO_M = 1400;
/** Más partes que esto ya no se leen en el celular: se juntan las más cercanas. */
export const MAXIMO_PARTES = 4;
/** Lado mayor de la imagen final, en px (WhatsApp la achica igual). */
export const CAPTURA_MAX_PX = 1600;
/** Lado de cada parte cuando la imagen se arma con varias fotos. */
const LADO_PARTE_PX = 800;
const SEPARACION_PX = 8;
/** Densidad mínima de la foto (px de imagen por px de pantalla). */
const DENSIDAD_MINIMA = 2;
/** Margen alrededor de los territorios en cada foto, en px de pantalla. */
const MARGEN_PX = 36;

const METROS_POR_GRADO = 111_320;

export function cajaDePuntos(puntos: Iterable<Position>): Caja | null {
  let [o, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of puntos) {
    o = Math.min(o, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  return Number.isFinite(o) ? [[o, s], [e, n]] : null;
}

export function unirCajas(a: Caja, b: Caja): Caja {
  return [
    [Math.min(a[0][0], b[0][0]), Math.min(a[0][1], b[0][1])],
    [Math.max(a[1][0], b[1][0]), Math.max(a[1][1], b[1][1])],
  ];
}

/** Lado mayor de la caja, en metros. */
export function ladoMayorM(c: Caja): number {
  const latitud = ((c[0][1] + c[1][1]) / 2) * (Math.PI / 180);
  const ancho = (c[1][0] - c[0][0]) * METROS_POR_GRADO * Math.cos(latitud);
  const alto = (c[1][1] - c[0][1]) * METROS_POR_GRADO;
  return Math.max(ancho, alto);
}

/**
 * Agrupa los territorios en las fotos que hacen falta: empieza con uno por
 * territorio y junta el par que queda más compacto mientras la foto no pase de
 * {@link LADO_MAXIMO_M} (o mientras haya más de {@link MAXIMO_PARTES}). Los
 * grupos salen ordenados de oeste a este, y dentro de cada uno, por número.
 */
export function agruparParaCaptura(
  cajas: ReadonlyMap<number, Caja>,
  ladoMaximoM = LADO_MAXIMO_M,
  maximoPartes = MAXIMO_PARTES,
): GrupoCaptura[] {
  const grupos: GrupoCaptura[] = [...cajas].map(([t, caja]) => ({ territorios: [t], caja }));
  while (grupos.length > 1) {
    let mejor: { i: number; j: number; caja: Caja; lado: number } | null = null;
    for (let i = 0; i < grupos.length; i++) {
      for (let j = i + 1; j < grupos.length; j++) {
        const caja = unirCajas(grupos[i].caja, grupos[j].caja);
        const lado = ladoMayorM(caja);
        if (!mejor || lado < mejor.lado) mejor = { i, j, caja, lado };
      }
    }
    if (!mejor || (mejor.lado > ladoMaximoM && grupos.length <= maximoPartes)) break;
    grupos[mejor.i] = { territorios: [...grupos[mejor.i].territorios, ...grupos[mejor.j].territorios], caja: mejor.caja };
    grupos.splice(mejor.j, 1);
  }
  for (const g of grupos) g.territorios.sort((a, b) => a - b);
  return grupos.sort((a, b) => a.caja[0][0] + a.caja[1][0] - (b.caja[0][0] + b.caja[1][0]));
}

/** Dónde va cada parte en la imagen final: una al lado de la otra, o de a dos por fila. */
export function disposicion(partes: number): { ancho: number; alto: number; lugares: { x: number; y: number }[] } {
  const columnas = partes <= 1 ? 1 : 2;
  const filas = Math.ceil(partes / columnas);
  const paso = LADO_PARTE_PX + SEPARACION_PX;
  const ancho = columnas * paso - SEPARACION_PX;
  const alto = filas * paso - SEPARACION_PX;
  const lugares = Array.from({ length: partes }, (_, i) => {
    const fila = Math.floor(i / columnas);
    const enFila = Math.min(columnas, partes - fila * columnas);
    // La última fila con una sola parte va centrada.
    const corrimiento = ((columnas - enFila) * paso) / 2;
    return { x: corrimiento + (i % columnas) * paso, y: fila * paso };
  });
  return { ancho, alto, lugares };
}

export function rotuloDe(territorios: number[]): string {
  return territorios.length === 1 ? `Territorio ${territorios[0]}` : `Territorios ${territorios.join(', ')}`;
}

/**
 * Saca la imagen (JPEG en base64, sin el prefijo) de esos territorios. Quien
 * llama deja el mapa mostrando solo lo que debe salir; aquí se mueve la cámara
 * para cada foto y al final se deja como estaba. null si no se pudo.
 */
export async function capturarTerritorios(map: MapLibreMap, cajas: ReadonlyMap<number, Caja>): Promise<string | null> {
  const grupos = agruparParaCaptura(cajas);
  if (grupos.length === 0) return null;
  const camara = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
  // Los límites de navegación podrían impedir centrar una foto en el borde de la zona.
  const limites = map.getMaxBounds();
  map.setMaxBounds(null);
  // En el computador (densidad 1) la foto saldría chica: se dibuja al doble mientras tanto.
  const densidad = map.getPixelRatio();
  if (densidad < DENSIDAD_MINIMA) map.setPixelRatio(DENSIDAD_MINIMA);
  try {
    if (grupos.length === 1) {
      await encuadrar(map, grupos[0].caja, { top: MARGEN_PX, bottom: MARGEN_PX, left: MARGEN_PX, right: MARGEN_PX });
      return aJpeg(achicar(map.getCanvas()));
    }
    const { ancho, alto, lugares } = disposicion(grupos.length);
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    for (const [i, grupo] of grupos.entries()) {
      const cuadro = await fotoCuadrada(map, grupo.caja);
      const { x, y } = lugares[i];
      ctx.drawImage(map.getCanvas(), cuadro.x, cuadro.y, cuadro.lado, cuadro.lado, x, y, LADO_PARTE_PX, LADO_PARTE_PX);
      dibujarRotulo(ctx, rotuloDe(grupo.territorios), x + 16, y + 16);
    }
    return aJpeg(achicar(lienzo));
  } catch {
    return null;
  } finally {
    if (densidad < DENSIDAD_MINIMA) map.setPixelRatio(densidad);
    map.setMaxBounds(limites);
    map.jumpTo(camara);
  }
}

/** Encuadra la caja en el cuadrado central del mapa y dice qué parte del canvas recortar. */
async function fotoCuadrada(map: MapLibreMap, caja: Caja): Promise<{ x: number; y: number; lado: number }> {
  const contenedor = map.getContainer();
  const [w, h] = [contenedor.clientWidth, contenedor.clientHeight];
  const lado = Math.min(w, h);
  const [mx, my] = [(w - lado) / 2 + MARGEN_PX, (h - lado) / 2 + MARGEN_PX];
  await encuadrar(map, caja, { top: my, bottom: my, left: mx, right: mx });
  const escala = map.getCanvas().width / w;
  return { x: ((w - lado) / 2) * escala, y: ((h - lado) / 2) * escala, lado: lado * escala };
}

async function encuadrar(
  map: MapLibreMap,
  caja: Caja,
  padding: { top: number; bottom: number; left: number; right: number },
): Promise<void> {
  map.fitBounds(caja as LngLatBoundsLike, { padding, duration: 0, maxZoom: 18 });
  await esperarQuieto(map);
}

/** Espera a que terminen de cargar las teselas y se dibuje todo (máx. 8 s). */
export function esperarQuieto(map: MapLibreMap, maximoMs = 8000): Promise<void> {
  return new Promise(resolve => {
    const listo = () => {
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(() => {
      map.off('idle', listo);
      resolve();
    }, maximoMs);
    map.once('idle', listo);
    map.triggerRepaint();
  });
}

function dibujarRotulo(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number): void {
  ctx.font = '700 30px Inter, system-ui, sans-serif';
  const ancho = ctx.measureText(texto).width + 32;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.strokeStyle = 'rgba(17, 24, 39, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, ancho, 50, 25);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#111827';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, x + 16, y + 26);
}

/** Copia achicada si es muy grande (pantallas de alta densidad). */
function achicar(origen: HTMLCanvasElement): HTMLCanvasElement {
  const escala = Math.min(1, CAPTURA_MAX_PX / Math.max(origen.width, origen.height));
  if (escala === 1) return origen;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(origen.width * escala);
  canvas.height = Math.round(origen.height * escala);
  canvas.getContext('2d')?.drawImage(origen, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function aJpeg(canvas: HTMLCanvasElement): string | null {
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1] ?? null;
}
