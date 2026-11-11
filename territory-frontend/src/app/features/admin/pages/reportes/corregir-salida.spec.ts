import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Toast } from '../../../../core/services/toast';
import type { ManzanaFeature, ManzanasCollection, SalidaAdmin } from '../../admin.models';
import { AdminApi } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { AdminUi } from '../../services/admin-ui';
import { CorregirSalida } from './corregir-salida';

type Senal<T> = ReturnType<typeof signal<T>>;

function manzana(nombre: string, id: number, territorio = 72): ManzanaFeature {
  return {
    type: 'Feature',
    id,
    properties: { id, territorio, nombre } as ManzanaFeature['properties'],
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]] },
  } as ManzanaFeature;
}

const manzanas = signal<ManzanasCollection | null>({
  type: 'FeatureCollection',
  features: [manzana('72.c', 3), manzana('72.a', 1), manzana('72.b', 2), manzana('61.a', 4, 61)],
} as ManzanasCollection);

const salida: SalidaAdmin = {
  id: 42,
  fecha: '2026-11-05T12:00:00Z',
  encargado: 'Ana Pérez',
  territorio: 72,
  origen: 'salida',
  estado: 'incomplete',
  manzanasIds: '72-72.a',
  geometriaParcial: null,
  puntosParciales: null,
  totalManzanas: 3,
  anuladoEn: null,
  anterior: { estado: 'incomplete', manzanasIds: '72-72.b', geometriaParcial: null, puntosParciales: null },
  posteriores: 2,
  fechaPredicacion: '2026-11-04',
  turno: 'tarde',
};

interface VistaCorreccion {
  salida: Senal<SalidaAdmin | null>;
  cargando: Senal<boolean>;
  guardando: Senal<boolean>;
  error: Senal<string | null>;
  nota: Senal<string>;
  dia: Senal<string>;
  turno: Senal<string>;
  base: Senal<{ marcadas: Set<string>; zonas: unknown[] }>;
  edicion: Senal<{ marcadas: Set<string>; zonas: unknown[] }>;
  manzanas(): ManzanaFeature[];
  color(): string;
  zonasBloqueadas(): Set<number>;
  aporte(): { enteras: number; porCalles: number };
  aporteOriginal(): { enteras: number; porCalles: number };
  hayCambios(): boolean;
  alTocarManzana(m: ManzanaFeature): void;
  alTocarZona(i: number): void;
  deshacer(): void;
  guardar(anular: boolean): Promise<void>;
}

