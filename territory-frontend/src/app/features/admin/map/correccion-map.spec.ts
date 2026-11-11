import { TestBed } from '@angular/core/testing';
import type { ManzanaFeature } from '../admin.models';
import { vaciar } from '../utils/correccion';
import { capturarTerritorios } from '../../../core/map/captura';
import { CorreccionMap } from './correccion-map';

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
    const mapa = { setLayoutProperty: vi.fn(), fitBounds: vi.fn() };
    return { componente: fixture.componentInstance, mapa };
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
    const capas = mapa.setLayoutProperty.mock.calls;
    expect(capas.slice(0, 3).map(c => c[2])).toEqual(['none', 'none', 'none']);
    expect(capas.slice(3).map(c => c[2])).toEqual(['visible', 'visible', 'visible']);
  });

  it('aunque la foto falle, las calles vuelven a verse', async () => {
    vi.mocked(capturarTerritorios).mockRejectedValueOnce(new Error('sin WebGL'));
    const { componente, mapa } = crear([manzana(1, 40, 0)]);
    (componente as unknown as { map: unknown }).map = mapa;
    await expect(componente.capturarSalida()).rejects.toThrow('sin WebGL');
    expect(mapa.setLayoutProperty).toHaveBeenLastCalledWith('calles-numero', 'visibility', 'visible');
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
