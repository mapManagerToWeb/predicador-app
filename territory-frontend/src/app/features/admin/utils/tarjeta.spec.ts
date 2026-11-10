import type { EstadoTerritorioAdmin, ManzanaFeature } from '../admin.models';
import { documentoParaImprimir, leerTerritorios, tarjetaDe } from './tarjeta';

const manzana = (id: number, nombre: string): ManzanaFeature => ({
  type: 'Feature',
  id,
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  properties: { id, territorio: 7, nombre, areaM2: 100, valida: true },
});
const MANZANAS = [manzana(3, '7.c'), manzana(1, '7.a'), manzana(2, '7.b'), manzana(10, '7.10'), manzana(4, '7.2')];

function estado(p: Partial<EstadoTerritorioAdmin>): EstadoTerritorioAdmin {
  return {
    territorio: 7, fecha: '2026-11-01T10:00:00Z', estado: 'incomplete', origen: 'salida', encargado: 'Ana',
    manzanasIds: null, geometriaParcial: null, puntosParciales: null, totalManzanas: 5, ...p,
  };
}

describe('tarjetas de territorio', () => {
  it('lee números, comas y rangos; solo los que existen, sin repetir', () => {
    const hay = [1, 2, 3, 61, 72, 85, 86, 87, 90];
    expect(leerTerritorios('72, 61 85-87', hay)).toEqual([72, 61, 85, 86, 87]);
    expect(leerTerritorios('87-85; 72 72', hay)).toEqual([85, 86, 87, 72]);
    expect(leerTerritorios('999, abc, 4', hay)).toEqual([]);
    expect(leerTerritorios('', hay)).toEqual([]);
  });

  it('marca lo predicado en esta vuelta y ordena las manzanas como se leen', () => {
    const t = tarjetaDe(7, MANZANAS, estado({ manzanasIds: '7-7.a,7-7.c' }), '#f00');
    expect(t.filas.map(f => f.nombre)).toEqual(['7.2', '7.10', '7.a', '7.b', '7.c']);
    expect(t.filas.filter(f => f.situacion === 'entera').map(f => f.nombre)).toEqual(['7.a', '7.c']);
    expect(t.predicadas).toBe(2);
    expect(t.completo).toBe(false);
  });

  it('si estaba completo, la tarjeta es para la vuelta nueva (nada marcado)', () => {
    const t = tarjetaDe(7, MANZANAS, estado({ estado: 'completed', manzanasIds: '7-7.a,7-7.b,7-7.c,7-7.10,7-7.2' }), '#f00');
    expect(t.predicadas).toBe(0);
    expect(t.completo).toBe(true);
    expect(t.marcado.marcadas.size).toBe(0);
    expect(tarjetaDe(7, MANZANAS, null, '#f00').predicadas).toBe(0);
  });

  it('el documento lleva una hoja por territorio, con su mapa y sin HTML inyectado', () => {
    const a = tarjetaDe(7, [manzana(1, '<b>7.a</b>')], estado({ manzanasIds: '' }), '#f00');
    const b = tarjetaDe(8, MANZANAS, null, '#00f');
    const html = documentoParaImprimir([a, b], new Map([[7, 'QUJD'], [8, null]]), '09-11-2026');
    expect(html.match(/class="hoja"/g)).toHaveLength(2);
    expect(html).toContain('data:image/jpeg;base64,QUJD');
    expect(html).toContain('(sin mapa)');
    expect(html).toContain('&lt;b&gt;7.a&lt;/b&gt;');
    expect(html).not.toContain('<b>7.a</b>');
    expect(html).toContain('Territorio 8');
  });
});
