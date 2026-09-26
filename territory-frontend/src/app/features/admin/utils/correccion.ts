import type { CorreccionRequest, EstadoTerritorioAdmin, ManzanaFeature } from '../admin.models';
// Mismo formato de zonas que el mapa de los encargados (ADR 0008).
import { leerZonas, serializarZonas, type ZonaParcialDatos } from '../../map/utils/lados';

/**
 * Corrección del estado actual de un territorio desde el panel (p. ej. una
 * manzana marcada por error). Funciones puras sobre el último reporte.
 */

export interface EstadoCorreccion {
  /** Manzanas marcadas enteras, como "territorio-nombre" (el id que guarda el mapa). */
  marcadas: Set<string>;
  /** Zonas marcadas por calles; las antiguas (trazo libre) no tienen manzana. */
  zonas: ZonaParcialDatos[];
}

export type Situacion = 'entera' | 'calles' | 'nada';

export function clave(m: ManzanaFeature): string {
  return `${m.properties.territorio}-${m.properties.nombre}`;
}

/** Estado actual a partir del último reporte (que puede nombrar manzanas por "T-nombre" o por id numérico). */
export function estadoDesde(estado: EstadoTerritorioAdmin | null, manzanas: ManzanaFeature[]): EstadoCorreccion {
  if (!estado || estado.estado === 'reiniciado') return { marcadas: new Set(), zonas: [] };
  const ids = new Set((estado.manzanasIds ?? '').split(',').map(s => s.trim()).filter(Boolean));
  const marcadas = new Set(manzanas.filter(m => ids.has(clave(m)) || ids.has(String(m.properties.id))).map(clave));
  const zonas = leerZonas(estado.geometriaParcial, estado.puntosParciales).filter(z => !z.manzanaId || !marcadas.has(z.manzanaId));
  return { marcadas, zonas };
}

export function situacion(e: EstadoCorreccion, m: ManzanaFeature): Situacion {
  const k = clave(m);
  if (e.marcadas.has(k)) return 'entera';
  return e.zonas.some(z => z.manzanaId === k) ? 'calles' : 'nada';
}

/**
 * Un clic en una manzana: si estaba entera la desmarca; si tenía calles
 * marcadas, las quita; si no tenía nada, la marca entera.
 */
export function alternar(e: EstadoCorreccion, m: ManzanaFeature): EstadoCorreccion {
  const k = clave(m);
  const marcadas = new Set(e.marcadas);
  switch (situacion(e, m)) {
    case 'entera':
      marcadas.delete(k);
      return { marcadas, zonas: e.zonas };
    case 'calles':
      return { marcadas, zonas: e.zonas.filter(z => z.manzanaId !== k) };
    case 'nada':
      marcadas.add(k);
      return { marcadas, zonas: e.zonas };
  }
}

export function quitarZona(e: EstadoCorreccion, indice: number): EstadoCorreccion {
  return { marcadas: e.marcadas, zonas: e.zonas.filter((_, i) => i !== indice) };
}

export function vaciar(): EstadoCorreccion {
  return { marcadas: new Set(), zonas: [] };
}

export function iguales(a: EstadoCorreccion, b: EstadoCorreccion): boolean {
  const ka = [...a.marcadas].sort().join(',');
  const kb = [...b.marcadas].sort().join(',');
  return ka === kb && serializarZonas(a.zonas).puntosParciales === serializarZonas(b.zonas).puntosParciales;
}

export function pedido(e: EstadoCorreccion, territorio: number, total: number, nota: string): CorreccionRequest {
  const { geometriaParcial, puntosParciales } = serializarZonas(e.zonas);
  return {
    territorio,
    manzanasIds: [...e.marcadas].sort().join(','),
    geometriaParcial,
    puntosParciales,
    totalManzanas: total,
    manzanasMarcadas: e.marcadas.size + e.zonas.length,
    nota: nota.trim() || null,
  };
}
