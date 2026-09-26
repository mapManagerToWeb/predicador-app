/** Estado público de un territorio (GET /reports/public/estado). Fechas ISO-8601. */
export interface EstadoTerritorioPublico {
  territorio: number;
  ultimoTrabajo: string | null;
  ultimoCompletado: string | null;
  estado: string | null;
  manzanasMarcadas: number | null;
  totalManzanas: number | null;
  manzanasIds: string | null;
  geometriaParcial: string | null;
}

/**
 * Ids de manzana de una lista de reportes. Según la versión de la app, un
 * reporte nombra la manzana como "12-12.e" (territorio-bloque) o por su id
 * numérico de la base: hay que comparar con los dos.
 */
export function idsDeLista(lista: string | null | undefined): Set<string> {
  const ids = new Set<string>();
  for (const id of (lista ?? '').split(',')) {
    const limpio = id.trim();
    if (limpio) ids.add(limpio);
  }
  return ids;
}

/** ¿La manzana (id "T-bloque" y, si se conoce, id numérico) está en la lista? */
export function estaEnLista(ids: Set<string>, id: string, mid?: number): boolean {
  return ids.has(id) || (mid !== undefined && ids.has(String(mid)));
}
