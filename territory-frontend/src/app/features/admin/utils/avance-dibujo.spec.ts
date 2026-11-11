import { dibujarAvance, MEDIDAS, type DatosImagenAvance } from './avance-dibujo';

/** Un contexto 2D de mentira que anota lo que se le pide (jsdom no dibuja). */
function lienzoFalso() {
  const llamadas: { metodo: string; args: unknown[] }[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(t, p: string) {
      if (p in t) return t[p];
      if (p === 'measureText') return (s: string) => ({ width: s.length * 20 });
      if (p === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
      return (...args: unknown[]) => void llamadas.push({ metodo: p, args });
    },
    set(t, p: string, v) {
      t[p] = v;
      return true;
    },
  });
  return { ctx, llamadas, textos: () => llamadas.filter(l => l.metodo === 'fillText').map(l => String(l.args[0])) };
}

const cuadrado = (x: number) => ({ type: 'Polygon' as const, coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 0]]] });

function datos(cambios: Partial<DatosImagenAvance> = {}): DatosImagenAvance {
  return {
    avance: { total: 3, completados: 1, enCurso: 1, porcentaje: 33 },
    manzanas: [
      { territorio: 1, geometria: cuadrado(0) },
      { territorio: 2, geometria: { type: 'MultiPolygon', coordinates: [cuadrado(2).coordinates] } },
      { territorio: 3, geometria: cuadrado(4) },
    ],
    situaciones: new Map([[1, 'completado'], [2, 'en-curso']]),
    caja: [[0, 0], [5, 1]],
    titulo: '¡Así vamos, hermanos!',
    mensaje: 'Gracias por su esfuerzo',
    meta: 'Faltan 12 días para la asamblea',
    desde: 'Desde el 3 de noviembre',
    logo: document.createElement('canvas'),
    ...cambios,
  };
}

describe('dibujo de la imagen de avance', () => {
  let falso: ReturnType<typeof lienzoFalso>;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    falso = lienzoFalso();
    canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockImplementation(() => {
      falso.ctx['canvas'] = canvas;
      return falso.ctx as unknown as CanvasRenderingContext2D;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('cuadrada: título, porcentaje, avance, leyenda, meta, mensaje y desde cuándo', () => {
    dibujarAvance(canvas, datos(), 'cuadrada');
    expect([canvas.width, canvas.height]).toEqual([MEDIDAS.cuadrada.ancho, MEDIDAS.cuadrada.alto]);
    expect(falso.textos()).toEqual(
      expect.arrayContaining([
        'Territorios',
        '33',
        '%',
        '1 de 3 territorios',
        'completados y 1 empezado',
        'Completado',
        'Empezado',
        'Falta',
        'Faltan 12 días para la asamblea',
        'Gracias por su esfuerzo',
        'Desde el 3 de noviembre',
      ]),
    );
    // Logo, anillo de avance y una pasada de relleno por situación.
    expect(falso.llamadas.filter(l => l.metodo === 'drawImage')).toHaveLength(1);
    expect(falso.llamadas.filter(l => l.metodo === 'arc').length).toBeGreaterThanOrEqual(5);
    expect(falso.llamadas.filter(l => l.metodo === 'fill' && l.args[0] === 'evenodd')).toHaveLength(3);
  });

  it('vertical y un título largo: va en dos líneas', () => {
    const titulo = 'Un título bastante largo para la imagen vertical de prueba';
    dibujarAvance(canvas, datos({ titulo }), 'vertical');
    expect([canvas.width, canvas.height]).toEqual([1080, 1920]);
    const lineas = falso.textos().filter(t => titulo.includes(t) && t.includes(' '));
    expect(lineas.join(' ')).toBe(titulo);
    expect(lineas).toHaveLength(2);
  });

  it('sin avance, sin meta, sin mensaje, sin logo y sin mapa: lo mínimo', () => {
    dibujarAvance(
      canvas,
      datos({
        avance: { total: 3, completados: 0, enCurso: 0, porcentaje: 0 },
        meta: null,
        mensaje: '  ',
        desde: null,
        logo: null,
        caja: null,
        titulo: '',
      }),
      'cuadrada',
    );
    const textos = falso.textos();
    expect(textos).toContain('Así vamos');
    expect(textos).toContain('0');
    expect(textos).toContain('completados');
    expect(textos.some(t => t.startsWith('Faltan') || t.startsWith('Desde'))).toBe(false);
    expect(falso.llamadas.some(l => l.metodo === 'drawImage')).toBe(false);
    expect(falso.llamadas.some(l => l.metodo === 'fill' && l.args[0] === 'evenodd')).toBe(false);
  });

  it('sin contexto 2D no dibuja nada', () => {
    vi.mocked(canvas.getContext).mockReturnValue(null);
    dibujarAvance(canvas, datos(), 'vertical');
    expect(falso.llamadas).toHaveLength(0);
  });
});
