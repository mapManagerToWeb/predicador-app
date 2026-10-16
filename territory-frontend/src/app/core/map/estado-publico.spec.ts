import { conSituacion } from './base-map';
import { situacionDe, type EstadoTerritorioPublico } from './estado-publico';

const estado = (e: Partial<EstadoTerritorioPublico>): EstadoTerritorioPublico => ({
  territorio: 5,
  ultimoTrabajo: '2026-10-10T12:00:00Z',
  ultimoCompletado: null,
  estado: 'incomplete',
  manzanasMarcadas: 1,
  totalManzanas: 4,
  manzanasIds: '5-5.a',
  geometriaParcial: null,
  ...e,
});

describe('situación de un territorio (color del cuadrito)', () => {
  it('completado, empezado o sin trabajar según su último reporte', () => {
    expect(situacionDe(estado({ estado: 'completed' }))).toBe('completado');
    expect(situacionDe(estado({ estado: 'incomplete' }))).toBe('en-curso');
    expect(situacionDe(undefined)).toBe('sin-registro');
    expect(situacionDe(estado({ ultimoTrabajo: null }))).toBe('sin-registro');
  });

  it('tras cerrar el ciclo vuelve a quedar sin trabajar', () => {
    expect(situacionDe(estado({ estado: 'reiniciado', ultimoCompletado: '2026-09-01T12:00:00Z' }))).toBe('sin-registro');
  });

  it('conSituacion agrega la situación a cada etiqueta sin perder sus datos', () => {
    const etiquetas = {
      type: 'FeatureCollection' as const,
      features: [5, 6].map(t => ({
        type: 'Feature' as const,
        properties: { territorio: t, etiqueta: String(t) },
        geometry: { type: 'Point' as const, coordinates: [0, 0] },
      })),
    };

    const con = conSituacion(etiquetas, t => (t === 5 ? 'completado' : 'sin-registro'));

    expect(con.features.map(f => f.properties)).toEqual([
      { territorio: 5, etiqueta: '5', situacion: 'completado' },
      { territorio: 6, etiqueta: '6', situacion: 'sin-registro' },
    ]);
  });
});
