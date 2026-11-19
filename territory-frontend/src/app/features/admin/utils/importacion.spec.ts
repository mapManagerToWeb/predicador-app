import type { ManzanaFeature } from '../admin.models';
import { manzanasDeclaradas, manzanasRepetidas } from './importacion';

function existente(id: number, territorio: number, nombre: string): ManzanaFeature {
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Polygon', coordinates: [] },
    properties: { id, territorio, nombre, areaM2: 1, valida: true },
  } as ManzanaFeature;
}

describe('importación de manzanas', () => {
  it('lee territorio y nombre de un FeatureCollection, con sus alias', () => {
    const texto = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { territorio: 5, nombre: '5.a' }, geometry: { type: 'Polygon', coordinates: [] } },
        { type: 'Feature', properties: { territorio_padre: '6', nombre_bloque: '6.b' }, geometry: { type: 'Polygon', coordinates: [] } },
        { type: 'Feature', properties: { territorio: 7 }, geometry: { type: 'Polygon', coordinates: [] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } },
      ],
    });

    expect(manzanasDeclaradas(texto)).toEqual([
      { territorio: 5, nombre: '5.a' },
      { territorio: 6, nombre: '6.b' },
    ]);
  });

  it('devuelve una lista vacía si el texto no es un FeatureCollection legible', () => {
    expect(manzanasDeclaradas('no es json')).toEqual([]);
    expect(manzanasDeclaradas('{}')).toEqual([]);
    expect(manzanasDeclaradas('{"features": "no"}')).toEqual([]);
  });

  it('encuentra las manzanas que ya están en el mapa con su id, sin importar mayúsculas ni espacios', () => {
    const existentes = [existente(11, 5, '5.a'), existente(12, 5, '5.B'), existente(13, 6, '6.a')];
    const repetidas = manzanasRepetidas(
      [
        { territorio: 5, nombre: '5.A ' },
        { territorio: 5, nombre: '5.c' },
        { territorio: 7, nombre: '5.b' },
        { territorio: 6, nombre: '6.a' },
      ],
      existentes,
    );

    expect(repetidas).toEqual([
      { id: 11, territorio: 5, nombre: '5.A' },
      { id: 13, territorio: 6, nombre: '6.a' },
    ]);
  });

  it('no repite en la lista una manzana que viene dos veces en el archivo', () => {
    const repetidas = manzanasRepetidas(
      [
        { territorio: 5, nombre: '5.a' },
        { territorio: 5, nombre: '5.a' },
      ],
      [existente(11, 5, '5.a')],
    );

    expect(repetidas).toHaveLength(1);
  });

  it('no marca nada cuando todo es nuevo', () => {
    expect(manzanasRepetidas([{ territorio: 9, nombre: '9.a' }], [existente(11, 5, '5.a')])).toEqual([]);
    expect(manzanasRepetidas([{ territorio: 9, nombre: '9.a' }], [])).toEqual([]);
  });
});
