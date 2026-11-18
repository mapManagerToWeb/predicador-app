import { TestBed } from '@angular/core/testing';
import type { ManzanaFeature } from '../admin.models';
import { vaciar } from '../utils/correccion';
import { capturarTerritorios } from '../../../core/map/captura';
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
