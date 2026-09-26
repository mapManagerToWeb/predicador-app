import type { Polygon } from 'geojson';
import { leerBorrador, serializarBorrador, type Borrador } from './borrador';
import { guardarLados, type Manzana } from './salida';

const cuadrado: Polygon = {
  type: 'Polygon',
  coordinates: [[[-73.34, -37.5], [-73.339, -37.5], [-73.339, -37.499], [-73.34, -37.499], [-73.34, -37.5]]],
};
const B: Manzana = { id: '5-5.b', nombre: '5.b', territorio: 5, geometria: cuadrado };

describe('borrador', () => {
  it('ida y vuelta conserva marcas, zonas por calles y la base', () => {
    const t = guardarLados(
      { numero: 5, marcadas: ['5-5.a'], zonas: [], base: { marcadas: ['5-5.a'], zonas: [], fecha: '2026-09-20T12:00:00Z', vueltaNueva: false } },
      B,
      [0],
      4,
    );
    const b: Borrador = { abiertos: [5], territorios: [t], predicacion: 'mañana', inicioSesion: '2026-09-26T10:00:00Z' };
    const leido = leerBorrador(JSON.parse(JSON.stringify(serializarBorrador(b))));
    expect(leido).not.toBeNull();
    expect(leido!.abiertos).toEqual([5]);
    expect(leido!.predicacion).toBe('mañana');
    expect(leido!.inicioSesion).toBe('2026-09-26T10:00:00Z');
    expect(leido!.territorios[0]).toMatchObject({ numero: 5, marcadas: ['5-5.a'], base: { marcadas: ['5-5.a'], fecha: '2026-09-20T12:00:00Z' } });
    expect(leido!.territorios[0].zonas[0]).toMatchObject({ manzanaId: '5-5.b', lados: [0] });
  });

  it('convierte el borrador del mapa anterior sin perder las marcas', () => {
    const viejo = {
      manzanasById: {
        '5-5.a': { id: '5-5.a', nombreBloque: '5.a', color: '#f00', territorioNumero: 5 },
        'parcial-1': { id: 'parcial-1', nombreBloque: 'Parcial: 5.b', color: '#f00', territorioNumero: 5 },
        '9-9.a': { id: '9-9.a', nombreBloque: '9.a', color: '#0f0', territorioNumero: 9 },
      },
      territoriosSeleccionados: [5],
      territorioSeleccionado: 5,
      datosParcialesGuardados: { 5: { puntos: [], geometria: JSON.stringify(cuadrado) } },
      modoMarcado: 'completa',
      predicacion: 'tarde',
      savedAt: 1,
    };
    const b = leerBorrador(viejo)!;
    expect(b.abiertos).toEqual([5]);
    expect(b.territorios).toHaveLength(1);
    expect(b.territorios[0]).toMatchObject({ numero: 5, marcadas: ['5-5.a'], base: null });
    expect(b.territorios[0].zonas).toHaveLength(1);
  });

  it('ignora borradores rotos', () => {
    expect(leerBorrador(null)).toBeNull();
    expect(leerBorrador({ v: 2, abiertos: 'x' })).toBeNull();
    expect(leerBorrador({ manzanasById: {}, territoriosSeleccionados: [] })).toBeNull();
  });
});
