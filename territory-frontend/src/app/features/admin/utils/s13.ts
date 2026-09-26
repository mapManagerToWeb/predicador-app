import type { ReporteAdmin } from '../admin.models';
import { completado, deduplicar, esSalida } from './analytics';

/**
 * S-13 (Registro de asignación de territorio) a partir de los reportes.
 *
 * En la app no se "asigna" un territorio: los encargados reportan salidas.
 * Una asignación empieza con el primer reporte de un encargado en la vuelta
 * del territorio y dura mientras siga reportando él; si otro continúa, empieza
 * otra asignación (la anterior queda sin fecha de completado, igual que en el
 * papel). Termina cuando un reporte completa el territorio. Una corrección del
 * administrador que lo deja completo también lo cierra; un reinicio de ciclo
 * cierra la asignación abierta sin completarla.
 */

export interface AsignacionS13 {
  territorio: number;
  encargado: string;
  asignado: Date;
  completado: Date | null;
  /** Primera asignación después de un reinicio de ciclo: ahí empieza una vuelta nueva. */
  trasReinicio?: boolean;
}

export interface FilaS13 {
  territorio: number;
  /** Última vez que se completó antes de las asignaciones de esta fila. */
  ultimaCompletada: Date | null;
  /** Siempre 4 casillas (null = vacía). */
  asignaciones: (AsignacionS13 | null)[];
}

export interface PaginaS13 {
  filas: FilaS13[];
}

export const TERRITORIOS_POR_PAGINA = 20;
export const ASIGNACIONES_POR_FILA = 4;

/** "Juan Pérez": nombre y primer apellido (la casilla del formulario es angosta). */
export function nombreS13(r: Pick<ReporteAdmin, 'encargadoNombre' | 'encargadoApellido'>): string {
  const nombre = (r.encargadoNombre ?? '').trim().split(/\s+/)[0] ?? '';
  const apellido = (r.encargadoApellido ?? '').trim().split(/\s+/)[0] ?? '';
  return `${nombre} ${apellido}`.trim() || 'Sin nombre';
}

function ms(fecha: string): number {
  return new Date(fecha).getTime();
}

export function asignaciones(reportes: ReporteAdmin[]): AsignacionS13[] {
  const ordenados = deduplicar(reportes).sort((a, b) => a.territorio - b.territorio || ms(a.fecha) - ms(b.fecha) || a.id - b.id);
  const resultado: AsignacionS13[] = [];
  let abierta: AsignacionS13 | null = null;
  let territorio: number | null = null;
  let reiniciado = false;

  for (const r of ordenados) {
    if (r.territorio !== territorio) {
      territorio = r.territorio;
      abierta = null;
      reiniciado = false;
    }
    if (r.origen === 'reinicio') {
      abierta = null;
      reiniciado = true;
      continue;
    }
    if (!esSalida(r)) {
      // Corrección del administrador: solo cuenta si deja el territorio completo.
      if (abierta && completado(r)) {
        abierta.completado = new Date(r.fecha);
        abierta = null;
      }
      continue;
    }
    const encargado = nombreS13(r);
    if (!abierta || abierta.encargado !== encargado) {
      const inicio = r.inicioSesion && ms(r.inicioSesion) <= ms(r.fecha) ? r.inicioSesion : r.fecha;
      abierta = { territorio: r.territorio, encargado, asignado: new Date(inicio), completado: null };
      if (reiniciado) abierta.trasReinicio = true;
      reiniciado = false;
      resultado.push(abierta);
    }
    if (completado(r)) {
      abierta.completado = new Date(r.fecha);
      abierta = null;
    }
  }
  return resultado;
}

/** Año de servicio: del 1 de septiembre del año anterior al 31 de agosto. */
export function anioDeServicio(fecha: Date): number {
  return fecha.getMonth() >= 8 ? fecha.getFullYear() + 1 : fecha.getFullYear();
}

export function rangoAnioDeServicio(anio: number): { desde: Date; hasta: Date } {
  return { desde: new Date(anio - 1, 8, 1), hasta: new Date(anio, 8, 1) };
}

