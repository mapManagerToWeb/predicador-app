import type { SituacionTerritorio } from '../../../core/map/estado-publico';

/**
 * La imagen de avance para animar a los hermanos (Resumen → «Imagen para los
 * hermanos»): cuánto se lleva de la vuelta actual. Aquí solo las cuentas y los
 * textos; el dibujo está en `avance-dibujo.ts`.
 */

export interface Avance {
  total: number;
  completados: number;
  enCurso: number;
  /** Territorios completados sobre el total, redondeado hacia abajo: 100 solo con todos. */
  porcentaje: number;
}

/** Cómo va la vuelta: territorios completados desde el último cierre de ciclo (la campaña). */
export function avanceDe(territorios: readonly number[], situaciones: ReadonlyMap<number, SituacionTerritorio>): Avance {
  let completados = 0;
  let enCurso = 0;
  for (const t of territorios) {
    const s = situaciones.get(t);
    if (s === 'completado') completados++;
    else if (s === 'en-curso') enCurso++;
  }
  const total = territorios.length;
  return { total, completados, enCurso, porcentaje: total ? Math.floor((completados / total) * 100) : 0 };
}

export function textoAvance(a: Avance): string {
  return `${a.completados} de ${a.total} ${a.total === 1 ? 'territorio' : 'territorios'}`;
}

export function textoEnCurso(a: Avance): string | null {
  if (a.enCurso === 0) return null;
  return a.enCurso === 1 ? 'y 1 empezado' : `y ${a.enCurso} empezados`;
}

/** Meta opcional (p. ej. la asamblea o la Conmemoración): para mostrar cuántos días faltan. */
export interface Meta {
  /** Cómo se lee después de «para»: «la asamblea», «la Conmemoración». */
  nombre: string;
  /** "AAAA-MM-DD". */
  fecha: string;
}

/** Días de calendario desde hoy hasta la fecha (0 = hoy; negativo si ya pasó). */
export function diasHasta(fecha: string, hoy: Date): number {
  const [a, m, d] = fecha.split('-').map(Number);
  const objetivo = Date.UTC(a, m - 1, d);
  const desde = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((objetivo - desde) / 86_400_000);
}

/** «Faltan 12 días para la asamblea». null sin meta, sin fecha válida o si ya pasó. */
export function textoMeta(meta: Meta | null, hoy: Date): string | null {
  const nombre = meta?.nombre.trim() ?? '';
  if (!meta || !nombre || !/^\d{4}-\d{2}-\d{2}$/.test(meta.fecha)) return null;
  const dias = diasHasta(meta.fecha, hoy);
  if (dias < 0) return null;
  if (dias === 0) return `¡Hoy es ${nombre}!`;
  return dias === 1 ? `Falta 1 día para ${nombre}` : `Faltan ${dias} días para ${nombre}`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «Desde el 3 de noviembre» (inicio de la vuelta, "AAAA-MM-DD…"). */
export function textoDesde(inicio: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(inicio ?? '');
  if (!m) return null;
  return `Desde el ${Number(m[3])} de ${MESES[Number(m[2]) - 1]}`;
}

/** Corta el texto en líneas que no pasen del ancho (medido con `medir`). */
export function enLineas(texto: string, ancho: number, medir: (t: string) => number): string[] {
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of texto.trim().split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && medir(prueba) > ancho) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/**
 * Pasa coordenadas (lon, lat) a px dentro de un rectángulo, centradas y sin
 * deformar (a esta escala basta con achicar la longitud por el coseno).
 */
export function proyector(
  caja: [[number, number], [number, number]],
  rect: { x: number; y: number; ancho: number; alto: number },
): (p: readonly number[]) => [number, number] {
  const [[o, s], [e, n]] = caja;
  const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const anchoGeo = Math.max((e - o) * k, 1e-9);
  const altoGeo = Math.max(n - s, 1e-9);
  const escala = Math.min(rect.ancho / anchoGeo, rect.alto / altoGeo);
  const x0 = rect.x + (rect.ancho - anchoGeo * escala) / 2;
  const y0 = rect.y + (rect.alto - altoGeo * escala) / 2;
  return ([lon, lat]) => [x0 + (lon - o) * k * escala, y0 + (n - lat) * escala];
}
