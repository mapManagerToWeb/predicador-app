import type { ManzanaFeature } from '../admin.models';

/**
 * Lectura de un archivo de manzanas (GeoJSON o el KML ya convertido) para
 * detectar, antes de mandarlo al servidor, lo que ya está en el mapa.
 *
 * El servidor sigue siendo el que decide: esto solo evita el viaje y permite
 * decir en lenguaje claro cuáles se repiten.
 */

export interface ManzanaImportada {
  territorio: number;
  nombre: string;
}

/** Una manzana del archivo que ya existe, con el id de la que está en el mapa. */
export interface ManzanaRepetida extends ManzanaImportada {
  id: number;
}

/**
 * Lo que el archivo declara como manzana: `territorio` y `nombre`, con los
 * alias que acepta el importador (`territorio_padre`, `nombre_bloque`). Si el
 * archivo no se puede leer devuelve una lista vacía y el servidor responde
 * con su propio mensaje.
 */
export function manzanasDeclaradas(texto: string): ManzanaImportada[] {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return [];
  }
  const features = (datos as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];

  const manzanas: ManzanaImportada[] = [];
  for (const feature of features) {
    const props = (feature as { properties?: Record<string, unknown> } | null)?.properties;
    if (!props) continue;
    const territorio = Number(props['territorio'] ?? props['territorio_padre']);
    const nombre = String(props['nombre'] ?? props['nombre_bloque'] ?? '').trim();
    if (Number.isFinite(territorio) && nombre) manzanas.push({ territorio, nombre });
  }
  return manzanas;
}

/**
 * Manzanas del archivo que ya están en el mapa, comparando territorio y
 * nombre como el servidor (sin mayúsculas ni espacios de más). Se conserva el
 * orden del archivo y cada manzana aparece una sola vez.
 */
export function manzanasRepetidas(
  entrantes: ManzanaImportada[],
  existentes: ManzanaFeature[],
): ManzanaRepetida[] {
  const enElMapa = new Map<string, number>();
  for (const m of existentes) enElMapa.set(clave(m.properties.territorio, m.properties.nombre), m.properties.id);

  const vistas = new Set<string>();
  const repetidas: ManzanaRepetida[] = [];
  for (const m of entrantes) {
    const id = enElMapa.get(clave(m.territorio, m.nombre));
    if (id === undefined) continue;
    const k = clave(m.territorio, m.nombre);
    if (vistas.has(k)) continue;
    vistas.add(k);
    repetidas.push({ id, territorio: m.territorio, nombre: m.nombre.trim() });
  }
  return repetidas;
}

/** Misma comparación que el servidor: `territorio` + `nombre` sin mayúsculas ni espacios. */
function clave(territorio: number, nombre: string): string {
  return `${territorio}-${nombre.trim().toLowerCase()}`;
}
