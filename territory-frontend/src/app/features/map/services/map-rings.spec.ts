import { describe, expect, it } from 'vitest';
import { collectLatLngRings } from './map-rings';

// Regresión del bug de "marcado parcial": en Leaflet 2.0 (alpha) las
// geometrías Polygon y MultiPolygon comparten la clase L.Polygon, y un
// MultiPolygon deja getLatLngs() con forma [[ring],[ring]] (cada parte
// envuelve sus rings). La captura anterior trataba esa forma como
// [ring, ring], pasaba ARRAYS a latLngToContainerPoint, y Leaflet los
// convertía en null -> TypeError (captura rota -> error al guardar).

describe('collectLatLngRings', () => {
  it('devuelve el ring de un Polygon simple', () => {
    const ring = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 0 },
      { lat: 0, lng: 1 },
    ];
    const rings = collectLatLngRings([ring]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(3);
    expect(rings[0][0]).toEqual({ lat: 0, lng: 0 });
  });

  it('aplana un MultiPolygon (forma [[ring],[ring]] de Leaflet 2.0)', () => {
    const ringA = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 },
    ];
    const ringB = [
      { lat: 2, lng: 2 },
      { lat: 2, lng: 3 },
      { lat: 3, lng: 3 },
    ];
    const rings = collectLatLngRings([[ringA], [ringB]]);
    expect(rings).toHaveLength(2);
    expect(rings[0]).toEqual(ringA);
    expect(rings[1]).toEqual(ringB);
  });

  it('conserva los huecos de un Polygon con hueco ([exterior, hueco])', () => {
    const outer = [
      { lat: 0, lng: 0 },
      { lat: 10, lng: 0 },
      { lat: 10, lng: 10 },
    ];
    const hole = [
      { lat: 4, lng: 4 },
      { lat: 5, lng: 4 },
      { lat: 5, lng: 5 },
    ];
    const rings = collectLatLngRings([outer, hole]);
    expect(rings).toHaveLength(2);
    expect(rings[0]).toEqual(outer);
    expect(rings[1]).toEqual(hole);
  });

  it('desciende niveles extra de anidación sin perderse', () => {
    const ringA = [{ lat: 0, lng: 0 }];
    const ringHole = [{ lat: 1, lng: 1 }];
    const ringB = [{ lat: 2, lng: 2 }];
    const rings = collectLatLngRings([[ [ringA, ringHole] ], [ [ringB] ]]);
    expect(rings).toHaveLength(3);
    expect(rings[0]).toEqual(ringA);
    expect(rings[1]).toEqual(ringHole);
    expect(rings[2]).toEqual(ringB);
  });

  it('descarta rings degenerados (partes vacías o sin lat/lng) sin romper', () => {
    const good = [
      { lat: 9, lng: 9 },
      { lat: 9, lng: 10 },
    ];
    const rings = collectLatLngRings([[{}], [[good]]]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toEqual(good);
  });

  it('filtra elementos null/undefined dentro de un ring', () => {
    const rings = collectLatLngRings([
      [{ lat: 0, lng: 0 }, null, undefined, { lat: 1, lng: 1 }],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(2);
  });

  it('devuelve [] para entradas vacías o no-array', () => {
    expect(collectLatLngRings([])).toEqual([]);
    expect(collectLatLngRings(null)).toEqual([]);
    expect(collectLatLngRings(undefined)).toEqual([]);
    expect(collectLatLngRings({})).toEqual([]);
    expect(collectLatLngRings(42)).toEqual([]);
  });
});