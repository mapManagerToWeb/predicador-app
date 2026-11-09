import { calcularLados, franjaDeLados, serializarZonas, type GeometriaManzana, type Lado, type ZonaParcialDatos } from '../../../core/map/lados';
import type { EstadoTerritorioAdmin, ManzanaFeature, RegistroSalidaRequest } from '../admin.models';
import { alternarEnSalida, clave, esDeLaBase, estadoDesde, type EstadoCorreccion, vaciar } from './correccion';

/**
 * Registrar desde el panel una salida que un hermano informó (p. ej. por
 * WhatsApp). Se parte del estado actual del territorio (la «base», que no se
 * toca) y se marca lo que se predicó en esta salida: manzanas enteras o
 * calles. Al servidor solo va lo nuevo; él lo suma al estado (ADR 0013).
 * Funciones puras.
 */

/** Lo que había antes de esta salida (vacío si el territorio estaba completo o recién reiniciado). */
export function baseDeRegistro(estado: EstadoTerritorioAdmin | null, manzanas: ManzanaFeature[]): EstadoCorreccion {
  if (!estado || estado.estado === 'completed' || estado.estado === 'reiniciado') return vaciar();
  return estadoDesde(estado, manzanas);
}

/** Clic en una manzana en modo «manzana entera»: lo de la base no cambia. */
export function alternarEntera(base: EstadoCorreccion, e: EstadoCorreccion, m: ManzanaFeature): EstadoCorreccion {
  return alternarEnSalida(base, e, m);
}

/** Todo el territorio predicado («territorio X completado»). */
export function todoElTerritorio(manzanas: ManzanaFeature[]): EstadoCorreccion {
  return { marcadas: new Set(manzanas.map(clave)), zonas: [] };
}

export function ladosDe(m: ManzanaFeature): Lado[] {
  return calcularLados(m.geometry as GeometriaManzana);
}

/** Calles elegidas de una manzana (todas si está entera) y las que ya estaban en la base. */
export function callesDe(
  base: EstadoCorreccion,
  e: EstadoCorreccion,
  m: ManzanaFeature,
  total: number,
): { elegidas: number[]; deLaBase: number[] } {
  const k = clave(m);
  const todas = Array.from({ length: total }, (_, i) => i);
  const deLaBase = base.marcadas.has(k) ? todas : (base.zonas.find(z => z.manzanaId === k)?.lados ?? []);
  const elegidas = e.marcadas.has(k) ? todas : (e.zonas.find(z => z.manzanaId === k)?.lados ?? []);
  return { elegidas: [...new Set([...deLaBase, ...elegidas])].filter(i => i < total).sort((a, b) => a - b), deLaBase };
}

/**
 * Marca o desmarca una calle de la manzana. Las de la base quedan siempre;
 * con todas las calles la manzana pasa a entera, y sin ninguna nueva vuelve a
 * como estaba en la base.
 */
export function alternarCalle(
  base: EstadoCorreccion,
  e: EstadoCorreccion,
  m: ManzanaFeature,
  lados: Lado[],
  indice: number,
): EstadoCorreccion {
  const k = clave(m);
  const total = lados.length;
  if (base.marcadas.has(k) || total === 0) return e;
  const { elegidas, deLaBase } = callesDe(base, e, m, total);
  if (deLaBase.includes(indice)) return e;
  const seleccion = elegidas.includes(indice) ? elegidas.filter(i => i !== indice) : [...elegidas, indice].sort((a, b) => a - b);

  const marcadas = new Set(e.marcadas);
  marcadas.delete(k);
  const otras = e.zonas.filter(z => z.manzanaId !== k);
  const zonaBase = base.zonas.find(z => z.manzanaId === k);
  if (seleccion.length >= total) {
    marcadas.add(k);
    return { marcadas, zonas: otras };
  }
  if (seleccion.length === deLaBase.length) {
    return { marcadas, zonas: zonaBase ? [...otras, zonaBase] : otras };
  }
  const geometria = franjaDeLados(m.geometry as GeometriaManzana, seleccion);
  if (!geometria) return e;
  const zona: ZonaParcialDatos = {
    manzanaId: k,
    manzanaNombre: m.properties.nombre,
    lados: seleccion,
    totalLados: total,
    geometria,
  };
  return { marcadas, zonas: [...otras, zona] };
}

/** Lo nuevo de esta salida: manzanas enteras y calles que no estaban en la base. */
export function aporte(base: EstadoCorreccion, e: EstadoCorreccion): { enteras: string[]; zonas: ZonaParcialDatos[] } {
  return {
    enteras: [...e.marcadas].filter(k => !base.marcadas.has(k)).sort(),
    zonas: e.zonas.filter(z => !esDeLaBase(base, z)),
  };
}

/** Cuántas manzanas quedarían marcadas (enteras + por calles) y si el territorio queda completo. */
export function resultado(e: EstadoCorreccion, total: number): { enteras: number; porCalles: number; completo: boolean } {
  return { enteras: e.marcadas.size, porCalles: e.zonas.length, completo: total > 0 && e.marcadas.size >= total };
}

export interface Hermano {
  id: number | null;
  nombre: string;
  apellido: string;
}

/**
 * "Pedro Soto Díaz" → nombre "Pedro", apellido "Soto Díaz". Para un hermano
 * escrito a mano (sin cuenta en la app).
 */
export function hermanoEscrito(texto: string): Hermano {
  const partes = texto.trim().split(/\s+/).filter(Boolean);
  return { id: null, nombre: partes[0] ?? '', apellido: partes.slice(1).join(' ') };
}

export function pedidoRegistro(
  territorio: number,
  hermano: Hermano,
  dia: string,
  turno: 'mañana' | 'tarde' | null,
  base: EstadoCorreccion,
  e: EstadoCorreccion,
  total: number,
  nota: string,
): RegistroSalidaRequest {
  const nuevo = aporte(base, e);
  const { geometriaParcial, puntosParciales } = serializarZonas(nuevo.zonas);
  return {
    territorio,
    encargadoId: hermano.id,
    encargadoNombre: hermano.nombre,
    encargadoApellido: hermano.apellido,
    fechaPredicacion: dia,
    turno,
    manzanasIds: nuevo.enteras.join(','),
    geometriaParcial: nuevo.zonas.length ? geometriaParcial : null,
    puntosParciales: nuevo.zonas.length ? puntosParciales : null,
    totalManzanas: total,
    nota: nota.trim() || null,
  };
}
