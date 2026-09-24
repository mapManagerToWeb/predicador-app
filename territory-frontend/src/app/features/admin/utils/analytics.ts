import type { ReporteAdmin } from '../admin.models';

/**
 * Analítica del panel, calculada en el navegador a partir de los reportes
 * compactos de GET /reports/admin. Son funciones puras (sin Angular) para
 * poder testearlas con datos armados a mano.
 *
 * Todas las agrupaciones por día, semana y hora usan la hora local del
 * navegador (la del administrador), no UTC.
 */

export const DIA_MS = 86_400_000;
/** Un territorio completado hace hasta ~4 meses está al día. */
export const DIAS_AL_DIA = 120;
/** Más de un año sin completarse: atrasado. */
export const DIAS_ATRASADO = 365;
/** Dos envíos idénticos separados por menos que esto son un doble envío. */
const VENTANA_DUPLICADO_MS = 5 * 60_000;
/** Salidas más cortas o más largas que esto no se usan para medir tiempos. */
export const MIN_SESION_MS = 60_000;
export const MAX_SESION_MS = 12 * 3_600_000;

export type EstadoCobertura = 'al-dia' | 'pendiente' | 'atrasado' | 'sin-registro';
export type Granularidad = 'semana' | 'mes';

export function completado(r: ReporteAdmin): boolean {
  return r.estado === 'completed';
}

export function nombreEncargado(r: Pick<ReporteAdmin, 'encargadoNombre' | 'encargadoApellido'>): string {
  return `${r.encargadoNombre ?? ''} ${r.encargadoApellido ?? ''}`.trim() || 'Sin nombre';
}

function ms(fecha: string): number {
  return new Date(fecha).getTime();
}

/** Días de calendario (hora local) entre dos fechas; redondeado para absorber cambios de horario. */
export function diasEntre(desde: Date, hasta: Date): number {
  const a = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()).getTime();
  const b = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate()).getTime();
  return Math.round((b - a) / DIA_MS);
}

/**
 * Quita dobles envíos: mismo encargado, territorio, estado y manzanas,
 * enviados con pocos minutos de diferencia (pasa cuando la app reintenta).
 * Se conserva el primero.
 */
export function deduplicar(reportes: ReporteAdmin[]): ReporteAdmin[] {
  const ordenados = [...reportes].sort((a, b) => ms(a.fecha) - ms(b.fecha) || a.id - b.id);
  const ultimoPorClave = new Map<string, number>();
  const resultado: ReporteAdmin[] = [];
  for (const r of ordenados) {
    const clave = [r.encargadoId, r.territorio, r.estado, r.manzanasIds ?? '', r.manzanasMarcadas].join('|');
    const t = ms(r.fecha);
    const previo = ultimoPorClave.get(clave);
    ultimoPorClave.set(clave, t);
    if (previo !== undefined && t - previo < VENTANA_DUPLICADO_MS) continue;
    resultado.push(r);
  }
  return resultado;
}

/** Duplicados que {@link deduplicar} descartaría (para ofrecer borrarlos). */
export function duplicados(reportes: ReporteAdmin[]): ReporteAdmin[] {
  const conservados = new Set(deduplicar(reportes).map(r => r.id));
  return reportes.filter(r => !conservados.has(r.id));
}

export interface Sesion {
  encargadoId: number | null;
  encargado: string;
  inicio: number;
  fin: number;
  manzanas: number;
  territorios: number[];
}

/**
 * Salidas con tiempo medido. Un envío con varios territorios produce un
 * reporte por territorio con el mismo inicio de sesión: se agrupan por
 * (encargado, inicio) y la salida dura desde el inicio hasta el último envío.
 */
