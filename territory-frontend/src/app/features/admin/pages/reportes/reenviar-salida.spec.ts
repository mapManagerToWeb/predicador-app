import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Toast } from '../../../../core/services/toast';
import { WhatsAppService } from '../../../../core/services/whatsapp';
import type { ManzanaFeature, ManzanasCollection, ReporteAdmin, SalidaAdmin } from '../../admin.models';
import { AdminApi } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { ReenviarSalida } from './reenviar-salida';

type Senal<T> = ReturnType<typeof signal<T>>;

function manzana(nombre: string, id: number, territorio = 72): ManzanaFeature {
  return {
    type: 'Feature',
    id,
    properties: { id, territorio, nombre } as ManzanaFeature['properties'],
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]] },
  } as ManzanaFeature;
}

const salida: SalidaAdmin = {
  id: 42,
  fecha: '2026-11-05T12:00:00Z',
  encargado: 'Ana Pérez',
  territorio: 72,
  origen: 'salida',
  estado: 'incomplete',
  manzanasIds: '72-72.a,72-72.b',
  geometriaParcial: null,
  puntosParciales: null,
  totalManzanas: 3,
  anuladoEn: null,
  anterior: { estado: 'incomplete', manzanasIds: '72-72.b', geometriaParcial: null, puntosParciales: null },
  posteriores: 0,
};

const reporte: ReporteAdmin = {
  id: 42,
  fecha: '2026-11-05T12:00:00Z',
  inicioSesion: '2026-11-04T19:00:00Z',
  encargadoId: 7,
  encargadoNombre: 'Ana',
  encargadoApellido: 'Pérez',
  territorio: 72,
  estado: 'incomplete',
  totalManzanas: 3,
  manzanasMarcadas: 2,
  origen: 'salida',
  fechaPredicacion: '2026-11-04',
  turno: 'tarde',
} as ReporteAdmin;

/** El mismo envío: el territorio 61 se guardó junto con el 72. */
const reporte61 = { ...reporte, id: 43, territorio: 61, estado: 'completed', totalManzanas: 1, manzanasMarcadas: 1 } as ReporteAdmin;
const salida61: SalidaAdmin = { ...salida, id: 43, territorio: 61, estado: 'completed', manzanasIds: '61-61.a', totalManzanas: 1, anterior: null };

interface Vista {
  error: Senal<string | null>;
  destino: Senal<string>;
  enviando: Senal<boolean>;
  envio(): { reporte: ReporteAdmin }[];
  seleccion(): { reporte: ReporteAdmin }[];
  nombre(): string;
  dia(): string;
  turno(): string;
  manzanas(): ManzanaFeature[];
  estado(): { marcadas: Set<string> };
  base(): { marcadas: Set<string> };
  zonasBloqueadas(): Set<number>;
  colores(): Record<number, string>;
  detalle(r: ReporteAdmin): string;
  alternar(id: number): void;
  reenviar(): Promise<void>;
}

