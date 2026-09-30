import type { CorreccionRequest, CorreccionSalidaRequest, EstadoTerritorioAdmin, ManzanaFeature, SalidaAdmin } from '../admin.models';
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

// ── Corregir el reporte de una salida (ADR 0014) ──
//
// Se edita cómo quedó el territorio después de esa salida. Lo que ya estaba
// antes (la "base") no es de esa salida: no se toca.

type EstadoGuardado = Pick<EstadoTerritorioAdmin, 'estado' | 'manzanasIds' | 'geometriaParcial' | 'puntosParciales'>;

function comoEstadoAdmin(e: EstadoGuardado, territorio: number): EstadoTerritorioAdmin {
  return { territorio, fecha: null, origen: null, encargado: null, totalManzanas: null, ...e };
}

/** Lo que había antes de la salida (vacío si ahí empezaba una vuelta nueva). */
export function baseDeSalida(s: SalidaAdmin, manzanas: ManzanaFeature[]): EstadoCorreccion {
  const a = s.anterior;
  if (!a || a.estado === 'completed' || a.estado === 'reiniciado') return vaciar();
  return estadoDesde(comoEstadoAdmin(a, s.territorio), manzanas);
}

/** Cómo quedó el territorio después de la salida. */
export function estadoDeSalida(s: SalidaAdmin, manzanas: ManzanaFeature[]): EstadoCorreccion {
  return estadoDesde(comoEstadoAdmin(s, s.territorio), manzanas);
}

const mismosLados = (a: ZonaParcialDatos, b: ZonaParcialDatos) => a.lados.join('.') === b.lados.join('.');

/** La zona ya estaba antes de la salida (no es de ella). */
export function esDeLaBase(base: EstadoCorreccion, z: ZonaParcialDatos): boolean {
  return base.zonas.some(b =>
    z.manzanaId ? b.manzanaId === z.manzanaId && mismosLados(b, z) : !b.manzanaId && JSON.stringify(b.geometria) === JSON.stringify(z.geometria),
  );
}

/** Índices de las zonas que ya estaban antes (el mapa las muestra en gris). */
export function zonasDeLaBase(base: EstadoCorreccion, e: EstadoCorreccion): Set<number> {
  return new Set(e.zonas.flatMap((z, i) => (esDeLaBase(base, z) ? [i] : [])));
}

/**
 * Un clic en una manzana al corregir una salida: lo que ya estaba antes no
 * cambia; si la salida la marcó entera o le agregó calles, vuelve a como
 * estaba antes; si no la tocó, la marca entera.
 */
export function alternarEnSalida(base: EstadoCorreccion, e: EstadoCorreccion, m: ManzanaFeature): EstadoCorreccion {
  const k = clave(m);
  if (base.marcadas.has(k)) return e;
  const zonaBase = base.zonas.find(z => z.manzanaId === k);
  const marcadas = new Set(e.marcadas);
  const sinZona = e.zonas.filter(z => z.manzanaId !== k);
  const comoAntes = { marcadas, zonas: zonaBase ? [...sinZona, zonaBase] : sinZona };
  switch (situacion(e, m)) {
    case 'entera':
      marcadas.delete(k);
      return comoAntes;
    case 'calles': {
      const zona = e.zonas.find(z => z.manzanaId === k)!;
      if (esDeLaBase(base, zona)) {
        marcadas.add(k);
        return { marcadas, zonas: sinZona };
      }
      return comoAntes;
    }
    case 'nada':
      marcadas.add(k);
      return { marcadas, zonas: e.zonas };
  }
}

/** Clic en una franja de calles: si es de la salida, vuelve a como estaba antes. */
export function quitarZonaEnSalida(base: EstadoCorreccion, e: EstadoCorreccion, indice: number): EstadoCorreccion {
  const zona = e.zonas[indice];
  if (!zona || esDeLaBase(base, zona)) return e;
  const zonaBase = zona.manzanaId ? base.zonas.find(z => z.manzanaId === zona.manzanaId) : undefined;
  const zonas = e.zonas.filter((_, i) => i !== indice);
  return { marcadas: e.marcadas, zonas: zonaBase ? [...zonas, zonaBase] : zonas };
}

/** Lo que marcó la salida (para el resumen del editor). */
export function aporteDeSalida(base: EstadoCorreccion, e: EstadoCorreccion): { enteras: number; porCalles: number } {
  return {
    enteras: [...e.marcadas].filter(k => !base.marcadas.has(k)).length,
    porCalles: e.zonas.filter(z => !esDeLaBase(base, z)).length,
  };
}

export function pedidoSalida(e: EstadoCorreccion, anular: boolean, nota: string): CorreccionSalidaRequest {
  const { geometriaParcial, puntosParciales } = serializarZonas(e.zonas);
  return {
    anular,
    manzanasIds: anular ? null : [...e.marcadas].sort().join(','),
    geometriaParcial: anular ? null : geometriaParcial,
    puntosParciales: anular ? null : puntosParciales,
    nota: nota.trim() || null,
  };
}
