import { TestBed } from '@angular/core/testing';
import type { ManzanaFeature } from '../admin.models';
import { vaciar } from '../utils/correccion';
import { capturarTerritorios } from '../../../core/map/captura';
import { crearMapa } from '../../../core/map/base-map';
import { CorreccionMap, relleno } from './correccion-map';

// Sin WebGL: el mapa real no se crea; cada prueba le pone uno de mentira.
vi.mock('../../../core/map/base-map', async original => ({
  ...(await original<typeof import('../../../core/map/base-map')>()),
  crearMapa: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock('../../../core/map/captura', async original => ({
  ...(await original<typeof import('../../../core/map/captura')>()),
  capturarTerritorios: vi.fn().mockResolvedValue('IMG'),
}));

function manzana(id: number, territorio: number, x: number): ManzanaFeature {
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Polygon', coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 0]]] },
    properties: { id, territorio, nombre: `${territorio}.${id}`, areaM2: 100, valida: true },
  };
}

describe('CorreccionMap: la foto de «Registrar salida»', () => {
  function crear(manzanas: ManzanaFeature[]) {
    const fixture = TestBed.createComponent(CorreccionMap);
    fixture.componentRef.setInput('manzanas', manzanas);
    fixture.componentRef.setInput('estado', vaciar());
    const mapa = { setLayoutProperty: vi.fn(), setPaintProperty: vi.fn(), fitBounds: vi.fn() };
    return { componente: fixture.componentInstance, mapa, fixture };
  }

  beforeEach(() => vi.mocked(capturarTerritorios).mockClear());

  it('saca la foto de todos los territorios, enteros, sin las calles que se estaban editando', async () => {
    const { componente, mapa } = crear([manzana(1, 40, 0), manzana(2, 40, 3), manzana(3, 41, 10)]);
    (componente as unknown as { map: unknown }).map = mapa;
    await expect(componente.capturarSalida()).resolves.toBe('IMG');
    const cajas = vi.mocked(capturarTerritorios).mock.calls[0][1];
    // Las dos manzanas del 40 hacen una sola caja.
    expect([...cajas]).toEqual([
      [40, [[0, 0], [4, 1]]],
      [41, [[10, 0], [11, 1]]],
    ]);
    // Se esconden las calles y el borde de lo nuevo; después vuelven las calles y el borde sigue oculto (por defecto).
    const capas = mapa.setLayoutProperty.mock.calls.map(c => `${c[0]}:${c[2]}`);
    expect(capas).toEqual([
      'calles-borde:none',
      'calles-linea:none',
      'calles-numero:none',
      'manzanas-nuevas:none',
      'calles-borde:visible',
      'calles-linea:visible',
      'calles-numero:visible',
      'manzanas-nuevas:none',
    ]);
  });

  it('al registrar, el borde de lo nuevo sale de la foto pero vuelve a verse en el mapa', async () => {
    const { componente, mapa, fixture } = crear([manzana(1, 40, 0)]);
    fixture.componentRef.setInput('anterioresEnColor', true);
    (componente as unknown as { map: unknown }).map = mapa;
    await componente.capturarSalida();
    const borde = mapa.setLayoutProperty.mock.calls.filter(c => c[0] === 'manzanas-nuevas').map(c => c[2]);
    expect(borde).toEqual(['none', 'visible']);
  });

  it('aunque la foto falle, las calles vuelven a verse', async () => {
    vi.mocked(capturarTerritorios).mockRejectedValueOnce(new Error('sin WebGL'));
    const { componente, mapa } = crear([manzana(1, 40, 0)]);
    (componente as unknown as { map: unknown }).map = mapa;
    await expect(componente.capturarSalida()).rejects.toThrow('sin WebGL');
    expect(mapa.setLayoutProperty).toHaveBeenCalledWith('calles-numero', 'visibility', 'visible');
  });

  it('sin mapa todavía no hay foto', async () => {
    const { componente } = crear([manzana(1, 40, 0)]);
    await expect(componente.capturarSalida()).resolves.toBeNull();
    expect(capturarTerritorios).not.toHaveBeenCalled();
  });

  it('encuadra las manzanas del territorio', () => {
    const { componente, mapa } = crear([]);
    (componente as unknown as { map: unknown }).map = mapa;
    (componente as unknown as { encuadrar(m: ManzanaFeature[]): void }).encuadrar([manzana(1, 40, 0), manzana(2, 40, 5)]);
    expect(mapa.fitBounds).toHaveBeenCalledWith([[0, 0], [6, 1]], expect.objectContaining({ padding: 40 }));
  });
});

describe('CorreccionMap: cómo se ve lo que ya estaba predicado', () => {
  it('al corregir, lo de antes va en gris; al registrar, con el color del territorio', () => {
    expect(JSON.stringify(relleno('#123456'))).toContain('#9ca3af');
    expect(relleno('#123456', true)).toEqual(['coalesce', ['get', 'color'], '#123456']);
  });

  it('al pedirlo, cambia el relleno y muestra el borde de lo nuevo', async () => {
    const fixture = TestBed.createComponent(CorreccionMap);
    fixture.componentRef.setInput('manzanas', []);
    fixture.componentRef.setInput('estado', vaciar());
    const mapa = {
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
      getSource: vi.fn(() => ({ setData: vi.fn() })),
      fitBounds: vi.fn(),
      remove: vi.fn(),
    };
    const interno = fixture.componentInstance as unknown as { map: unknown; listo: { set(v: boolean): void } };
    interno.map = mapa;
    interno.listo.set(true);
    fixture.componentRef.setInput('anterioresEnColor', true);
    fixture.componentRef.setInput('color', '#ff0000');
    await fixture.whenStable();
    expect(mapa.setPaintProperty).toHaveBeenCalledWith('manzanas-fill', 'fill-color', ['coalesce', ['get', 'color'], '#ff0000']);
    expect(mapa.setPaintProperty).toHaveBeenCalledWith('zonas-fill', 'fill-color', ['coalesce', ['get', 'color'], '#ff0000']);
    expect(mapa.setLayoutProperty).toHaveBeenCalledWith('manzanas-nuevas', 'visibility', 'visible');
  });
});

describe('CorreccionMap: el mapa al abrirse', () => {
  type Manejador = (e: { point: { x: number; y: number } }) => void;
  function mapaDeMentira() {
    const manejadores: Record<string, Manejador> = {};
    const canvas = { style: { cursor: '' } };
    return {
      manejadores,
      canvas,
      encontrado: [] as unknown[],
      addSource: vi.fn(),
      addLayer: vi.fn(),
      on: vi.fn((evento: string, h: Manejador) => (manejadores[evento] = h)),
      getCanvas: () => canvas,
      getSource: vi.fn(() => ({ setData: vi.fn() })),
      queryRenderedFeatures: vi.fn(function (this: { encontrado: unknown[] }) {
        return this.encontrado;
      }),
      setPaintProperty: vi.fn(),
      setLayoutProperty: vi.fn(),
      fitBounds: vi.fn(),
      remove: vi.fn(),
    };
  }

  async function abrir(anterioresEnColor: boolean) {
    const mapa = mapaDeMentira();
    vi.mocked(crearMapa).mockResolvedValueOnce({ map: mapa } as unknown as Awaited<ReturnType<typeof crearMapa>>);
    const fixture = TestBed.createComponent(CorreccionMap);
    fixture.componentRef.setInput('manzanas', [manzana(1, 15, 0), manzana(2, 15, 3)]);
    fixture.componentRef.setInput('estado', vaciar());
    fixture.componentRef.setInput('anterioresEnColor', anterioresEnColor);
    await fixture.whenStable();
    await new Promise(r => setTimeout(r, 0));
    await fixture.whenStable();
    const hover = () => (fixture.componentInstance as unknown as { hover(): string | null }).hover();
    return { fixture, mapa, hover };
  }

  const capa = (mapa: ReturnType<typeof mapaDeMentira>, id: string) =>
    mapa.addLayer.mock.calls.map(c => c[0] as { id: string; layout?: { visibility?: string }; paint?: Record<string, unknown> }).find(l => l.id === id);

  it('al registrar: lo de antes con el color del territorio y el borde de lo nuevo visible', async () => {
    const { mapa, hover } = await abrir(true);
    expect(capa(mapa, 'manzanas-nuevas')?.layout?.visibility).toBe('visible');
    expect(JSON.stringify(capa(mapa, 'manzanas-fill')?.paint?.['fill-color'])).not.toContain('#9ca3af');
    expect(JSON.stringify(capa(mapa, 'zonas-fill')?.paint?.['fill-color'])).not.toContain('#9ca3af');
    expect(mapa.fitBounds).toHaveBeenCalled();

    mapa.encontrado = [{ properties: { bloqueada: true, nombre: '15.1' }, layer: { id: 'manzanas-fill' } }];
    mapa.manejadores['mousemove']({ point: { x: 1, y: 1 } });
    expect(hover()).toBe('Manzana 15.1: ya estaba predicada');
    expect(mapa.canvas.style.cursor).toBe('pointer');
  });

  it('al corregir: lo de antes en gris y sin el borde de lo nuevo', async () => {
    const { mapa, hover } = await abrir(false);
    expect(capa(mapa, 'manzanas-nuevas')?.layout?.visibility).toBe('none');
    expect(JSON.stringify(capa(mapa, 'manzanas-fill')?.paint?.['fill-color'])).toContain('#9ca3af');

    mapa.encontrado = [{ properties: { bloqueada: true, nombre: '15.1' }, layer: { id: 'manzanas-fill' } }];
    mapa.manejadores['mousemove']({ point: { x: 1, y: 1 } });
    expect(hover()).toBe('Ya estaba marcado antes: no se cambia aquí');

    mapa.encontrado = [{ properties: { marcada: false, nombre: '15.2' }, layer: { id: 'manzanas-fill' } }];
    mapa.manejadores['mousemove']({ point: { x: 1, y: 1 } });
    expect(hover()).toBe('Manzana 15.2: clic para cambiar');

    mapa.encontrado = [];
    mapa.manejadores['mousemove']({ point: { x: 1, y: 1 } });
    expect(hover()).toBeNull();
  });

  it('un clic en una manzana avisa cuál es', async () => {
    const { fixture, mapa } = await abrir(true);
    const tocadas: string[] = [];
    fixture.componentInstance.manzanaClick.subscribe(m => tocadas.push(m.properties.nombre));
    mapa.encontrado = [{ properties: { clave: '15-15.2' }, layer: { id: 'manzanas-fill' } }];
    mapa.manejadores['click']({ point: { x: 1, y: 1 } });
    expect(tocadas).toEqual(['15.2']);
  });
});
