import type { Map as MapLibreMap } from 'maplibre-gl';
import { agruparParaCaptura, cajaDePuntos, capturarTerritorios, disposicion, esperarQuieto, ladoMayorM, rotuloDe, type Caja } from './captura';

/** Un contexto 2D de mentira que anota lo que se le pide (jsdom no dibuja). */
function lienzoFalso() {
  const llamadas: { metodo: string; args: unknown[] }[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(t, p: string) {
      if (p in t) return t[p];
      if (p === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (p === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
      return (...args: unknown[]) => void llamadas.push({ metodo: p, args });
    },
    set(t, p: string, v) {
      t[p] = v;
      return true;
    },
  });
  return { ctx, llamadas, textos: () => llamadas.filter(l => l.metodo === 'fillText').map(l => l.args[0]) };
}

/** Un mapa de MapLibre de mentira: el canvas de un celular (390 × 844, densidad 3). */
function mapaFalso(opciones: { densidad?: number; fallaAlEncuadrar?: boolean } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1170;
  canvas.height = 2532;
  const limites = [[-74, -38], [-73, -37]];
  const map = {
    getCenter: () => ({ lng: -73.35, lat: -37.48 }),
    getZoom: () => 15,
    getBearing: () => 0,
    getPitch: () => 0,
    getMaxBounds: () => limites,
    setMaxBounds: vi.fn(),
    getPixelRatio: () => opciones.densidad ?? 3,
    setPixelRatio: vi.fn(),
    fitBounds: vi.fn(() => {
      if (opciones.fallaAlEncuadrar) throw new Error('sin WebGL');
    }),
    once: vi.fn((_: string, listo: () => void) => listo()),
    off: vi.fn(),
    triggerRepaint: vi.fn(),
    getCanvas: () => canvas,
    getContainer: () => ({ clientWidth: 390, clientHeight: 844 }),
    jumpTo: vi.fn(),
  };
  return { map, limites, canvas, comoMapa: map as unknown as MapLibreMap };
}

/** Caja cuadrada de `lado` grados con la esquina suroeste en (x, y), cerca de Curanilahue. */
const caja = (x: number, y: number, lado = 0.004): Caja => [
  [-73.35 + x, -37.48 + y],
  [-73.35 + x + lado, -37.48 + y + lado],
];

describe('captura del mapa para el WhatsApp', () => {
  it('la caja de unos puntos y su lado mayor en metros', () => {
    const c = cajaDePuntos([[-73.35, -37.48], [-73.34, -37.475]])!;
    expect(c).toEqual([[-73.35, -37.48], [-73.34, -37.475]]);
    // 0,01° de longitud a esta latitud son ~880 m; 0,005° de latitud, ~560 m.
    expect(ladoMayorM(c)).toBeGreaterThan(850);
    expect(ladoMayorM(c)).toBeLessThan(900);
    expect(cajaDePuntos([])).toBeNull();
  });

  it('territorios cercanos salen en una sola foto', () => {
    const grupos = agruparParaCaptura(new Map([[42, caja(0.004, 0)], [40, caja(0, 0)], [41, caja(0, 0.004)]]));
    expect(grupos).toHaveLength(1);
    expect(grupos[0].territorios).toEqual([40, 41, 42]);
    const [[o, s], [e, n]] = grupos[0].caja;
    for (const [v, esperado] of [[o, -73.35], [s, -37.48], [e, -73.342], [n, -37.472]]) expect(v).toBeCloseTo(esperado, 9);
  });

  it('uno en cada extremo de la ciudad: una foto de cerca de cada uno, de oeste a este', () => {
    const grupos = agruparParaCaptura(new Map([[90, caja(0.04, 0)], [12, caja(0, 0)], [13, caja(0.004, 0)]]));
    expect(grupos.map(g => g.territorios)).toEqual([[12, 13], [90]]);
  });

  it('nunca más de cuatro partes: se juntan las más cercanas', () => {
    const lejos = new Map([1, 2, 3, 4, 5].map(t => [t, caja(t * 0.03, 0)] as [number, Caja]));
    const grupos = agruparParaCaptura(lejos);
    expect(grupos).toHaveLength(4);
    expect(grupos.flatMap(g => g.territorios).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('sin territorios no hay fotos', () => {
    expect(agruparParaCaptura(new Map())).toEqual([]);
  });

  it('las partes van de a dos por fila; si sobra una, va centrada', () => {
    expect(disposicion(2)).toEqual({ ancho: 1608, alto: 800, lugares: [{ x: 0, y: 0 }, { x: 808, y: 0 }] });
    const tres = disposicion(3);
    expect(tres.alto).toBe(1608);
    expect(tres.lugares[2]).toEqual({ x: 404, y: 808 });
  });

  it('el rótulo de cada parte', () => {
    expect(rotuloDe([72])).toBe('Territorio 72');
    expect(rotuloDe([40, 41])).toBe('Territorios 40, 41');
  });

  describe('la foto', () => {
    let falso: ReturnType<typeof lienzoFalso>;

    beforeEach(() => {
      falso = lienzoFalso();
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
        falso.ctx['canvas'] = this;
        return falso.ctx as unknown as CanvasRenderingContext2D;
      } as never);
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,QUJD');
    });

    afterEach(() => vi.restoreAllMocks());

    it('territorios cercanos: una sola foto del mapa, achicada, y todo queda como estaba', async () => {
      const { map, limites, comoMapa } = mapaFalso();
      const imagen = await capturarTerritorios(comoMapa, new Map([[40, caja(0, 0)], [41, caja(0.004, 0)]]));
      expect(imagen).toBe('QUJD');
      expect(map.fitBounds).toHaveBeenCalledTimes(1);
      expect(map.fitBounds.mock.calls[0][1]).toEqual(expect.objectContaining({ padding: { top: 36, bottom: 36, left: 36, right: 36 }, duration: 0 }));
      // 1170 × 2532 se achica a 1600 de alto.
      expect(falso.llamadas.find(l => l.metodo === 'drawImage')?.args.slice(-2)).toEqual([739, 1600]);
      expect(map.setMaxBounds).toHaveBeenNthCalledWith(1, null);
      expect(map.setMaxBounds).toHaveBeenLastCalledWith(limites);
      expect(map.setPixelRatio).not.toHaveBeenCalled();
      expect(map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 15 }));
    });

    it('territorios lejos: una foto cuadrada de cada grupo, con su rótulo, en una sola imagen', async () => {
      const { map, comoMapa } = mapaFalso();
      const imagen = await capturarTerritorios(comoMapa, new Map([[12, caja(0, 0)], [90, caja(0.05, 0)]]));
      expect(imagen).toBe('QUJD');
      expect(map.fitBounds).toHaveBeenCalledTimes(2);
      // Cuadrado central del celular (390 de lado): margen extra arriba y abajo.
      expect(map.fitBounds.mock.calls[0][1].padding).toEqual({ top: 263, bottom: 263, left: 36, right: 36 });
      const fotos = falso.llamadas.filter(l => l.metodo === 'drawImage');
      // Dos partes y, como la unión mide 1608 de ancho, una copia achicada a 1600.
      expect(fotos).toHaveLength(3);
      expect(fotos[2].args.slice(-2)).toEqual([1600, 796]);
      // Se recorta el cuadrado central del canvas (en px del canvas) y va a su lugar.
      expect(fotos[1].args.slice(1)).toEqual([0, 681, 1170, 1170, 808, 0, 800, 800]);
      expect(falso.textos()).toEqual(['Territorio 12', 'Territorio 90']);
    });

    it('en el computador dibuja al doble mientras saca la foto', async () => {
      const { map, comoMapa } = mapaFalso({ densidad: 1 });
      await capturarTerritorios(comoMapa, new Map([[40, caja(0, 0)]]));
      expect(map.setPixelRatio.mock.calls).toEqual([[2], [1]]);
    });

    it('si algo falla devuelve null, pero deja el mapa como estaba', async () => {
      const { map, limites, comoMapa } = mapaFalso({ fallaAlEncuadrar: true });
      await expect(capturarTerritorios(comoMapa, new Map([[40, caja(0, 0)]]))).resolves.toBeNull();
      expect(map.setMaxBounds).toHaveBeenLastCalledWith(limites);
      expect(map.jumpTo).toHaveBeenCalled();
    });

    it('sin territorios no hay foto; sin contexto 2D para unirlas, tampoco', async () => {
      const { map, comoMapa } = mapaFalso();
      await expect(capturarTerritorios(comoMapa, new Map())).resolves.toBeNull();
      expect(map.fitBounds).not.toHaveBeenCalled();
      vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
      await expect(capturarTerritorios(comoMapa, new Map([[12, caja(0, 0)], [90, caja(0.05, 0)]]))).resolves.toBeNull();
    });

    it('si el mapa nunca termina de dibujar, sigue igual a los 8 s', async () => {
      vi.useFakeTimers();
      try {
        const { map, comoMapa } = mapaFalso();
        map.once.mockImplementation(() => undefined);
        const espera = esperarQuieto(comoMapa);
        await vi.advanceTimersByTimeAsync(8000);
        await expect(espera).resolves.toBeUndefined();
        expect(map.off).toHaveBeenCalledWith('idle', expect.any(Function));
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