export function sesiones(reportes: ReporteAdmin[]): Sesion[] {
  const grupos = new Map<string, Sesion>();
  for (const r of reportes) {
    if (!r.inicioSesion) continue;
    const inicio = ms(r.inicioSesion);
    const clave = `${r.encargadoId}|${inicio}`;
    const s = grupos.get(clave) ?? {
      encargadoId: r.encargadoId,
      encargado: nombreEncargado(r),
      inicio,
      fin: inicio,
      manzanas: 0,
      territorios: [],
    };
    s.fin = Math.max(s.fin, ms(r.fecha));
    s.manzanas += r.manzanasMarcadas ?? 0;
    if (!s.territorios.includes(r.territorio)) s.territorios.push(r.territorio);
    grupos.set(clave, s);
  }
  return [...grupos.values()].filter(s => {
    const duracion = s.fin - s.inicio;
    return s.manzanas > 0 && duracion >= MIN_SESION_MS && duracion <= MAX_SESION_MS;
  });
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Minutos por manzana de cada salida medida. */
function minutosPorManzana(ss: Sesion[]): number[] {
  return ss.map(s => (s.fin - s.inicio) / 60_000 / s.manzanas);
}

export interface Resumen {
  reportes: number;
  manzanas: number;
  territoriosTrabajados: number;
  territoriosCompletados: number;
  encargadosActivos: number;
  /** Horas de las salidas con tiempo medido; null si no hay ninguna. */
  horas: number | null;
  /** Mediana de minutos por manzana; null si no hay salidas medidas. */
  minutosPorManzana: number | null;
  salidasMedidas: number;
}

export function resumen(reportes: ReporteAdmin[]): Resumen {
  const ss = sesiones(reportes);
  return {
    reportes: reportes.length,
    manzanas: reportes.reduce((t, r) => t + (r.manzanasMarcadas ?? 0), 0),
    territoriosTrabajados: new Set(reportes.map(r => r.territorio)).size,
    territoriosCompletados: new Set(reportes.filter(completado).map(r => r.territorio)).size,
    encargadosActivos: new Set(reportes.map(r => r.encargadoId ?? nombreEncargado(r))).size,
    horas: ss.length ? ss.reduce((t, s) => t + (s.fin - s.inicio), 0) / 3_600_000 : null,
    minutosPorManzana: mediana(minutosPorManzana(ss)),
    salidasMedidas: ss.length,
  };
}

/** Inicio (hora local 00:00) de la semana (lunes) o del mes que contiene la fecha. */
export function inicioPeriodo(fecha: Date, granularidad: Granularidad): Date {
  if (granularidad === 'mes') return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const desdeLunes = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - desdeLunes);
  return d;
}

function siguientePeriodo(inicio: Date, granularidad: Granularidad): Date {
  return granularidad === 'mes'
    ? new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1)
    : new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 7);
}

export interface PuntoPeriodo {
  inicio: Date;
  manzanas: number;
  reportes: number;
  completados: number;
}

/** Actividad por semana o mes, incluyendo los períodos sin reportes (en cero). */
export function porPeriodo(
  reportes: ReporteAdmin[],
  desde: Date,
  hasta: Date,
  granularidad: Granularidad,
): PuntoPeriodo[] {
  const puntos: PuntoPeriodo[] = [];
  const indice = new Map<number, PuntoPeriodo>();
  for (let p = inicioPeriodo(desde, granularidad); p < hasta; p = siguientePeriodo(p, granularidad)) {
    const punto = { inicio: p, manzanas: 0, reportes: 0, completados: 0 };
    puntos.push(punto);
    indice.set(p.getTime(), punto);
  }
  for (const r of reportes) {
    const punto = indice.get(inicioPeriodo(new Date(r.fecha), granularidad).getTime());
    if (!punto) continue;
    punto.reportes++;
    punto.manzanas += r.manzanasMarcadas ?? 0;
    if (completado(r)) punto.completados++;
  }
  return puntos;
}

export interface FilaEncargado {
  clave: string;
  encargadoId: number | null;
  nombre: string;
  reportes: number;
  manzanas: number;
  completados: number;
  territorios: number;
  ultimo: Date;
  minutosPorManzana: number | null;
}

export function porEncargado(reportes: ReporteAdmin[]): FilaEncargado[] {
  const filas = new Map<string, FilaEncargado & { _territorios: Set<number> }>();
  for (const r of reportes) {
    const clave = r.encargadoId != null ? `id:${r.encargadoId}` : `nombre:${nombreEncargado(r).toLowerCase()}`;
    const fecha = new Date(r.fecha);
    const f = filas.get(clave) ?? {
      clave,
      encargadoId: r.encargadoId,
      nombre: nombreEncargado(r),
      reportes: 0,
      manzanas: 0,
      completados: 0,
      territorios: 0,
      ultimo: fecha,
      minutosPorManzana: null,
      _territorios: new Set<number>(),
    };
    f.reportes++;
    f.manzanas += r.manzanasMarcadas ?? 0;
    if (completado(r)) f.completados++;
    f._territorios.add(r.territorio);
    if (fecha > f.ultimo) {
      f.ultimo = fecha;
      f.nombre = nombreEncargado(r);
    }
    filas.set(clave, f);
  }
  const ss = sesiones(reportes);
  return [...filas.values()]
    .map(({ _territorios, ...f }) => {
      const propias = ss.filter(s => s.encargadoId === f.encargadoId && f.encargadoId != null);
      return { ...f, territorios: _territorios.size, minutosPorManzana: mediana(minutosPorManzana(propias)) };
    })
    .sort((a, b) => b.manzanas - a.manzanas || b.reportes - a.reportes || a.nombre.localeCompare(b.nombre));
}

