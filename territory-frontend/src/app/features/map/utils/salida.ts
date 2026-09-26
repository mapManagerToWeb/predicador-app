import { contiene, puntoInterior } from '../../../core/map/geometria';
import { estaEnLista, idsDeLista } from '../../../core/map/estado-publico';
import type {
  RegistroReporte,
  Reporte,
  TerritorioReporteEnvio,
  TerritoriosEnvio,
  UserProfile,
} from '../../../core/models/models';
import { franjaDeLados, leerZonas, serializarZonas, type GeometriaManzana, type ZonaParcialDatos } from './lados';

/**
 * La "salida" es lo que un encargado marca en uno o más territorios antes de
 * enviar el reporte. Todo acá es puro (sin mapa ni red) para poder probarlo.
 *
 * El reporte de un territorio es acumulativo: el último reporte dice qué
 * manzanas ya se predicaron en la vuelta en curso, y la salida parte de ahí
 * (la "base"). Si el último reporte lo completó, la salida empieza una vuelta
 * nueva, sin marcas.
 */

export interface Manzana {
  /** Id "territorio-bloque" (p. ej. "71-71.a"), el que se guarda en los reportes. */
  id: string;
  /** Id numérico de la base: reportes viejos nombran la manzana con este. */
  mid?: number;
  nombre: string;
  territorio: number;
  geometria: GeometriaManzana;
}

export interface BaseTerritorio {
  marcadas: string[];
  zonas: ZonaParcialDatos[];
  /** Fecha del último reporte (ISO-8601), si hay. */
  fecha: string | null;
  /** El último reporte completó el territorio: esta salida empieza otra vuelta. */
  vueltaNueva: boolean;
}

export interface TerritorioSalida {
  numero: number;
  /** Manzanas marcadas enteras (ids "T-bloque"), ordenadas. */
  marcadas: string[];
  /** Manzanas marcadas por calles (y zonas antiguas de trazo libre, sin manzana). */
  zonas: ZonaParcialDatos[];
  /** null mientras no se sabe (borrador de la versión anterior de la app). */
  base: BaseTerritorio | null;
}

export const BASE_VACIA: BaseTerritorio = { marcadas: [], zonas: [], fecha: null, vueltaNueva: false };

/** Qué quedó predicado según el último reporte del territorio. */
export function baseDesdeReporte(ultimo: Reporte | null, manzanas: Manzana[]): BaseTerritorio {
  if (!ultimo) return BASE_VACIA;
  const fecha = ultimo.sessionTime || ultimo.fecha || null;
  if (ultimo.estado === 'completed') return { ...BASE_VACIA, fecha, vueltaNueva: true };

  const ids = idsDeLista(ultimo.manzanasIds);
  if (ultimo.manzanaId) ids.add(String(ultimo.manzanaId));
  const marcadas = manzanas.filter(m => estaEnLista(ids, m.id, m.mid)).map(m => m.id).sort();
  const enteras = new Set(marcadas);
  const zonas = leerZonas(ultimo.geometriaParcial, ultimo.puntosParciales).filter(z => !z.manzanaId || !enteras.has(z.manzanaId));
  return { marcadas, zonas, fecha, vueltaNueva: false };
}


export function abrirTerritorio(numero: number, base: BaseTerritorio | null): TerritorioSalida {
  return {
    numero,
    marcadas: base ? [...base.marcadas] : [],
    zonas: base ? [...base.zonas] : [],
    base,
  };
}

/** Zonas antiguas (sin manzana) que caen dentro de la manzana. */
function zonasAntiguasDentro(zonas: ZonaParcialDatos[], manzana: Manzana): Set<ZonaParcialDatos> {
  return new Set(
    zonas.filter(z => !z.manzanaId && contiene(manzana.geometria, puntoInterior(z.geometria))),
  );
}

/** Quita de la salida todo lo marcado por calles en esa manzana. */
function sinZonasDe(zonas: ZonaParcialDatos[], manzana: Manzana): ZonaParcialDatos[] {
  const antiguas = zonasAntiguasDentro(zonas, manzana);
  return zonas.filter(z => z.manzanaId !== manzana.id && !antiguas.has(z));
}

export function estaMarcada(t: TerritorioSalida, manzanaId: string): boolean {
  return t.marcadas.includes(manzanaId);
}

export function zonaDe(t: TerritorioSalida, manzanaId: string): ZonaParcialDatos | undefined {
  return t.zonas.find(z => z.manzanaId === manzanaId);
}

/** Un toque en modo "manzana entera": la marca, o la desmarca si ya estaba. */
export function alternarManzana(t: TerritorioSalida, manzana: Manzana): TerritorioSalida {
  if (estaMarcada(t, manzana.id)) {
    return { ...t, marcadas: t.marcadas.filter(id => id !== manzana.id) };
  }
  // Marcarla entera reemplaza lo que tuviera marcado por calles.
  return { ...t, marcadas: [...t.marcadas, manzana.id].sort(), zonas: sinZonasDe(t.zonas, manzana) };
}

