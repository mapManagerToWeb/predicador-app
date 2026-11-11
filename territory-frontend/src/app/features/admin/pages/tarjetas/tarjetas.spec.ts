import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Toast } from '../../../../core/services/toast';
import type { ManzanaFeature, ManzanasCollection } from '../../admin.models';
import { AdminApi } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { TarjetasPage } from './tarjetas';

type Senal<T> = ReturnType<typeof signal<T>>;

function manzana(territorio: number, nombre: string, id: number): ManzanaFeature {
  return {
    type: 'Feature',
    id,
    properties: { id, territorio, nombre } as ManzanaFeature['properties'],
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]] },
  } as ManzanaFeature;
}

interface VistaTarjetas {
  texto: Senal<string>;
  preparando: Senal<{ hecho: number; total: number } | null>;
  elegidos(): number[];
  enMapa(): { manzanas: ManzanaFeature[]; tarjeta: { numero: number } } | null;
  escribir(e: Event): void;
  todos(): void;
  imprimir(): Promise<void>;
}

describe('TarjetasPage', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let toast: { show: ReturnType<typeof vi.fn> };
  let store: {
    manzanas: Senal<ManzanasCollection | null>;
    colores: Senal<Record<number, string>>;
    territorios: Senal<number[]>;
    cargarManzanas: ReturnType<typeof vi.fn>;
  };
  let impreso: string[];
  let originalAppend: typeof document.body.appendChild;

  function montar(): VistaTarjetas {
    const fixture = TestBed.createComponent(TarjetasPage);
    fixture.detectChanges();
    return fixture.componentInstance as unknown as VistaTarjetas;
  }

  beforeEach(async () => {
    api = { estadoTerritorio: vi.fn().mockResolvedValue(null) };
    toast = { show: vi.fn() };
    store = {
      manzanas: signal<ManzanasCollection | null>({
        type: 'FeatureCollection',
        features: [manzana(5, '5.a', 1), manzana(5, '5.b', 2), manzana(6, '6.a', 3)],
      } as ManzanasCollection),
      colores: signal({ 5: '#ec4899' }),
      territorios: signal([5, 6]),
      cargarManzanas: vi.fn().mockResolvedValue(undefined),
    };
    impreso = [];
    originalAppend = document.body.appendChild.bind(document.body);
    document.body.appendChild = ((nodo: Node) => {
      const marco = nodo as HTMLIFrameElement;
      if (marco.tagName === 'IFRAME') impreso.push(marco.srcdoc);
      return originalAppend(nodo);
    }) as typeof document.body.appendChild;

    await TestBed.configureTestingModule({
      imports: [TarjetasPage],
      providers: [
        { provide: AdminApi, useValue: api },
        { provide: AdminStore, useValue: store },
        { provide: Toast, useValue: toast },
      ],
    })
      .overrideComponent(TarjetasPage, { set: { template: '', imports: [], schemas: [CUSTOM_ELEMENTS_SCHEMA] } })
      .compileComponents();
  });

  afterEach(() => {
    document.body.appendChild = originalAppend;
    document.querySelectorAll('#marco-tarjetas').forEach(e => e.remove());
  });

  it('lee los territorios escritos y los valida contra los existentes', () => {
    const page = montar();
    expect(store.cargarManzanas).toHaveBeenCalled();
    page.escribir({ target: { value: '5' } } as unknown as Event);
    expect(page.elegidos()).toEqual([5]);
    page.escribir({ target: { value: '5-6' } } as unknown as Event);
    expect(page.elegidos()).toEqual([5, 6]);
    page.escribir({ target: { value: '99' } } as unknown as Event);
    expect(page.elegidos()).toEqual([]);
  });

  it('muestra el primer territorio elegido con sus manzanas y su color', () => {
    const page = montar();
    expect(page.enMapa()).toBeNull();
    page.escribir({ target: { value: '5' } } as unknown as Event);
    expect(page.enMapa()?.manzanas.map(m => m.properties.nombre)).toEqual(['5.a', '5.b']);
    expect(page.enMapa()?.tarjeta.numero).toBe(5);
  });

  it('selecciona todos los territorios con un rango', () => {
    const page = montar();
    page.todos();
    expect(page.texto()).toBe('5-6');
    expect(page.elegidos()).toEqual([5, 6]);
  });

  it('no hace nada si no hay territorios para todos', () => {
    store.territorios.set([]);
    const page = montar();
    page.todos();
    expect(page.texto()).toBe('');
  });

  it('prepara una tarjeta por territorio y abre la impresión', async () => {
    const page = montar();
    page.escribir({ target: { value: '5-6' } } as unknown as Event);
    await page.imprimir();

    expect(api['estadoTerritorio']).toHaveBeenCalledTimes(2);
    expect(api['estadoTerritorio']).toHaveBeenNthCalledWith(1, 5);
    expect(api['estadoTerritorio']).toHaveBeenNthCalledWith(2, 6);
    expect(impreso).toHaveLength(1);
    expect(impreso[0]).toContain('5');
    expect(page.preparando()).toBeNull();
    expect(page.enMapa()?.tarjeta.numero).toBe(5);
  });

  it('no imprime sin territorios elegidos ni mientras ya prepara', async () => {
    const page = montar();
    await page.imprimir();
    expect(api['estadoTerritorio']).not.toHaveBeenCalled();
    expect(impreso).toHaveLength(0);

    page.escribir({ target: { value: '5' } } as unknown as Event);
    page.preparando.set({ hecho: 0, total: 1 });
    await page.imprimir();
    expect(api['estadoTerritorio']).not.toHaveBeenCalled();
  });

  it('avisa si falla al preparar las tarjetas y limpia el estado', async () => {
    api['estadoTerritorio'].mockRejectedValue(new Error('caído'));
    const page = montar();
    page.escribir({ target: { value: '5' } } as unknown as Event);
    await page.imprimir();
    expect(toast.show).toHaveBeenCalledWith(expect.any(String), 5000, 'error');
    expect(page.preparando()).toBeNull();
  });

  it('reemplaza el marco de impresión anterior', async () => {
    const page = montar();
    page.escribir({ target: { value: '5' } } as unknown as Event);
    document.querySelectorAll('#marco-tarjetas').forEach(e => e.remove());
    const previo = document.createElement('iframe');
    previo.id = 'marco-tarjetas';
    document.body.appendChild(previo);
    const remove = vi.spyOn(previo, 'remove');
    await page.imprimir();
    expect(remove).toHaveBeenCalled();
  });
});
