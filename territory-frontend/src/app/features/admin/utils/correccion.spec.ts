import type { EstadoTerritorioAdmin, ManzanaFeature, SalidaAdmin } from '../admin.models';
import { serializarZonas } from '../../map/utils/lados';
import {
  alternar,
  alternarEnSalida,
  aporteDeSalida,
  baseDeSalida,
  estadoDeSalida,
  estadoDesde,
  iguales,
  pedido,
  pedidoSalida,
  quitarZona,
  quitarZonaEnSalida,
  situacion,
  vaciar,
  zonasDeLaBase,
} from './correccion';

const manzana = (id: number, nombre: string): ManzanaFeature => ({
  type: 'Feature',
  id,
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  properties: { id, territorio: 7, nombre, areaM2: 100, valida: true },
});
const [A, B, C] = [manzana(41, '7.a'), manzana(42, '7.b'), manzana(43, '7.c')];
const cuadro = { type: 'Polygon' as const, coordinates: [[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0]]] };

function estado(p: Partial<EstadoTerritorioAdmin>): EstadoTerritorioAdmin {
  return {
    territorio: 7, fecha: '2026-09-01T10:00:00Z', estado: 'incomplete', origen: 'salida', encargado: 'Ana',
    manzanasIds: null, geometriaParcial: null, puntosParciales: null, totalManzanas: 3, ...p,
  };
}

describe('corrección de un territorio', () => {
  it('lee ids "T-nombre" y numéricos, y las zonas por calles', () => {
    const zonas = serializarZonas([{ manzanaId: '7-7.c', manzanaNombre: '7.c', lados: [1], geometria: cuadro }]);
    const e = estadoDesde(estado({ manzanasIds: '7-7.a,42', ...{ geometriaParcial: zonas.geometriaParcial, puntosParciales: zonas.puntosParciales } }), [A, B, C]);
    expect([...e.marcadas].sort()).toEqual(['7-7.a', '7-7.b']);
    expect(situacion(e, C)).toBe('calles');
  });

  it('un territorio reiniciado o sin reportes empieza vacío', () => {
    expect(estadoDesde(estado({ estado: 'reiniciado', manzanasIds: '7-7.a' }), [A]).marcadas.size).toBe(0);
    expect(estadoDesde(null, [A]).marcadas.size).toBe(0);
  });

  it('clic: desmarca la entera, quita las calles o marca la que no tenía nada', () => {
    const zonas = serializarZonas([{ manzanaId: '7-7.c', manzanaNombre: '7.c', lados: [1], geometria: cuadro }]);
    const e0 = estadoDesde(estado({ manzanasIds: '7-7.a', ...zonas }), [A, B, C]);
    expect(situacion(alternar(e0, A), A)).toBe('nada');
    expect(situacion(alternar(e0, C), C)).toBe('nada');
    expect(situacion(alternar(e0, B), B)).toBe('entera');
    expect(iguales(e0, alternar(alternar(e0, A), A))).toBe(true);
  });

  it('arma el pedido con el mismo formato que el mapa', () => {
    const antigua = { manzanaId: null, manzanaNombre: 'Zona parcial', lados: [], geometria: cuadro };
    const e = { marcadas: new Set(['7-7.b', '7-7.a']), zonas: [antigua] };
    expect(pedido(e, 7, 3, '  7.c marcada por error ')).toMatchObject({
      territorio: 7, manzanasIds: '7-7.a,7-7.b', totalManzanas: 3, manzanasMarcadas: 3, nota: '7.c marcada por error',
    });
    expect(pedido(quitarZona(e, 0), 7, 3, '').geometriaParcial).toBeNull();
    expect(pedido(vaciar(), 7, 3, '')).toMatchObject({ manzanasIds: '', manzanasMarcadas: 0, nota: null });
  });
});

describe('corrección del reporte de una salida (ADR 0014)', () => {
  const zonaC = (lados: number[]) =>
    serializarZonas([{ manzanaId: '7-7.c', manzanaNombre: '7.c', lados, geometria: cuadro }]);

  function salida(p: Partial<SalidaAdmin>): SalidaAdmin {
    return {
      id: 9, fecha: '2026-09-02T10:00:00Z', encargado: 'Luis P', territorio: 7, origen: 'salida', estado: 'incomplete',
      manzanasIds: null, geometriaParcial: null, puntosParciales: null, totalManzanas: 3, anuladoEn: null,
      anterior: null, posteriores: 0, ...p,
    };
  }

  it('lo que había antes queda fijo; lo que marcó la salida se puede quitar', () => {
    // Antes: 7.a entera y la calle 0 de 7.c. La salida agregó 7.b y la calle 1 de 7.c.
    const antes = zonaC([0]);
    const despues = zonaC([0, 1]);
    const s = salida({
      manzanasIds: '7-7.a,7-7.b', ...despues,
      anterior: { estado: 'incomplete', manzanasIds: '7-7.a', ...antes },
    });
    const base = baseDeSalida(s, [A, B, C]);
    const e = estadoDeSalida(s, [A, B, C]);
    expect(aporteDeSalida(base, e)).toEqual({ enteras: 1, porCalles: 1 });

    expect(alternarEnSalida(base, e, A)).toBe(e);
    const sinB = alternarEnSalida(base, e, B);
    expect(situacion(sinB, B)).toBe('nada');
    const sinCalle = quitarZonaEnSalida(base, sinB, 0);
    expect(sinCalle.zonas[0].lados).toEqual([0]);
    expect(zonasDeLaBase(base, sinCalle)).toEqual(new Set([0]));
    expect(aporteDeSalida(base, sinCalle)).toEqual({ enteras: 0, porCalles: 0 });
    // La franja que ya estaba no se quita.
    expect(quitarZonaEnSalida(base, sinCalle, 0)).toBe(sinCalle);
  });

  it('después de un territorio completo o reiniciado la salida empezó de cero', () => {
    for (const estadoAnterior of ['completed', 'reiniciado']) {
      const s = salida({ manzanasIds: '7-7.a', anterior: { estado: estadoAnterior, manzanasIds: '7-7.a,7-7.b,7-7.c', geometriaParcial: null, puntosParciales: null } });
      expect(baseDeSalida(s, [A, B, C]).marcadas.size).toBe(0);
    }
  });

  it('el pedido lleva el estado corregido, o nada si se anula', () => {
    const e = { marcadas: new Set(['7-7.b', '7-7.a']), zonas: [] };
    expect(pedidoSalida(e, false, ' error ')).toEqual({
      anular: false, manzanasIds: '7-7.a,7-7.b', geometriaParcial: null, puntosParciales: null, nota: 'error',
    });
    expect(pedidoSalida(e, true, '')).toEqual({ anular: true, manzanasIds: null, geometriaParcial: null, puntosParciales: null, nota: null });
  });
});
