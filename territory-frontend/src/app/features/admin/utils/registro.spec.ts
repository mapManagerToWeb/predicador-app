import type { EstadoTerritorioAdmin, ManzanaFeature } from '../admin.models';
import { clave, vaciar } from './correccion';
import {
  alternarCalle,
  alternarEntera,
  aporte,
  baseDeRegistro,
  callesDe,
  hermanoEscrito,
  ladosDe,
  pedidoRegistro,
  resultado,
  todoElTerritorio,
} from './registro';

/** Manzana cuadrada de ~100 m en Curanilahue (4 calles). */
function manzana(nombre: string, x: number): ManzanaFeature {
  const d = 0.001;
  return {
    type: 'Feature',
    id: x,
    properties: { id: x, territorio: 72, nombre } as ManzanaFeature['properties'],
    geometry: {
      type: 'Polygon',
      coordinates: [[[-73.34 + x * 0.002, -37.47], [-73.34 + x * 0.002 + d, -37.47], [-73.34 + x * 0.002 + d, -37.47 + d], [-73.34 + x * 0.002, -37.47 + d], [-73.34 + x * 0.002, -37.47]]],
    },
  } as ManzanaFeature;
}

const A = manzana('72.a', 0);
const B = manzana('72.b', 1);
const C = manzana('72.c', 2);
const MANZANAS = [A, B, C];

function estado(e: Partial<EstadoTerritorioAdmin>): EstadoTerritorioAdmin {
  return {
    territorio: 72, fecha: '2026-10-01T12:00:00Z', estado: 'incomplete', origen: 'salida', encargado: 'Ana',
    manzanasIds: '', geometriaParcial: null, puntosParciales: null, totalManzanas: 3, ...e,
  };
}

describe('registrar una salida desde el panel', () => {
  it('parte del estado actual; si estaba completo o reiniciado, de cero', () => {
    expect([...baseDeRegistro(estado({ manzanasIds: '72-72.a' }), MANZANAS).marcadas]).toEqual(['72-72.a']);
    expect(baseDeRegistro(estado({ estado: 'completed', manzanasIds: '72-72.a,72-72.b,72-72.c' }), MANZANAS).marcadas.size).toBe(0);
    expect(baseDeRegistro(estado({ estado: 'reiniciado' }), MANZANAS).marcadas.size).toBe(0);
    expect(baseDeRegistro(null, MANZANAS).marcadas.size).toBe(0);
  });

  it('al servidor va solo lo nuevo, y lo de antes no se puede desmarcar', () => {
    const base = baseDeRegistro(estado({ manzanasIds: '72-72.a' }), MANZANAS);
    let e = alternarEntera(base, base, A);
    expect(e.marcadas.has(clave(A))).toBe(true);
    e = alternarEntera(base, e, B);

    expect(aporte(base, e).enteras).toEqual(['72-72.b']);
    expect(resultado(e, 3)).toEqual({ enteras: 2, porCalles: 0, completo: false });
    e = alternarEntera(base, e, B);
    expect(aporte(base, e).enteras).toEqual([]);
  });

  it('«todo el territorio» lo deja completo', () => {
    const base = baseDeRegistro(estado({ manzanasIds: '72-72.a' }), MANZANAS);
    const e = todoElTerritorio(MANZANAS);

    expect(aporte(base, e).enteras).toEqual(['72-72.b', '72-72.c']);
    expect(resultado(e, 3).completo).toBe(true);
  });

  it('por calles: una calle hace una franja; todas, la manzana entera; sin ninguna, vuelve a como estaba', () => {
    const base = vaciar();
    const lados = ladosDe(B);
    expect(lados.length).toBe(4);

    let e = alternarCalle(base, base, B, lados, 0);
    expect(e.zonas).toHaveLength(1);
    expect(e.zonas[0]).toMatchObject({ manzanaId: '72-72.b', lados: [0], totalLados: 4 });
    expect(callesDe(base, e, B, 4).elegidas).toEqual([0]);

    for (const i of [1, 2, 3]) e = alternarCalle(base, e, B, lados, i);
    expect(e.zonas).toHaveLength(0);
    expect(e.marcadas.has('72-72.b')).toBe(true);

    e = alternarCalle(base, e, B, lados, 3);
    expect(e.marcadas.has('72-72.b')).toBe(false);
    expect(e.zonas[0]?.lados).toEqual([0, 1, 2]);
    for (const i of [0, 1, 2]) e = alternarCalle(base, e, B, lados, i);
    expect(e.zonas).toHaveLength(0);
    expect(e.marcadas.size).toBe(0);
  });

  it('las calles que ya estaban quedan siempre y no se mandan de nuevo', () => {
    const lados = ladosDe(B);
    const conUna = alternarCalle(vaciar(), vaciar(), B, lados, 0);
    const base = conUna;

    expect(alternarCalle(base, base, B, lados, 0)).toBe(base);
    const e = alternarCalle(base, base, B, lados, 2);
    expect(callesDe(base, e, B, 4)).toEqual({ elegidas: [0, 2], deLaBase: [0] });
    expect(aporte(base, e).zonas[0]?.lados).toEqual([0, 2]);
    expect(aporte(base, base).zonas).toEqual([]);
  });

  it('una manzana ya completa no se edita por calles', () => {
    const base = baseDeRegistro(estado({ manzanasIds: '72-72.b' }), MANZANAS);
    expect(alternarCalle(base, base, B, ladosDe(B), 1)).toBe(base);
  });

  it('el pedido lleva el hermano, el día, el turno y solo lo nuevo', () => {
    const base = baseDeRegistro(estado({ manzanasIds: '72-72.a' }), MANZANAS);
    let e = alternarEntera(base, base, C);
    e = alternarCalle(base, e, B, ladosDe(B), 1);

    const pedido = pedidoRegistro(72, hermanoEscrito('  Pedro   Soto Díaz '), '2026-11-07', 'mañana', base, e, 3, ' por WhatsApp ');

    expect(pedido).toMatchObject({
      territorio: 72,
      encargadoId: null,
      encargadoNombre: 'Pedro',
      encargadoApellido: 'Soto Díaz',
      fechaPredicacion: '2026-11-07',
      turno: 'mañana',
      manzanasIds: '72-72.c',
      totalManzanas: 3,
      nota: 'por WhatsApp',
    });
    expect(JSON.parse(pedido.puntosParciales!).zonas[0]).toMatchObject({ m: '72-72.b', l: [1], t: 4 });
    expect(pedido.geometriaParcial).toContain('Polygon');
  });

  it('sin calles nuevas no manda geometría', () => {
    const base = vaciar();
    const pedido = pedidoRegistro(72, { id: 7, nombre: 'Ana', apellido: 'Pérez' }, '2026-11-07', 'tarde', base, alternarEntera(base, base, A), 3, '');
    expect(pedido.geometriaParcial).toBeNull();
    expect(pedido.puntosParciales).toBeNull();
    expect(pedido.encargadoId).toBe(7);
    expect(pedido.nota).toBeNull();
  });
});
