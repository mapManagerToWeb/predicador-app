import { describe, it, expect } from 'vitest';

describe('Logica de determinacion de screenshot', () => {
  function requiereScreenshot(territorios: { finalizado: boolean }[]): boolean {
    if (territorios.length > 1) return true;
    return territorios.some(t => !t.finalizado);
  }

  it('deberia requerir screenshot con multiples territorios', () => {
    const territorios = [
      { numero: 1, finalizado: true, totalManzanas: 12, manzanasMarcadas: 12 },
      { numero: 2, finalizado: true, totalManzanas: 8, manzanasMarcadas: 8 }
    ];
    expect(requiereScreenshot(territorios)).toBe(true);
  });

  it('deberia requerir screenshot con territorio incompleto', () => {
    const territorios = [
      { numero: 1, finalizado: false, totalManzanas: 12, manzanasMarcadas: 5 }
    ];
    expect(requiereScreenshot(territorios)).toBe(true);
  });

  it('NO deberia requerir screenshot con un territorio finalizado', () => {
    const territorios = [
      { numero: 1, finalizado: true, totalManzanas: 12, manzanasMarcadas: 12 }
    ];
    expect(requiereScreenshot(territorios)).toBe(false);
  });
});

describe('Generacion de parametros de template', () => {
  function generarParametros(
    encargadoNombre: string,
    encargadoApellido: string,
    fechaRegistro: string,
    territorios: { numero: number; finalizado: boolean }[]
  ): { fecha: string; encargado: string; territorio: string; estado: string } {
    const encargado = `${encargadoNombre} ${encargadoApellido}`;
    const territorio = territorios
      .map(t => `Territorio ${t.numero} ${t.finalizado ? '*terminado*' : '*faltante*'}`)
      .join('\n');

    return { fecha: fechaRegistro, encargado, territorio, estado: '' };
  }

  it('deberia generar parametros correctos para territorio finalizado', () => {
    const params = generarParametros('Daniel', 'Uribe', '21-07-2026', [
      { numero: 1, finalizado: true }
    ]);

    expect(params).toEqual({
      fecha: '21-07-2026',
      encargado: 'Daniel Uribe',
      territorio: 'Territorio 1 *terminado*',
      estado: ''
    });
  });

  it('deberia generar parametros correctos para territorio incompleto', () => {
    const params = generarParametros('Maria', 'Lopez', '21-07-2026', [
      { numero: 3, finalizado: false }
    ]);

    expect(params).toEqual({
      fecha: '21-07-2026',
      encargado: 'Maria Lopez',
      territorio: 'Territorio 3 *faltante*',
      estado: ''
    });
  });

  it('deberia generar parametros correctos para mixto', () => {
    const params = generarParametros('Bastian', 'Sandoval', '21-07-2026', [
      { numero: 1, finalizado: true },
      { numero: 2, finalizado: false }
    ]);

    expect(params).toEqual({
      fecha: '21-07-2026',
      encargado: 'Bastian Sandoval',
      territorio: 'Territorio 1 *terminado*\nTerritorio 2 *faltante*',
      estado: ''
    });
  });
});
