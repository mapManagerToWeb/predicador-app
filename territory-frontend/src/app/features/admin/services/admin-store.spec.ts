import { TestBed } from '@angular/core/testing';
import { AdminApi } from './admin-api';
import { AdminStore } from './admin-store';

describe('AdminStore: la vuelta y los territorios fuera de la meta', () => {
  let store: AdminStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = {
      estadoPublico: vi.fn().mockResolvedValue([
        { territorio: 1, ultimoTrabajo: '2026-11-05T12:00:00Z', estado: 'completed' },
        { territorio: 2, ultimoTrabajo: '2026-11-06T12:00:00Z', estado: 'incomplete' },
        { territorio: 130, ultimoTrabajo: null, estado: null },
      ]),
      ciclos: vi.fn().mockResolvedValue([{ id: 2, inicio: '2026-11-03T03:00:00Z', fin: null, nota: null, resumen: null }]),
      fueraDeMeta: vi.fn().mockResolvedValue([130]),
      setFueraDeMeta: vi.fn().mockImplementation(async (l: number[]) => [...l].sort((a, b) => a - b)),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AdminApi, useValue: api }] });
    store = TestBed.inject(AdminStore);
    store.manzanas.set({
      type: 'FeatureCollection',
      features: [1, 2, 3, 130].map(t => ({
        type: 'Feature',
        id: t,
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        properties: { id: t, territorio: t, nombre: `${t}.a`, areaM2: 100, valida: true },
      })),
    });
  });

  it('carga cómo va la vuelta, cuándo empezó y quiénes no cuentan', async () => {
    await store.cargarVuelta();
    expect(store.inicioVuelta()).toBe('2026-11-03T03:00:00Z');
    expect(store.territoriosEnMeta()).toEqual([1, 2, 3]);
    expect(store.avanceVuelta()).toEqual({ total: 3, completados: 1, enCurso: 1, porcentaje: 33 });
    // No vuelve a pedir lo mismo si no se fuerza.
    await store.cargarVuelta();
    expect(api['estadoPublico']).toHaveBeenCalledTimes(1);
    await store.cargarVuelta(true);
    expect(api['estadoPublico']).toHaveBeenCalledTimes(2);
  });

  it('con un servidor que todavía no tiene la opción (o sin ciclos), cuentan todos', async () => {
    api['fueraDeMeta'].mockRejectedValue(new Error('404'));
    api['ciclos'].mockRejectedValue(new Error('caído'));
    await store.cargarVuelta();
    expect(store.fueraDeMeta()).toEqual([]);
    expect(store.inicioVuelta()).toBeNull();
    expect(store.avanceVuelta().total).toBe(4);
  });

  it('guarda la lista y al cerrar sesión la olvida', async () => {
    await store.guardarFueraDeMeta([130, 3]);
    expect(api['setFueraDeMeta']).toHaveBeenCalledWith([130, 3]);
    expect(store.fueraDeMeta()).toEqual([3, 130]);
    store.limpiar();
    expect(store.fueraDeMeta()).toEqual([]);
    expect(store.situaciones()).toBeNull();
  });
});

describe('AdminStore: la capacitación', () => {
  let store: AdminStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = {
      capacitacion: vi.fn().mockResolvedValue({ activa: true, desde: '2026-11-22T19:00:00Z', pruebas: [] }),
      empezarCapacitacion: vi.fn().mockResolvedValue({ activa: true, desde: '2026-11-22T19:00:00Z', pruebas: [] }),
      terminarCapacitacion: vi.fn().mockResolvedValue(4),
      reportesEntre: vi.fn().mockResolvedValue([]),
      estadoPublico: vi.fn().mockResolvedValue([]),
      ciclos: vi.fn().mockResolvedValue([]),
      fueraDeMeta: vi.fn().mockResolvedValue([]),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AdminApi, useValue: api }] });
    store = TestBed.inject(AdminStore);
  });

  it('carga, empieza y termina; al terminar vuelve a cargar los reportes y la vuelta', async () => {
    await store.cargarCapacitacion();
    expect(store.capacitacion()?.activa).toBe(true);
    await store.empezarCapacitacion();
    expect(api['empezarCapacitacion']).toHaveBeenCalled();
    await expect(store.terminarCapacitacion()).resolves.toBe(4);
    expect(store.capacitacion()).toEqual({ activa: false, desde: null, pruebas: [] });
    expect(api['reportesEntre']).toHaveBeenCalled();
    expect(api['estadoPublico']).toHaveBeenCalled();
    store.limpiar();
    expect(store.capacitacion()).toBeNull();
  });

  it('con un servidor sin esta opción no muestra nada nuevo', async () => {
    api['capacitacion'].mockRejectedValue(new Error('404'));
    await store.cargarCapacitacion();
    expect(store.capacitacion()).toBeNull();
  });
});
