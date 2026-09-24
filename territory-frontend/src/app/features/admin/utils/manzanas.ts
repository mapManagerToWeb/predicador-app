import type { ManzanaFeature, ManzanaGuardada, ManzanasCollection } from '../admin.models';

/** Letras a, b, …, z, aa, ab, … como las de las manzanas cargadas ("12.a", "12.b"). */
function letra(n: number): string {
  let s = '';
  for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(97 + (i % 26)) + s;
  return s;
}

/** Siguiente nombre libre para una manzana del territorio: "12.c" si ya existen "12.a" y "12.b". */
export function sugerirNombre(territorio: number, existentes: string[]): string {
  const usados = new Set(existentes.map(n => n.trim().toLowerCase()));
  for (let i = 0; i < 26 * 27; i++) {
    const candidato = `${territorio}.${letra(i)}`;
    if (!usados.has(candidato)) return candidato;
  }
  return `${territorio}.${existentes.length + 1}`;
}

/** Siguiente número de territorio sin usar. */
export function siguienteTerritorio(numeros: number[]): number {
  return numeros.length ? Math.max(...numeros) + 1 : 1;
}

/** Feature del mapa a partir de la respuesta del backend. */
export function aFeature(m: ManzanaGuardada): ManzanaFeature {
  return {
    type: 'Feature',
    id: m.id,
    geometry: JSON.parse(m.geometria) as ManzanaFeature['geometry'],
    properties: { id: m.id, territorio: m.territorio, nombre: m.nombre, areaM2: m.areaM2, valida: m.valida },
  };
}

/** Colección nueva con la manzana agregada o reemplazada (las señales necesitan otra referencia). */
export function conManzana(coleccion: ManzanasCollection, feature: ManzanaFeature): ManzanasCollection {
  const otras = coleccion.features.filter(f => f.id !== feature.id);
  return { ...coleccion, features: [...otras, feature] };
}

export function sinManzanas(coleccion: ManzanasCollection, ids: Iterable<number>): ManzanasCollection {
  const quitar = new Set(ids);
  return { ...coleccion, features: coleccion.features.filter(f => !quitar.has(Number(f.id))) };
}

export function fmtArea(m2: number): string {
  return m2 >= 100_000
    ? `${(m2 / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} km²`
    : `${Math.round(m2).toLocaleString('es-CL')} m²`;
}
