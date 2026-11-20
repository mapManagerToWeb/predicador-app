import { colorFuerte, coloresFuertes } from './colores';

/** Luminancia relativa, para comprobar el resultado. */
function brillo(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

describe('colorFuerte: los colores muy claros se refuerzan para pintar', () => {
  it('el lila del 69, el rosado y los verdes claros quedan más firmes', () => {
    for (const claro of ['#DA70D6', '#FF69B4', '#00FF7F', '#00CED1']) {
      const fuerte = colorFuerte(claro);
      expect(fuerte).not.toBe(claro);
      expect(brillo(fuerte)).toBeLessThanOrEqual(0.25);
    }
  });

  it('los amarillos bajan menos, para que sigan siendo dorados', () => {
    const oro = colorFuerte('#FFD700');
    expect(brillo(oro)).toBeLessThanOrEqual(0.42);
    expect(brillo(oro)).toBeGreaterThan(0.3);
    const [r, g, b] = [1, 3, 5].map(i => parseInt(oro.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b + 100); // sigue siendo amarillo, no gris
    expect(g).toBeGreaterThan(b + 100);
  });

  it('los colores que ya son firmes, los grises oscuros y lo que no es un color quedan igual', () => {
    expect(colorFuerte('#DC143C')).toBe('#DC143C');
    expect(colorFuerte('#000075')).toBe('#000075');
    expect(colorFuerte('#333')).toBe('#333');
    expect(colorFuerte('red')).toBe('red');
  });

  it('acepta el formato corto y un gris muy claro también se oscurece', () => {
    expect(brillo(colorFuerte('#ff0'))).toBeLessThanOrEqual(0.42);
    expect(brillo(colorFuerte('#eeeeee'))).toBeLessThanOrEqual(0.25);
  });

  it('pasa todos los colores de una vez, por territorio', () => {
    expect(coloresFuertes({ 69: '#DA70D6', 19: '#DC143C' })).toEqual({ 69: colorFuerte('#DA70D6'), 19: '#DC143C' });
  });
});
