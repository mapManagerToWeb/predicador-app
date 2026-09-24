import type { FeatureCollection, Polygon } from 'geojson';
import {
  hace,
  manzanasDelVisor,
  resumenTerritorios,
  zonasParcialesDelVisor,
  type EstadoTerritorioPublico,
  type PropsManzanaPublica,
} from './visor-estado';

const cuadro: Polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };

function geojson(): FeatureCollection<Polygon, PropsManzanaPublica> {
  const f = (id: string, mid: number, t: number, nombre: string) => ({
    type: 'Feature' as const,
    geometry: cuadro,
    properties: { id, mid, territorio_padre: t, nombre_bloque: nombre, color: null },
  });
  return {
    type: 'FeatureCollection',
    features: [f('12-12.a', 790, 12, '12.a'), f('12-12.b', 791, 12, '12.b'), f('12-12.c', 792, 12, '12.c'), f('13-13.a', 800, 13, '13.a'), f('14-14.a', 810, 14, '14.a')],
  };
}

function estado(p: Partial<EstadoTerritorioPublico>): EstadoTerritorioPublico {
  return {
    territorio: 12,
    ultimoTrabajo: '2026-09-20T15:00:00Z',
    ultimoCompletado: null,
    estado: 'incomplete',
    manzanasMarcadas: null,
    totalManzanas: null,
    manzanasIds: null,
    geometriaParcial: null,
    ...p,
  };
}

describe('visor de territorios', () => {
  it('marca como predicadas las manzanas del último reporte, con id "T-nombre" o numérico', () => {
    const fc = manzanasDelVisor(geojson(), [estado({ manzanasIds: '12-12.a, 791' })], { 12: '#ff0000' });
    const predicadas = fc.features.filter(f => f.properties.predicada).map(f => f.properties.nombre);
    expect(predicadas).toEqual(['12.a', '12.b']);
    expect(fc.features[0].properties.color).toBe('#ff0000');
    expect(fc.features[3].properties.color).toBe('#888888');
  });

  it('resume cada territorio: completado, en curso o sin registro', () => {
    const estados = [
      estado({ territorio: 12, manzanasIds: '12-12.a', ultimoCompletado: '2026-08-01T10:00:00Z' }),
      estado({ territorio: 13, estado: 'completed', manzanasIds: '13-13.a', ultimoCompletado: '2026-09-01T10:00:00Z' }),
    ];
    const resumen = resumenTerritorios(manzanasDelVisor(geojson(), estados, {}), estados);

    expect(resumen.get(12)).toMatchObject({ situacion: 'en-curso', manzanas: 3, predicadas: 1 });
    expect(resumen.get(12)?.ultimoCompletado).toEqual(new Date('2026-08-01T10:00:00Z'));
    expect(resumen.get(13)).toMatchObject({ situacion: 'completado', predicadas: 1 });
    expect(resumen.get(14)).toMatchObject({ situacion: 'sin-registro', ultimoTrabajo: null });
  });

  it('las zonas parciales se leen del último reporte y se ignoran las ilegibles', () => {
    const zonas = zonasParcialesDelVisor(
      [
        estado({ territorio: 12, geometriaParcial: JSON.stringify(cuadro) }),
        estado({ territorio: 13, geometriaParcial: 'no es json' }),
        estado({ territorio: 14, geometriaParcial: JSON.stringify({ type: 'Point', coordinates: [0, 0] }) }),
      ],
      { 12: '#00ff00' },
    );
    expect(zonas.features).toHaveLength(1);
    expect(zonas.features[0].properties).toEqual({ territorio: 12, color: '#00ff00' });
  });

  it('hace', () => {
    const ahora = new Date(2026, 8, 24, 12);
    expect(hace(new Date(2026, 8, 24, 8), ahora)).toBe('hoy');
    expect(hace(new Date(2026, 8, 23, 20), ahora)).toBe('ayer');
    expect(hace(new Date(2026, 8, 14), ahora)).toBe('hace 10 días');
    expect(hace(new Date(2026, 4, 24), ahora)).toBe('hace 4 meses');
  });
});
