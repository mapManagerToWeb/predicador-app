import type { LatLng } from 'leaflet';

/**
 * Aplana el resultado de `Path.getLatLngs()` en rings de `LatLng`.
 *
 * <p>En Leaflet 2.0 (alpha) las geometrías `Polygon` y `MultiPolygon`
 * comparten la clase `L.Polygon`: un MultiPolygon deja `getLatLngs()` con
 * forma `[[ring], [ring]]` (cada parte envuelve sus rings), y un Polygon
 * con huecos devuelve `[ringExterior, ringHueco]`. Tratar la forma anidada
 * como si cada elemento fuera un punto (como hacía la captura) hacía pasar
 * ARRAYS a `latLngToContainerPoint`, que `toLatLng` convertía en `null` ->
 * `TypeError` al leer `.lat` — rompiendo el guardado de reportes con zonas
 * parciales (los territorios disueltos con turf `union` y las manzanas
 * multiparte — 8 en los datos — son MultiPolygon).</p>
 *
 * <p>También tolera rings degenerados (elementos vacíos o sin lat/lng) que
 * pueden aparecer tras simplify/union: se descartan sin romper.</p>
 */
export function collectLatLngRings(latlngs: unknown): LatLng[][] {
  const rings: LatLng[][] = [];
  const isValidPoint = (p: unknown): p is LatLng =>
    typeof p === 'object' && p !== null && 'lat' in p && 'lng' in p;

  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    const first = node[0];
    // Un ring es una lista cuyos elementos son puntos; sin no lo es,
    // descendemos un nivel (parte de MultiPolygon).
    const isRing = node.length === 0 || isValidPoint(first);
    if (isRing) {
      const clean = (node as unknown[]).filter(isValidPoint);
      if (clean.length > 0) rings.push(clean);
      return;
    }
    for (const child of node) walk(child);
  };

  walk(latlngs);
  return rings;
}