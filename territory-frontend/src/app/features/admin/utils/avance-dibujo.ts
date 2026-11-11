import type { MultiPolygon, Polygon, Position } from 'geojson';
import type { SituacionTerritorio } from '../../../core/map/estado-publico';
import { enLineas, proyector, textoAvance, textoEnCurso, type Avance } from './avance';

/** Cuadrada para el grupo de WhatsApp; vertical para el estado. */
export type FormatoAvance = 'cuadrada' | 'vertical';

export const MEDIDAS: Record<FormatoAvance, { ancho: number; alto: number }> = {
  cuadrada: { ancho: 1080, alto: 1080 },
  vertical: { ancho: 1080, alto: 1920 },
};

export interface ManzanaAvance {
  territorio: number;
  geometria: Polygon | MultiPolygon;
}

export interface DatosImagenAvance {
  avance: Avance;
  manzanas: ManzanaAvance[];
  situaciones: ReadonlyMap<number, SituacionTerritorio>;
  /** Encuadre del mapa: la ciudad (`limitesPrincipales` con un recorte mayor). */
  caja: [[number, number], [number, number]] | null;
  titulo: string;
  mensaje: string;
  /** «Faltan 12 días para la asamblea», o null. */
  meta: string | null;
  /** «Desde el 3 de noviembre», o null. */
  desde: string | null;
  logo: CanvasImageSource | null;
}

const C = {
  fondoArriba: '#0b1d36',
  fondoAbajo: '#123a63',
  texto: '#ffffff',
  suave: 'rgba(255, 255, 255, 0.72)',
  pista: 'rgba(255, 255, 255, 0.13)',
  completado: '#4ade80',
  enCurso: '#fde047',
  falta: 'rgba(255, 255, 255, 0.24)',
  meta: '#fbbf24',
};
const FUENTE = 'Inter, system-ui, sans-serif';

const COLOR: Record<SituacionTerritorio, string> = {
  completado: C.completado,
  'en-curso': C.enCurso,
  'sin-registro': C.falta,
};

interface Rect {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Dónde va cada cosa, según el formato (y = línea base del texto). */
function diseno(formato: FormatoAvance) {
  if (formato === 'cuadrada') {
    return {
      cabecera: 62,
      titulo: { y: 196, tamano: 68 },
      anillo: { x: 285, y: 468, radio: 160, grosor: 32, numero: 108 },
      textos: { x: 285, y: 710, tamano: 42 },
      mapa: { x: 545, y: 262, ancho: 480, alto: 470 } as Rect,
      leyenda: 780,
      pie: { meta: 856, mensaje: 950, tamanoMensaje: 38, desde: 1046 },
    };
  }
  return {
    cabecera: 92,
    titulo: { y: 280, tamano: 90 },
    anillo: { x: 540, y: 620, radio: 210, grosor: 42, numero: 144 },
    textos: { x: 540, y: 935, tamano: 54 },
    mapa: { x: 70, y: 1050, ancho: 940, alto: 470 } as Rect,
    leyenda: 1570,
    pie: { meta: 1660, mensaje: 1760, tamanoMensaje: 46, desde: 1886 },
  };
}

/** Dibuja la imagen completa en el canvas (le cambia el tamaño al del formato). */
export function dibujarAvance(canvas: HTMLCanvasElement, datos: DatosImagenAvance, formato: FormatoAvance): void {
  const { ancho, alto } = MEDIDAS[formato];
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const d = diseno(formato);

  const fondo = ctx.createLinearGradient(0, 0, ancho * 0.4, alto);
  fondo.addColorStop(0, C.fondoArriba);
  fondo.addColorStop(1, C.fondoAbajo);
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, ancho, alto);

  cabecera(ctx, datos.logo, d.cabecera);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.texto;
  ctx.font = `800 ${d.titulo.tamano}px ${FUENTE}`;
  const lineasTitulo = enLineas(datos.titulo || 'Así vamos', ancho - 120, t => ctx.measureText(t).width).slice(0, 2);
  // Una o dos líneas, centradas en la altura del título.
  const paso = d.titulo.tamano * 1.08;
  lineasTitulo.forEach((l, i) => ctx.fillText(l, ancho / 2, d.titulo.y + (i - (lineasTitulo.length - 1) / 2) * paso));

  anillo(ctx, datos.avance.porcentaje, d.anillo);

  ctx.textAlign = 'center';
  ctx.fillStyle = C.texto;
  ctx.font = `800 ${d.textos.tamano}px ${FUENTE}`;
  ctx.fillText(textoAvance(datos.avance), d.textos.x, d.textos.y);
  ctx.font = `500 ${Math.round(d.textos.tamano * 0.66)}px ${FUENTE}`;
  ctx.fillStyle = C.suave;
  ctx.fillText(
    ['completados', textoEnCurso(datos.avance)].filter(Boolean).join(' '),
    d.textos.x,
    d.textos.y + d.textos.tamano * 1.05,
  );

  mapa(ctx, datos, d.mapa);
  leyenda(ctx, d.mapa.x + d.mapa.ancho / 2, d.leyenda);

