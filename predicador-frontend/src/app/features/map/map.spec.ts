import { describe, it, expect } from 'vitest';
import { elegirUltimoReporte } from './map';
import type { Reporte } from '../../core/models/models';

describe('elegirUltimoReporte', () => {
  it('should choose the most recent report by session time', () => {
    const reportes: Reporte[] = [
      {
        id: 1,
        manzanaId: null,
        fecha: '2024-01-01',
        encargadoId: 1,
        encargadoNombre: 'Ana',
        encargadoApellido: 'Pérez',
        sessionTime: '2024-01-01T10:00:00.000Z',
        estado: 'incomplete',
        territorioNumero: 1,
        totalManzanas: 10,
        manzanasMarcadas: 2,
        tipoSesion: 'parcial',
        geometriaParcial: null,
        puntosParciales: null,
        manzanasIds: null
      },
      {
        id: 2,
        manzanaId: null,
        fecha: '2024-01-02',
        encargadoId: 1,
        encargadoNombre: 'Ana',
        encargadoApellido: 'Pérez',
        sessionTime: '2024-01-02T12:00:00.000Z',
        estado: 'completed',
        territorioNumero: 1,
        totalManzanas: 10,
        manzanasMarcadas: 10,
        tipoSesion: 'completa',
        geometriaParcial: null,
        puntosParciales: null,
        manzanasIds: '1,2,3'
      }
    ];

    const ultimo = elegirUltimoReporte(reportes);

    expect(ultimo?.id).toBe(2);
    expect(ultimo?.manzanasIds).toBe('1,2,3');
  });

  it('should return null when report list is empty', () => {
    expect(elegirUltimoReporte([])).toBeNull();
  });
});