describe('ReenviarSalida', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let whatsapp: { reenviarDesdePanel: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };
  let store: {
    manzanas: Senal<ManzanasCollection | null>;
    todosLosReportes: Senal<ReporteAdmin[] | null>;
    colores: Senal<Record<number, string>>;
    cargarManzanas: ReturnType<typeof vi.fn>;
    cargarReportes: ReturnType<typeof vi.fn>;
  };

  async function montar(): Promise<{ page: Vista; cerrado: ReturnType<typeof vi.fn> }> {
    const fixture = TestBed.createComponent(ReenviarSalida);
    fixture.componentRef.setInput('reporteId', 42);
    const cerrado = vi.fn();
    fixture.componentInstance.cerrar.subscribe(cerrado);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    return { page: fixture.componentInstance as unknown as Vista, cerrado };
  }

  beforeEach(async () => {
    api = {
      salida: vi.fn().mockResolvedValue({ ...salida }),
      whatsappCopia: vi.fn().mockResolvedValue({ telefono: '56987654321' }),
      whatsappDestino: vi.fn().mockResolvedValue({ telefono: '56911112222' }),
    };
    whatsapp = { reenviarDesdePanel: vi.fn().mockResolvedValue({ success: true, messageId: 'm', error: null }) };
    toast = { show: vi.fn() };
    store = {
      manzanas: signal<ManzanasCollection | null>({
        type: 'FeatureCollection',
        features: [manzana('72.a', 1), manzana('72.b', 2), manzana('72.c', 3), manzana('61.a', 4, 61)],
      } as ManzanasCollection),
      todosLosReportes: signal<ReporteAdmin[] | null>([reporte]),
      colores: signal({ 72: '#ec4899' }),
      cargarManzanas: vi.fn().mockResolvedValue(undefined),
      cargarReportes: vi.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [ReenviarSalida],
      providers: [
        { provide: AdminApi, useValue: api },
        { provide: AdminStore, useValue: store },
        { provide: WhatsAppService, useValue: whatsapp },
        { provide: Toast, useValue: toast },
      ],
    })
      .overrideComponent(ReenviarSalida, { set: { template: '', imports: [], schemas: [CUSTOM_ELEMENTS_SCHEMA] } })
      .compileComponents();
  });

  it('muestra cómo quedó el territorio y a qué número llega', async () => {
    const { page } = await montar();
    expect(api['salida']).toHaveBeenCalledWith(42);
    expect(page.nombre()).toBe('Ana Pérez');
    expect(page.dia()).toBe('2026-11-04');
    expect(page.turno()).toBe('tarde');
    expect(page.envio()).toHaveLength(1);
    expect(page.detalle(reporte)).toBe('2 de 3 manzanas');
    expect(page.manzanas()).toHaveLength(3);
    expect([...page.estado().marcadas].sort()).toEqual(['72-72.a', '72-72.b']);
    expect([...page.base().marcadas]).toEqual(['72-72.b']);
    expect(page.zonasBloqueadas().size).toBe(0);
    expect(page.colores()).toEqual({ 72: '#ec4899' });
    expect(page.destino()).toBe('+56 9 8765 4321');
  });

  it('abre el envío completo: todos sus territorios van en un solo mensaje, y se puede quitar uno', async () => {
    store.todosLosReportes.set([reporte, reporte61]);
    api['salida'].mockImplementation(async (id: number) => (id === 43 ? { ...salida61 } : { ...salida }));
    const { page } = await montar();
    expect(page.envio().map(t => t.reporte.territorio)).toEqual([61, 72]);
    expect(page.manzanas()).toHaveLength(4);
    expect([...page.estado().marcadas].sort()).toEqual(['61-61.a', '72-72.a', '72-72.b']);
    expect(page.colores()).toEqual({ 61: '#2563eb', 72: '#ec4899' });
    expect(page.detalle(reporte61)).toBe('completo');

    await page.reenviar();
    expect(whatsapp.reenviarDesdePanel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        territorios: [
          { numero: 61, finalizado: true, totalManzanas: 1, manzanasMarcadas: 1 },
          { numero: 72, finalizado: false, totalManzanas: 3, manzanasMarcadas: 2 },
        ],
      }),
    );

    page.alternar(43);
    expect(page.seleccion().map(t => t.reporte.territorio)).toEqual([72]);
    expect(page.manzanas()).toHaveLength(3);
    page.alternar(42);
    expect(page.seleccion()).toEqual([]);
    whatsapp.reenviarDesdePanel.mockClear();
    await page.reenviar();
    expect(whatsapp.reenviarDesdePanel).not.toHaveBeenCalled();
    page.alternar(43);
    expect(page.seleccion().map(t => t.reporte.territorio)).toEqual([61]);
  });

  it('sin copia dice que llega al número del panel, o al del servidor', async () => {
    api['whatsappCopia'].mockResolvedValue({ telefono: '' });
    let { page } = await montar();
    expect(page.destino()).toBe('+56 9 1111 2222');

    TestBed.resetTestingModule();
    api['whatsappCopia'].mockRejectedValue(new Error('404'));
    api['whatsappDestino'].mockResolvedValue({ telefono: '' });
    await TestBed.configureTestingModule({
      imports: [ReenviarSalida],
      providers: [
        { provide: AdminApi, useValue: api },
        { provide: AdminStore, useValue: store },
        { provide: WhatsAppService, useValue: whatsapp },
        { provide: Toast, useValue: toast },
      ],
    })
      .overrideComponent(ReenviarSalida, { set: { template: '', imports: [], schemas: [CUSTOM_ELEMENTS_SCHEMA] } })
      .compileComponents();
    ({ page } = await montar());
    expect(page.destino()).toBe('el número configurado en el servidor');
  });

  it('reenvía con los datos del reporte y cierra', async () => {
    const { page, cerrado } = await montar();
    await page.reenviar();
    expect(whatsapp.reenviarDesdePanel).toHaveBeenCalledWith({
      encargadoNombre: 'Ana',
      encargadoApellido: 'Pérez',
      fechaRegistro: '04-11-2026',
      predicacion: 'tarde',
      territorios: [{ numero: 72, finalizado: false, totalManzanas: 3, manzanasMarcadas: 2 }],
      screenshotBase64: null,
      destinationNumber: null,
    });
    expect(toast.show).toHaveBeenCalledWith('Reporte reenviado a +56 9 8765 4321', 4000, 'sent');
    expect(cerrado).toHaveBeenCalled();
    expect(page.enviando()).toBe(false);
  });

  it('avisa si WhatsApp no lo pudo enviar o si el servidor falla', async () => {
    const { page, cerrado } = await montar();
    whatsapp.reenviarDesdePanel.mockResolvedValueOnce({ success: false, messageId: null, error: 'x' });
    await page.reenviar();
    expect(toast.show).toHaveBeenCalledWith('No se pudo reenviar el WhatsApp. Inténtalo de nuevo.', 5000, 'error');
    whatsapp.reenviarDesdePanel.mockRejectedValueOnce(new Error('caído'));
    await page.reenviar();
    expect(toast.show).toHaveBeenCalledWith('No se pudo reenviar el WhatsApp', 5000, 'error');
    expect(cerrado).not.toHaveBeenCalled();
  });

  it('si no se puede abrir el reporte lo dice y no envía nada', async () => {
    store.todosLosReportes.set([]);
    const { page } = await montar();
    expect(page.error()).toContain('No se pudo abrir el reporte');
    await page.reenviar();
    expect(whatsapp.reenviarDesdePanel).not.toHaveBeenCalled();
  });

  it('un reporte completo sale como completo, con la fecha del envío si no trae día', async () => {
    store.todosLosReportes.set([{ ...reporte, estado: 'completed', fechaPredicacion: null, turno: null, encargadoApellido: null, totalManzanas: null, manzanasMarcadas: null } as unknown as ReporteAdmin]);
    api['salida'].mockResolvedValue({ ...salida, estado: 'completed', anterior: null });
    const { page } = await montar();
    expect(page.envio()[0].reporte.estado).toBe('completed');
    expect(page.turno()).toBe('');
    expect(page.nombre()).toBe('Ana');
    expect(page.dia()).toMatch(/^2026-11-0[45]$/);
    await page.reenviar();
    expect(whatsapp.reenviarDesdePanel).toHaveBeenCalledWith(
      expect.objectContaining({ predicacion: '', territorios: [{ numero: 72, finalizado: true, totalManzanas: 3, manzanasMarcadas: 0 }] }),
    );
  });
});
