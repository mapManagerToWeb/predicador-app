import { describe, it, expect } from 'vitest';
import { ManzanaSpatialIndex } from './manzana-spatial-index';
import type { ManzanaIndex } from '../types/map.types';

function fakeManzana(
  id: string,
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number }
): ManzanaIndex {
  return {
    id,
    nombreBloque: `Bloque-${id}`,
    color: '#ff0000',
    territorioNumero: 5,
    bbox,
    polygon: {} as ManzanaIndex['polygon'],
  };
}

describe('ManzanaSpatialIndex', () => {
  it('returns the manzana whose bbox covers the query cell', () => {
    const index = new ManzanaSpatialIndex();
    // bbox pequeño tipo manzana real: con cellSize 0.002° la inserción toca
    // pocas celdas (un bbox de varios grados insertaría millones de celdas y
    // hacía los tests lentos/flaky bajo carga paralela).
    const mc = fakeManzana('m1', { minLat: 0, maxLat: 0.001, minLng: 0, maxLng: 0.001 });
    index.insert(mc);

    expect(index.queryAt({ lat: 0.0005, lng: 0.0005 })).toEqual([mc]);
  });

  it('returns [] for an empty cell', () => {
    const index = new ManzanaSpatialIndex();
    index.insert(fakeManzana('m1', { minLat: 0, maxLat: 0.001, minLng: 0, maxLng: 0.001 }));

    expect(index.queryAt({ lat: 50, lng: 50 })).toEqual([]);
  });

  it('ignores insert/remove of a manzana with non-finite bbox (degenerate geometry)', () => {
    const index = new ManzanaSpatialIndex();
    const degenerate = fakeManzana('deg', {
      minLat: Infinity,
      maxLat: -Infinity,
      minLng: Infinity,
      maxLng: -Infinity,
    });
    // Antes del guard, cellRange(Infinity) → bucle por celdas eterno (hang).
    index.insert(degenerate);
    index.remove(degenerate);

    expect(index.queryAt({ lat: 0.0005, lng: 0.0005 })).toEqual([]);
  });

  it('indexes a manzana in every cell its bbox touches', () => {
    const index = new ManzanaSpatialIndex();
    const mc = fakeManzana('m1', { minLat: 0, maxLat: 0.003, minLng: 0, maxLng: 0.003 });
    index.insert(mc);

    // bbox [0, 0.003] con cellSize 0.002 toca las celdas (0,0), (0,1), (1,0), (1,1)
    expect(index.queryAt({ lat: 0.001, lng: 0.001 })).toEqual([mc]);
    expect(index.queryAt({ lat: 0.0025, lng: 0.0025 })).toEqual([mc]);
    // celda (2,2) queda fuera del bbox
    expect(index.queryAt({ lat: 0.004, lng: 0.004 })).toEqual([]);
  });

  it('queryNear returns manzanas from neighbor cells without duplicates', () => {
    const index = new ManzanaSpatialIndex();
    const big = fakeManzana('big', { minLat: 0, maxLat: 0.003, minLng: 0, maxLng: 0.003 });
    const far = fakeManzana('far', { minLat: 0.004, maxLat: 0.005, minLng: 0.004, maxLng: 0.005 });
    index.insert(big);
    index.insert(far);

    // Punto en celda (0,0); big cubre varias celdas del vecindario 3x3, far queda en (2,2)
    const result = index.queryNear({ lat: 0.001, lng: 0.001 });
    expect(result).toContain(big);
    expect(result).not.toContain(far);
    // big aparece una sola vez aunque esté indexado en varias celdas del vecindario
    expect(result.filter((m) => m === big)).toHaveLength(1);
  });

  it('queryNear with radius 2 reaches farther cells', () => {
    const index = new ManzanaSpatialIndex();
    const far = fakeManzana('far', { minLat: 0.004, maxLat: 0.005, minLng: 0.004, maxLng: 0.005 });
    index.insert(far);

    expect(index.queryNear({ lat: 0.001, lng: 0.001 }, 2)).toContain(far);
  });

  it('remove drops the manzana from every cell it touched', () => {
    const index = new ManzanaSpatialIndex();
    const mc = fakeManzana('m1', { minLat: 0, maxLat: 0.003, minLng: 0, maxLng: 0.003 });
    index.insert(mc);
    index.remove(mc);

    expect(index.queryAt({ lat: 0.001, lng: 0.001 })).toEqual([]);
    expect(index.queryAt({ lat: 0.0025, lng: 0.0025 })).toEqual([]);
  });

  it('remove only drops the given manzana, keeping others in the same cell', () => {
    const index = new ManzanaSpatialIndex();
    const a = fakeManzana('a', { minLat: 0, maxLat: 0.001, minLng: 0, maxLng: 0.001 });
    const b = fakeManzana('b', { minLat: 0, maxLat: 0.001, minLng: 0, maxLng: 0.001 });
    index.insert(a);
    index.insert(b);
    index.remove(a);

    expect(index.queryAt({ lat: 0.0005, lng: 0.0005 })).toEqual([b]);
  });

  it('clear empties the grid', () => {
    const index = new ManzanaSpatialIndex();
    index.insert(fakeManzana('m1', { minLat: 0, maxLat: 0.001, minLng: 0, maxLng: 0.001 }));
    index.clear();

    expect(index.queryAt({ lat: 0.0005, lng: 0.0005 })).toEqual([]);
  });
});