  ctx.textAlign = 'center';
  if (datos.meta) pildora(ctx, datos.meta, ancho / 2, d.pie.meta, Math.round(d.pie.tamanoMensaje * 0.9));
  if (datos.mensaje.trim()) {
    ctx.font = `700 ${d.pie.tamanoMensaje}px ${FUENTE}`;
    ctx.fillStyle = C.texto;
    const lineas = enLineas(datos.mensaje, ancho - 140, t => ctx.measureText(t).width).slice(0, 2);
    // Sin meta, el mensaje sube a su lugar.
    const y0 = datos.meta ? d.pie.mensaje : d.pie.mensaje - (d.pie.mensaje - d.pie.meta) * 0.6;
    lineas.forEach((l, i) => ctx.fillText(l, ancho / 2, y0 + i * d.pie.tamanoMensaje * 1.2));
  }
  if (datos.desde) {
    ctx.font = `500 ${Math.round(d.pie.tamanoMensaje * 0.62)}px ${FUENTE}`;
    ctx.fillStyle = C.suave;
    ctx.fillText(datos.desde, ancho / 2, d.pie.desde);
  }
}

function cabecera(ctx: CanvasRenderingContext2D, logo: CanvasImageSource | null, y: number): void {
  const lado = 64;
  ctx.font = `700 36px ${FUENTE}`;
  const texto = 'Territorios';
  const anchoTexto = ctx.measureText(texto).width;
  const total = (logo ? lado + 18 : 0) + anchoTexto;
  let x = (ctx.canvas.width - total) / 2;
  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y - lado / 2, lado, lado, 16);
    ctx.clip();
    ctx.drawImage(logo, x, y - lado / 2, lado, lado);
    ctx.restore();
    x += lado + 18;
  }
  ctx.fillStyle = C.suave;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, x, y + 2);
  ctx.textBaseline = 'alphabetic';
}

function anillo(
  ctx: CanvasRenderingContext2D,
  porcentaje: number,
  a: { x: number; y: number; radio: number; grosor: number; numero: number },
): void {
  ctx.lineWidth = a.grosor;
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.pista;
  ctx.beginPath();
  ctx.arc(a.x, a.y, a.radio, 0, Math.PI * 2);
  ctx.stroke();
  if (porcentaje > 0) {
    const inicio = -Math.PI / 2;
    ctx.strokeStyle = C.completado;
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.radio, inicio, inicio + (Math.PI * 2 * Math.min(porcentaje, 100)) / 100);
    ctx.stroke();
  }
  ctx.fillStyle = C.texto;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${a.numero}px ${FUENTE}`;
  const numero = String(porcentaje);
  const anchoNumero = ctx.measureText(numero).width;
  ctx.font = `800 ${Math.round(a.numero * 0.45)}px ${FUENTE}`;
  const anchoSigno = ctx.measureText('%').width;
  const x0 = a.x - (anchoNumero + anchoSigno) / 2;
  ctx.font = `800 ${a.numero}px ${FUENTE}`;
  ctx.textAlign = 'left';
  ctx.fillText(numero, x0, a.y + a.numero * 0.04);
  ctx.font = `800 ${Math.round(a.numero * 0.45)}px ${FUENTE}`;
  ctx.fillText('%', x0 + anchoNumero + 2, a.y - a.numero * 0.16);
  ctx.textBaseline = 'alphabetic';
}

function mapa(ctx: CanvasRenderingContext2D, datos: DatosImagenAvance, r: Rect): void {
  // Una tarjeta un poco más clara: lo que queda fuera del encuadre (manzanas rurales) se corta en su borde.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.ancho, r.alto, 28);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fill();
  ctx.clip();
  if (datos.caja && datos.manzanas.length > 0) {
    const p = proyector(datos.caja, { x: r.x + 20, y: r.y + 20, ancho: r.ancho - 40, alto: r.alto - 40 });
    // Lo que falta primero, para que lo hecho quede encima y se vea entero.
    const orden: SituacionTerritorio[] = ['sin-registro', 'en-curso', 'completado'];
    for (const situacion of orden) {
      ctx.fillStyle = COLOR[situacion];
      ctx.beginPath();
      for (const m of datos.manzanas) {
        if ((datos.situaciones.get(m.territorio) ?? 'sin-registro') !== situacion) continue;
        const poligonos: Position[][][] = m.geometria.type === 'Polygon' ? [m.geometria.coordinates] : m.geometria.coordinates;
        for (const anillos of poligonos) {
          for (const anilloGeo of anillos) {
            anilloGeo.forEach((pt, i) => {
              const [x, y] = p(pt);
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            });
            ctx.closePath();
          }
        }
      }
      ctx.fill('evenodd');
    }
  }
  ctx.restore();
}

/** Los tres colores, centrados en `cx`. */
function leyenda(ctx: CanvasRenderingContext2D, cx: number, y: number): void {
  const items: [string, string][] = [
    [C.completado, 'Completado'],
    [C.enCurso, 'Empezado'],
    [C.falta, 'Falta'],
  ];
  ctx.font = `600 26px ${FUENTE}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const total = items.reduce((t, [, texto]) => t + 28 + ctx.measureText(texto).width, 0) + 30 * (items.length - 1);
  let x = cx - total / 2;
  for (const [color, texto] of items) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 10, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.suave;
    ctx.fillText(texto, x + 28, y + 1);
    x += 28 + ctx.measureText(texto).width + 30;
  }
  ctx.textBaseline = 'alphabetic';
}

function pildora(ctx: CanvasRenderingContext2D, texto: string, cx: number, cy: number, tamano: number): void {
  ctx.font = `800 ${tamano}px ${FUENTE}`;
  const ancho = Math.min(ctx.measureText(texto).width + tamano * 1.4, ctx.canvas.width - 80);
  const alto = tamano * 1.8;
  ctx.fillStyle = C.meta;
  ctx.beginPath();
  ctx.roundRect(cx - ancho / 2, cy - alto / 2, ancho, alto, alto / 2);
  ctx.fill();
  ctx.fillStyle = '#1f2937';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, cx, cy + 2, ancho - tamano);
  ctx.textBaseline = 'alphabetic';
}
