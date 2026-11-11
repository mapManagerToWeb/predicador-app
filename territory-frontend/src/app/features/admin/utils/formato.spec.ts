import { describe, expect, it } from 'vitest';
import { fmtDiaMes, fmtFecha, fmtFechaHora, fmtMesAnio, fmtNumero, fmtRelativo, fmtTelefono } from './formato';

describe('formato de fechas', () => {
  it('fmtFecha acepta texto, Date y devuelve el marcador vacío', () => {
    expect(fmtFecha('2026-11-10T12:00:00')).toBe('10-11-2026');
    expect(fmtFecha(new Date(2026, 10, 10))).toBe('10-11-2026');
    expect(fmtFecha(null)).toBe('—');
    expect(fmtFecha(undefined)).toBe('—');
    expect(fmtFecha('')).toBe('—');
    expect(fmtFecha('no es una fecha')).toBe('—');
    expect(fmtFecha(null, 'sin dato')).toBe('sin dato');
  });

  it('fmtFechaHora incluye la hora y respeta el marcador vacío', () => {
    const salida = fmtFechaHora(new Date(2026, 10, 10, 14, 30));
    expect(salida).toContain('10-11-2026');
    expect(salida).toContain('30');
    expect(fmtFechaHora(null)).toBe('—');
    expect(fmtFechaHora('2026-13-45')).toBe('—');
  });

  it('fmtDiaMes abrevia el mes y omite el punto', () => {
    const salida = fmtDiaMes(new Date(2026, 10, 10));
    expect(salida).toContain('10');
    expect(salida).toContain('nov');
    expect(salida).not.toContain('.');
    expect(fmtDiaMes(null)).toBe('');
  });

  it('fmtMesAnio abrevia el mes con el año', () => {
    const salida = fmtMesAnio(new Date(2026, 10, 10));
    expect(salida).toContain('nov');
    expect(salida).toContain('2026');
    expect(fmtMesAnio(undefined)).toBe('');
  });
});

describe('fmtNumero', () => {
  it('formatea números y cae al marcador en vacíos', () => {
    expect(fmtNumero(1234)).toBe('1.234');
    expect(fmtNumero(0)).toBe('0');
    expect(fmtNumero(null)).toBe('—');
    expect(fmtNumero(undefined)).toBe('—');
    expect(fmtNumero(Number.NaN)).toBe('—');
    expect(fmtNumero(null, 'n/d')).toBe('n/d');
  });
});

describe('fmtRelativo', () => {
  const ahora = new Date(2026, 10, 10, 12, 0);

  it('cubre los tramos de hoy, ayer, días, meses y años', () => {
    expect(fmtRelativo(null, ahora)).toBe('nunca');
    expect(fmtRelativo('', ahora, 'sin registro')).toBe('sin registro');
    expect(fmtRelativo(new Date(2026, 10, 10, 1, 0), ahora)).toBe('hoy');
    expect(fmtRelativo(new Date(2026, 10, 12), ahora)).toBe('hoy');
    expect(fmtRelativo(new Date(2026, 10, 9), ahora)).toBe('ayer');
    expect(fmtRelativo(new Date(2026, 10, 5), ahora)).toBe('hace 5 días');
    expect(fmtRelativo(new Date(2026, 10, 10 - 44), ahora)).toBe('hace 44 días');
    expect(fmtRelativo(new Date(2026, 10, 10 - 60), ahora)).toBe('hace 2 meses');
    expect(fmtRelativo(new Date(2026, 10, 10 - 600), ahora)).toContain('años');
  });
});

describe('fmtTelefono', () => {
  it('deja legible el celular chileno con y sin +56', () => {
    expect(fmtTelefono('56912345678')).toBe('+56 9 1234 5678');
    expect(fmtTelefono('+56 9 1234 5678')).toBe('+56 9 1234 5678');
    expect(fmtTelefono('912345678')).toBe('9 1234 5678');
  });

  it('devuelve el marcador o el valor crudo cuando no reconoce el formato', () => {
    expect(fmtTelefono(null)).toBe('—');
    expect(fmtTelefono(undefined)).toBe('—');
    expect(fmtTelefono('')).toBe('—');
    expect(fmtTelefono('123')).toBe('123');
  });
});