/** Reportes por día de la semana (0 = lunes) y hora local: matriz 7 × 24. */
export function mapaDeCalor(reportes: ReporteAdmin[]): number[][] {
  const matriz = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const r of reportes) {
    const d = new Date(r.fecha);
    matriz[(d.getDay() + 6) % 7][d.getHours()]++;
  }
  return matriz;
}

export interface CoberturaTerritorio {
  territorio: number;
  manzanas: number;
  ultimoTrabajo: Date | null;
  ultimoCompletado: Date | null;
  ultimoEncargado: string | null;
  diasDesdeCompletado: number | null;
  vecesCompletado: number;
  estado: EstadoCobertura;
  /** El último reporte es posterior a la última vez que se completó y no lo completa. */
  enCurso: boolean;
  /** Avance del último reporte en curso (0–1), si hay datos para calcularlo. */
  avance: number | null;
}

export function estadoPorDias(dias: number | null): EstadoCobertura {
  if (dias === null) return 'sin-registro';
  if (dias <= DIAS_AL_DIA) return 'al-dia';
  if (dias <= DIAS_ATRASADO) return 'pendiente';
  return 'atrasado';
}

/**
 * Estado de cada territorio según cuándo se completó por última vez. Usa
 * todo el historial disponible, no solo el período filtrado: un territorio
 * completado hace 5 meses sigue "pendiente" aunque el filtro sea "30 días".
 */
export function cobertura(
  reportes: ReporteAdmin[],
  manzanasPorTerritorio: Map<number, number>,
  hoy: Date,
): CoberturaTerritorio[] {
  const porTerritorio = new Map<number, ReporteAdmin[]>();
  for (const r of reportes) {
    const lista = porTerritorio.get(r.territorio) ?? [];
    lista.push(r);
    porTerritorio.set(r.territorio, lista);
  }
  const numeros = new Set([...manzanasPorTerritorio.keys(), ...porTerritorio.keys()]);
  return [...numeros]
    .sort((a, b) => a - b)
    .map(territorio => {
      const lista = (porTerritorio.get(territorio) ?? []).sort((a, b) => ms(a.fecha) - ms(b.fecha));
      const ultimo = lista.at(-1) ?? null;
      const completos = lista.filter(completado);
      const ultimoCompleto = completos.at(-1) ?? null;
      const ultimoCompletado = ultimoCompleto ? new Date(ultimoCompleto.fecha) : null;
      const dias = ultimoCompletado ? diasEntre(ultimoCompletado, hoy) : null;
      const enCurso = !!ultimo && !completado(ultimo);
      const total = ultimo?.totalManzanas ?? manzanasPorTerritorio.get(territorio) ?? 0;
      return {
        territorio,
        manzanas: manzanasPorTerritorio.get(territorio) ?? ultimo?.totalManzanas ?? 0,
        ultimoTrabajo: ultimo ? new Date(ultimo.fecha) : null,
        ultimoCompletado,
        ultimoEncargado: ultimo ? nombreEncargado(ultimo) : null,
        diasDesdeCompletado: dias,
        vecesCompletado: completos.length,
        estado: estadoPorDias(dias),
        enCurso,
        avance: enCurso && total > 0 ? Math.min(1, (ultimo?.manzanasMarcadas ?? 0) / total) : null,
      };
    });
}

export interface Ciclo {
  territorio: number;
  inicio: Date;
  /** Fecha en que se completó; null si sigue en curso. */
  fin: Date | null;
  encargados: string[];
  reportes: number;
}

/**
 * Registro de asignación por territorio (equivalente al S-13): cada ciclo va
 * desde el primer reporte después de completarse hasta el reporte que lo
 * vuelve a completar.
 */
export function registroTerritorios(reportes: ReporteAdmin[]): Ciclo[] {
  const ordenados = [...reportes].sort((a, b) => a.territorio - b.territorio || ms(a.fecha) - ms(b.fecha));
  const ciclos: Ciclo[] = [];
  let actual: Ciclo | null = null;
  for (const r of ordenados) {
    if (!actual || actual.territorio !== r.territorio || actual.fin !== null) {
      actual = { territorio: r.territorio, inicio: new Date(r.fecha), fin: null, encargados: [], reportes: 0 };
      ciclos.push(actual);
    }
    actual.reportes++;
    const nombre = nombreEncargado(r);
    if (!actual.encargados.includes(nombre)) actual.encargados.push(nombre);
    if (completado(r)) actual.fin = new Date(r.fecha);
  }
  return ciclos;
}
