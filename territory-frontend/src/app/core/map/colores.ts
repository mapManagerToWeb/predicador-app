/**
 * Colores de territorio en los mapas. Varios colores de la paleta son muy
 * claros (amarillo, verde agua, el lila del 69…) y con la transparencia del
 * relleno se veían «muy claritos». Para pintar, esos colores se oscurecen hasta
 * un brillo máximo, sin cambiar su tono: cada territorio sigue reconociéndose.
 * El color guardado no cambia (el editor del panel sigue mostrando el real).
 */

/** Brillo máximo (luminancia relativa 0–1). Los amarillos se dejan más claros para que sigan siendo dorados. */
const BRILLO_MAXIMO = 0.25;
const BRILLO_MAXIMO_AMARILLOS = 0.42;

const cache = new Map<string, string>();

/** El color para pintar en el mapa: el mismo si ya es firme, más oscuro si es muy claro. */
export function colorFuerte(color: string): string {
  const conocido = cache.get(color);
  if (conocido) return conocido;
  const fuerte = calcular(color);
  cache.set(color, fuerte);
  return fuerte;
}

/** Los colores de varios territorios, listos para pintar. */
export function coloresFuertes(colores: Record<number, string>): Record<number, string> {
  const r: Record<number, string> = {};
  for (const [t, c] of Object.entries(colores)) r[Number(t)] = colorFuerte(c);
  return r;
}

function calcular(color: string): string {
  const rgb = leerHex(color);
  if (!rgb) return color;
  const [h, sOriginal, lOriginal] = aHsl(rgb);
  let l = lOriginal;
  const maximo = h >= 35 && h <= 70 ? BRILLO_MAXIMO_AMARILLOS : BRILLO_MAXIMO;
  if (luminancia(rgb) <= maximo) return color;
  const s = Math.max(sOriginal, 0.75);
  for (let i = 0; i < 100 && l > 0 && luminancia(deHsl(h, s, l)) > maximo; i++) l -= 0.01;
  return aHex(deHsl(h, s, l));
}

type Rgb = [number, number, number];

function leerHex(color: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
}

function luminancia([r, g, b]: Rgb): number {
  const lineal = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
}

function aHsl([r, g, b]: Rgb): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function deHsl(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

function aHex(rgb: Rgb): string {
  return '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
}
