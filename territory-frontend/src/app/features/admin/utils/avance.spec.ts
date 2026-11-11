import { avanceDe, diasHasta, enLineas, proyector, textoAvance, textoDesde, textoEnCurso, textoMeta } from './avance';

describe('imagen de avance (cuentas y textos)', () => {
  it('cuenta los completados de la vuelta sobre el total, redondeando hacia abajo', () => {
    const a = avanceDe([1, 2, 3], new Map([[1, 'completado'], [2, 'en-curso'], [9, 'completado']]));
    expect(a).toEqual({ total: 3, completados: 1, enCurso: 1, porcentaje: 33 });
    // 199 de 200 no es 100 %.
    const casi = avanceDe(Array.from({ length: 200 }, (_, i) => i), new Map(Array.from({ length: 199 }, (_, i) => [i, 'completado'] as const)));
    expect(casi.porcentaje).toBe(99);
    expect(avanceDe([], new Map()).porcentaje).toBe(0);
  });

  it('los textos del avance', () => {
    expect(textoAvance({ total: 120, completados: 45, enCurso: 0, porcentaje: 37 })).toBe('45 de 120 territorios');
    expect(textoAvance({ total: 1, completados: 0, enCurso: 0, porcentaje: 0 })).toBe('0 de 1 territorio');
    expect(textoEnCurso({ total: 9, completados: 1, enCurso: 0, porcentaje: 11 })).toBeNull();
    expect(textoEnCurso({ total: 9, completados: 1, enCurso: 1, porcentaje: 11 })).toBe('y 1 empezado');
    expect(textoEnCurso({ total: 9, completados: 1, enCurso: 4, porcentaje: 11 })).toBe('y 4 empezados');
  });

  it('los días que faltan para la meta, por calendario', () => {
    const hoy = new Date(2026, 10, 11, 23, 30);
    expect(diasHasta('2026-11-23', hoy)).toBe(12);
    expect(diasHasta('2026-11-11', hoy)).toBe(0);
    expect(textoMeta({ nombre: 'la asamblea', fecha: '2026-11-23' }, hoy)).toBe('Faltan 12 días para la asamblea');
    expect(textoMeta({ nombre: 'la asamblea', fecha: '2026-11-12' }, hoy)).toBe('Falta 1 día para la asamblea');
    expect(textoMeta({ nombre: 'la Conmemoración', fecha: '2026-11-11' }, hoy)).toBe('¡Hoy es la Conmemoración!');
    // Ya pasó, sin nombre o sin fecha: no sale.
    expect(textoMeta({ nombre: 'la asamblea', fecha: '2026-11-10' }, hoy)).toBeNull();
    expect(textoMeta({ nombre: '  ', fecha: '2026-11-23' }, hoy)).toBeNull();
    expect(textoMeta({ nombre: 'la asamblea', fecha: '' }, hoy)).toBeNull();
    expect(textoMeta(null, hoy)).toBeNull();
  });

  it('desde cuándo va la vuelta', () => {
    expect(textoDesde('2026-11-03T03:00:00Z')).toBe('Desde el 3 de noviembre');
    expect(textoDesde(null)).toBeNull();
  });

  it('corta el mensaje en líneas que caben', () => {
    const medir = (t: string) => t.length;
    expect(enLineas('Gracias por su esfuerzo hermanos', 12, medir)).toEqual(['Gracias por', 'su esfuerzo', 'hermanos']);
    expect(enLineas('   ', 10, medir)).toEqual([]);
  });

  it('proyecta el mapa centrado y sin deformar', () => {
    const p = proyector([[0, 0], [2, 1]], { x: 0, y: 0, ancho: 200, alto: 200 });
    // En el ecuador: 2 × 1 grados en 200 × 200 px → 100 px por grado, centrado en alto.
    const [[x1, y1], [x2, y2]] = [p([0, 1]), p([2, 0])];
    for (const [v, esperado] of [[x1, 0], [y1, 50], [x2, 200], [y2, 150]]) expect(v).toBeCloseTo(esperado, 1);
  });
});
