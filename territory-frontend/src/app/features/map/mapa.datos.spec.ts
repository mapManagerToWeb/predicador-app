import { beforeEach, describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { guardarCopia, indexarManzanas, leerCopia, type DatosMapa } from './mapa.datos';
import { TERRITORY_COLORS } from './utils/territory-colors';

const cuadrado = (x: number, y: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + 0.001, y], [x + 0.001, y + 0.001], [x, y + 0.001], [x, y]]],
});

function conFeatures(features: unknown[], colores: Record<number, string> = {}): DatosMapa {
  return {
    geojson: JSON.stringify({ type: 'FeatureCollection', features }),
    colores,
    estados: [],
  };
}

const manzana = (id: string, territorio: number, color: string | null = null) => ({
  type: 'Feature',
  geometry: cuadrado(-73.34, -37.5),
  properties: { id, mid: 1, nombre_bloque: id, territorio_padre: territorio, color },
});

describe('indexarManzanas', () => {
  it('indexa por id y por territorio, y mantiene el color que manda el servidor', () => {
    const { porId, porTerritorio, colores } = indexarManzanas(
      conFeatures([manzana('5-5.a', 5, '#123456'), manzana('5-5.b', 5), manzana('6-6.a', 6)], { 5: '#abcdef' }),
    );

    expect([...porId.keys()]).toEqual(['5-5.a', '5-5.b', '6-6.a']);
    expect(porTerritorio.get(5)?.map(m => m.id)).toEqual(['5-5.a', '5-5.b']);
    expect(porTerritorio.get(6)?.map(m => m.id)).toEqual(['6-6.a']);
    expect(colores[5]).toBe('#abcdef');
    expect(porId.get('5-5.a')?.territorio).toBe(5);
  });

  it('usa el color del territorio cuando la manzana no trae uno válido', () => {
    const { colores } = indexarManzanas(conFeatures([manzana('5-5.a', 5, null)]));

    expect(colores[5]).toBe(TERRITORY_COLORS[4]);
  });

  it('descarta features sin geometría o sin territorio padre', () => {
    const sinGeometria = { type: 'Feature', geometry: null, properties: { id: 'x', nombre_bloque: 'x', territorio_padre: 5 } };
    const sinPadre = { type: 'Feature', geometry: cuadrado(0, 0), properties: { id: 'y', nombre_bloque: 'y' } };

    const { porId } = indexarManzanas(conFeatures([sinGeometria, sinPadre, manzana('5-5.a', 5)]));

    expect([...porId.keys()]).toEqual(['5-5.a']);
  });
});

describe('copia local de los datos', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('guarda y vuelve a leer la misma copia', () => {
    const datos = conFeatures([manzana('5-5.a', 5)], { 5: '#abcdef' });

    guardarCopia(datos);

    expect(leerCopia()).toEqual(datos);
  });

  it('devuelve null si no hay copia guardada', () => {
    expect(leerCopia()).toBeNull();
  });

  it('devuelve null si la copia guardada está rota', () => {
    localStorage.setItem('mapa.datos.v1', '{esto no es json');

    expect(leerCopia()).toBeNull();
  });
});