describe('CorregirSalida', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let ui: { confirmar: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };
  let store: {
    manzanas: Senal<ManzanasCollection | null>;
    colores: Senal<Record<number, string>>;
    cargarManzanas: ReturnType<typeof vi.fn>;
    cargarReportes: ReturnType<typeof vi.fn>;
  };

  async function montar(reporteId = 42): Promise<{ page: VistaCorreccion; cerrado: ReturnType<typeof vi.fn> }> {
    const fixture = TestBed.createComponent(CorregirSalida);
    fixture.componentRef.setInput('reporteId', reporteId);
    const cerrado = vi.fn();
    fixture.componentInstance.cerrar.subscribe(cerrado);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return { page: fixture.componentInstance as unknown as VistaCorreccion, cerrado };
  }

  beforeEach(async () => {
    Element.prototype.scrollIntoView = vi.fn();
    api = {
      salida: vi.fn().mockResolvedValue({ ...salida }),
      corregirSalida: vi.fn().mockResolvedValue({ anulado: 42, reemplazo: 43, recalculados: 2, detenido: false }),
    };
    ui = { confirmar: vi.fn().mockResolvedValue(true) };
    toast = { show: vi.fn() };
    store = {
      manzanas,
      colores: signal({ 72: '#ec4899' }),
      cargarManzanas: vi.fn().mockResolvedValue(undefined),
      cargarReportes: vi.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [CorregirSalida],
      providers: [
        { provide: AdminApi, useValue: api },
        { provide: AdminStore, useValue: store },
        { provide: AdminUi, useValue: ui },
        { provide: Toast, useValue: toast },
      ],
    })
      .overrideComponent(CorregirSalida, { set: { template: '', imports: [], schemas: [CUSTOM_ELEMENTS_SCHEMA] } })
      .compileComponents();
  });

  it('carga la salida, separa lo que ya estaba antes y toma día y turno', async () => {
    const { page } = await montar();
    expect(api['salida']).toHaveBeenCalledWith(42);
    expect(store.cargarManzanas).toHaveBeenCalled();
    expect(page.cargando()).toBe(false);
    expect([...page.base().marcadas]).toEqual(['72-72.b']);
    expect([...page.edicion().marcadas]).toEqual(['72-72.a']);
    expect(page.dia()).toBe('2026-11-04');
    expect(page.turno()).toBe('tarde');
    expect(page.hayCambios()).toBe(false);
  });

  it('usa el día del envío cuando el reporte no trae fecha de predicación', async () => {
    api['salida'].mockResolvedValue({ ...salida, fechaPredicacion: null, turno: null });
    const { page } = await montar();
    expect(page.dia()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(page.turno()).toBe('');
  });

  it('guarda el error cuando no se puede abrir el reporte', async () => {
    api['salida'].mockRejectedValue(new Error('caído'));
    const { page } = await montar();
    expect(page.error()).toContain('No se pudo abrir el reporte');
    expect(page.cargando()).toBe(false);
  });

  it('solo muestra las manzanas del territorio, ordenadas por nombre', async () => {
    const { page } = await montar();
    expect(page.manzanas().map(m => m.properties.nombre)).toEqual(['72.a', '72.b', '72.c']);
    expect(page.color()).toBe('#ec4899');
  });

  it('usa el color por defecto cuando el territorio no tiene uno', async () => {
    store.colores.set({});
    const { page } = await montar();
    expect(page.color()).toBe('#2563eb');
  });

  it('marca y desmarca manzanas de la salida, sin tocar lo que ya estaba antes', async () => {
    const { page } = await montar();
    page.alTocarManzana(page.manzanas()[2]);
    expect(page.edicion().marcadas.has('72-72.c')).toBe(true);
    expect(page.hayCambios()).toBe(true);
    expect(page.aporte()).toEqual({ enteras: 2, porCalles: 0 });

    page.alTocarManzana(page.manzanas()[0]);
    expect(page.edicion().marcadas.has('72-72.a')).toBe(false);
    expect(page.aporte()).toEqual({ enteras: 1, porCalles: 0 });

    const antes = [...page.edicion().marcadas];
    page.alTocarManzana(page.manzanas()[1]);
    expect([...page.edicion().marcadas]).toEqual(antes);
  });

  it('quita zonas y deshace todos los cambios', async () => {
    const { page } = await montar();
    const original = [...page.edicion().marcadas];
    page.alTocarManzana(page.manzanas()[2]);
    page.dia.set('2026-11-01');
    page.turno.set('mañana');
    page.alTocarZona(0);
    expect(page.zonasBloqueadas().size).toBe(0);

    page.deshacer();
    expect([...page.edicion().marcadas]).toEqual(original);
    expect(page.dia()).toBe('2026-11-04');
    expect(page.turno()).toBe('tarde');
    expect(page.hayCambios()).toBe(false);
  });

  it('no guarda una corrección si no hay cambios', async () => {
    const { page } = await montar();
    await page.guardar(false);
    expect(ui.confirmar).not.toHaveBeenCalled();
    expect(api['corregirSalida']).not.toHaveBeenCalled();
  });

  it('no guarda nada si no hay reporte cargado', async () => {
    const fixture = TestBed.createComponent(CorregirSalida);
    const page = fixture.componentInstance as unknown as VistaCorreccion;
    await page.guardar(true);
    expect(api['corregirSalida']).not.toHaveBeenCalled();
  });

  it('guarda la corrección con día y turno elegidos', async () => {
    const { page, cerrado } = await montar();
    page.alTocarManzana(page.manzanas()[2]);
    page.nota.set('  se equivocó de manzana  ');
    page.dia.set('2026-11-03');
    page.turno.set('mañana');
    await page.guardar(false);

    expect(ui.confirmar).toHaveBeenCalledWith(expect.objectContaining({ accion: 'Guardar corrección' }));
    expect(api['corregirSalida']).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        anular: false,
        manzanasIds: '72-72.a,72-72.c',
        nota: 'se equivocó de manzana',
        fechaPredicacion: '2026-11-03',
        turno: 'mañana',
      }),
    );
    expect(store.cargarReportes).toHaveBeenCalledWith(true);
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('Se recalcularon 2 reporte(s)'), 6000, 'success');
    expect(cerrado).toHaveBeenCalledWith(true);
    expect(page.guardando()).toBe(false);
  });

  it('anula el reporte entero sin mandar manzanas', async () => {
    const { page } = await montar();
    api['corregirSalida'].mockResolvedValue({ anulado: 42, reemplazo: null, recalculados: 0, detenido: true });
    await page.guardar(true);

    expect(ui.confirmar).toHaveBeenCalledWith(expect.objectContaining({ accion: 'Anular reporte', peligro: true }));
    expect(api['corregirSalida']).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ anular: true, manzanasIds: null, geometriaParcial: null, puntosParciales: null, fechaPredicacion: null, turno: null }),
    );
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('Reporte anulado.'), 6000, 'success');
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('no se tocó'), 6000, 'success');
  });

  it('no hace nada si se cancela la confirmación', async () => {
    const { page } = await montar();
    page.alTocarManzana(page.manzanas()[2]);
    ui.confirmar.mockResolvedValueOnce(false);
    await page.guardar(false);
    expect(api['corregirSalida']).not.toHaveBeenCalled();
  });

  it('avisa si el servidor rechaza la corrección', async () => {
    const { page } = await montar();
    page.alTocarManzana(page.manzanas()[2]);
    api['corregirSalida'].mockRejectedValue(new Error('caído'));
    await page.guardar(false);
    expect(toast.show).toHaveBeenCalledWith(expect.any(String), 6000, 'error');
    expect(page.guardando()).toBe(false);
  });
});