/**
 * Guarda las calles elegidas de una manzana: ninguna la deja sin marcar,
 * todas la marcan entera y algunas guardan la franja de esas calles.
 */
export function guardarLados(
  t: TerritorioSalida,
  manzana: Manzana,
  seleccion: number[],
  totalLados: number,
): TerritorioSalida {
  const sinManzana = { ...t, marcadas: t.marcadas.filter(id => id !== manzana.id), zonas: sinZonasDe(t.zonas, manzana) };
  if (seleccion.length === 0) return sinManzana;
  if (seleccion.length >= totalLados) return alternarManzana(sinManzana, manzana);
  const geometria = franjaDeLados(manzana.geometria, seleccion);
  if (!geometria) return t;
  const zona: ZonaParcialDatos = {
    manzanaId: manzana.id,
    manzanaNombre: manzana.nombre,
    lados: [...seleccion].sort((a, b) => a - b),
    geometria,
  };
  return { ...sinManzana, zonas: [...sinManzana.zonas, zona] };
}

/** Lados que ya tiene elegidos la manzana (todos si está marcada entera). */
export function ladosElegidos(t: TerritorioSalida, manzanaId: string, totalLados: number): number[] {
  if (estaMarcada(t, manzanaId)) return Array.from({ length: totalLados }, (_, i) => i);
  return zonaDe(t, manzanaId)?.lados.filter(i => i < totalLados) ?? [];
}

function claveZonas(zonas: ZonaParcialDatos[]): string {
  return zonas
    .map(z => `${z.manzanaId ?? JSON.stringify(z.geometria)}:${z.lados.join('.')}`)
    .sort()
    .join('|');
}

/** ¿Hay algo que enviar? (lo marcado difiere del último reporte). */
export function hayCambios(t: TerritorioSalida): boolean {
  const base = t.base;
  if (base === null) return t.marcadas.length > 0 || t.zonas.length > 0;
  return t.marcadas.join(',') !== [...base.marcadas].sort().join(',') || claveZonas(t.zonas) !== claveZonas(base.zonas);
}

export interface ResumenTerritorio {
  numero: number;
  total: number;
  enteras: number;
  porCalles: number;
  completo: boolean;
  cambios: boolean;
}

export function resumir(t: TerritorioSalida, total: number): ResumenTerritorio {
  const enteras = t.marcadas.length;
  return {
    numero: t.numero,
    total,
    enteras,
    porCalles: t.zonas.length,
    completo: total > 0 && enteras >= total,
    cambios: hayCambios(t),
  };
}

/** Registro para guardar en la base (mismo formato que la versión Leaflet). */
export function registroDe(
  t: TerritorioSalida,
  total: number,
  perfil: UserProfile,
  inicioSesion: string | null,
  ahora = new Date(),
): RegistroReporte {
  const r = resumir(t, total);
  const { geometriaParcial, puntosParciales } = serializarZonas(t.zonas);
  return {
    territorioNumero: t.numero,
    manzanaId: t.marcadas[0] ?? null,
    encargadoId: perfil.encargadoId ?? null,
    encargadoNombre: perfil.name,
    encargadoApellido: perfil.lastName,
    sessionTime: ahora.toISOString(),
    estado: r.completo ? 'completed' : 'incomplete',
    totalManzanas: total,
    manzanasMarcadas: r.enteras + r.porCalles,
    tipoSesion: r.completo ? 'completa' : 'parcial',
    geometriaParcial,
    puntosParciales,
    manzanasIds: t.marcadas.join(','),
    inicioSesion,
  };
}

/**
 * Qué va en el mensaje de WhatsApp: un único territorio completado se anuncia
 * con la imagen oficial (sin captura); si hay incompletos, se mandan esos con
 * captura del mapa y los completados se omiten del mensaje.
 */
export function envioDe(resumenes: ResumenTerritorio[]): TerritoriosEnvio {
  const unico = resumenes.length === 1;
  const territorios: TerritorioReporteEnvio[] = resumenes
    .filter(r => unico || !r.completo)
    .map(r => ({
      numero: r.numero,
      finalizado: r.completo,
      totalManzanas: r.total,
      manzanasMarcadas: r.enteras + r.porCalles,
    }));
  const soloUnoCompleto = unico && territorios.length === 1 && territorios[0].finalizado;
  return { territorios, requiereScreenshot: territorios.length > 0 && !soloUnoCompleto };
}

/** "Mañana" antes de las 14 h, "tarde" después (la predicación de la tarde empieza ~15 h). */
export function turnoPorHora(ahora = new Date()): 'mañana' | 'tarde' {
  return ahora.getHours() < 14 ? 'mañana' : 'tarde';
}