/**
 * Páginas del formulario para las asignaciones que empezaron en [desde, hasta):
 * 20 territorios por página y 4 asignaciones por fila. Un territorio con más
 * de 4 sigue en otra página, que repite el bloque de territorios; en esa fila,
 * "última fecha en que se completó" es la anterior a sus asignaciones.
 */
export function paginasS13(todas: AsignacionS13[], territorios: number[], desde: Date, hasta: Date): PaginaS13[] {
  const porTerritorio = new Map<number, AsignacionS13[]>();
  for (const a of todas) {
    const lista = porTerritorio.get(a.territorio) ?? [];
    lista.push(a);
    porTerritorio.set(a.territorio, lista);
  }
  const numeros = [...new Set([...territorios, ...porTerritorio.keys()])].sort((a, b) => a - b);

  const ultimaAntesDe = (t: number, limite: Date): Date | null => {
    let ultima: Date | null = null;
    for (const a of porTerritorio.get(t) ?? []) {
      if (a.completado && a.completado < limite && (!ultima || a.completado > ultima)) ultima = a.completado;
    }
    return ultima;
  };

  const paginas: PaginaS13[] = [];
  for (let i = 0; i < numeros.length; i += TERRITORIOS_POR_PAGINA) {
    const grupo = numeros.slice(i, i + TERRITORIOS_POR_PAGINA);
    const bloques = new Map(
      grupo.map(t => {
        const enRango = (porTerritorio.get(t) ?? []).filter(a => a.asignado >= desde && a.asignado < hasta);
        const partes: AsignacionS13[][] = [];
        for (let j = 0; j < enRango.length; j += ASIGNACIONES_POR_FILA) partes.push(enRango.slice(j, j + ASIGNACIONES_POR_FILA));
        return [t, partes] as const;
      }),
    );
    const cantidad = Math.max(1, ...[...bloques.values()].map(p => p.length));
    for (let k = 0; k < cantidad; k++) {
      paginas.push({
        filas: grupo.map(t => {
          const parte = bloques.get(t)![k] ?? [];
          const casillas: (AsignacionS13 | null)[] = [...parte];
          while (casillas.length < ASIGNACIONES_POR_FILA) casillas.push(null);
          const limite = parte[0]?.asignado ?? (k === 0 ? desde : null);
          return { territorio: t, ultimaCompletada: limite ? ultimaAntesDe(t, limite) : null, asignaciones: casillas };
        }),
      });
    }
  }
  return paginas;
}

export interface TiempoTerritorio {
  territorio: number;
  /** Vueltas completadas en el período. */
  vueltas: number;
  /** Días promedio desde la primera asignación de la vuelta hasta completarla. */
  promedioDias: number | null;
  ultimaCompletada: Date | null;
}

/**
 * Cuánto tarda cada territorio en completarse: cada vuelta va desde la primera
 * asignación después de la última vez que se completó (o de un reinicio)
 * hasta la asignación que lo completa.
 */
export function tiemposPorTerritorio(todas: AsignacionS13[], desde: Date, hasta: Date): TiempoTerritorio[] {
  const porTerritorio = new Map<number, AsignacionS13[]>();
  for (const a of todas) {
    const lista = porTerritorio.get(a.territorio) ?? [];
    lista.push(a);
    porTerritorio.set(a.territorio, lista);
  }
  return [...porTerritorio.entries()]
    .sort(([a], [b]) => a - b)
    .map(([territorio, lista]) => {
      const dias: number[] = [];
      let inicioVuelta: Date | null = null;
      let ultimaCompletada: Date | null = null;
      for (const a of lista) {
        if (a.trasReinicio) inicioVuelta = null;
        inicioVuelta ??= a.asignado;
        if (!a.completado) continue;
        if (a.completado >= desde && a.completado < hasta) {
          dias.push(Math.max(0, Math.round((a.completado.getTime() - inicioVuelta.getTime()) / 86_400_000)));
          ultimaCompletada = a.completado;
        }
        inicioVuelta = null;
      }
      return {
        territorio,
        vueltas: dias.length,
        promedioDias: dias.length ? Math.round(dias.reduce((s, d) => s + d, 0) / dias.length) : null,
        ultimaCompletada,
      };
    });
}
