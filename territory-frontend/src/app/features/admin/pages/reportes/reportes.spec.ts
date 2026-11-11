import { ElementRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Toast } from '../../../../core/services/toast';
import type { EnvioWhatsApp, ReporteAdmin } from '../../admin.models';
import { AdminApi } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { AdminUi } from '../../services/admin-ui';
import { ReportesPage } from './reportes';

type Senal<T> = ReturnType<typeof signal<T>>;

interface VistaReportes {
  vista: Senal<string>;
  cargando: Senal<boolean>;
  error: Senal<string | null>;
  desde: Senal<string>;
  hasta: Senal<string>;
  territorio: Senal<number | null>;
  encargado: Senal<string>;
  estado: Senal<string>;
  soloDuplicados: Senal<boolean>;
  pagina: Senal<number>;
  marcados: Senal<Set<number>>;
  envios: Senal<EnvioWhatsApp[] | null>;
  encargados(): { clave: string; nombre: string }[];
  filtrados(): ReporteAdmin[];
  paginas(): number;
  visibles(): ReporteAdmin[];
  todosMarcados(): boolean;
  ciclos(): { territorio: number }[];
  fallidos(): number;
  cantidadDuplicados(): number;
  cargar(forzar?: boolean): Promise<void>;
  abrir(v: string): Promise<void>;
  cargarEnvios(): Promise<void>;
  setFiltro(f: string, e: Event): void;
  valor(e: Event): string;
  numero(e: Event): number | null;
  limpiarFiltros(): void;
  marcar(id: number, e: Event): void;
  marcarPagina(e: Event): void;
  marcarDuplicados(): void;
  eliminarMarcados(): Promise<void>;
  corregible(r: ReporteAdmin): boolean;
  predicacion(r: ReporteAdmin): string;
  enviadoOtroDia(r: ReporteAdmin): boolean;
  exportarReportes(): void;
  exportarRegistro(): void;
  minutos(r: ReporteAdmin): number | null;
  esDuplicado(r: ReporteAdmin): boolean;
}

let secuencia = 1;

function reporte(p: Partial<ReporteAdmin> = {}): ReporteAdmin {
  const fecha = p.fecha ?? new Date().toISOString();
  return {
    id: secuencia++,
    fecha,
    inicioSesion: null,
    encargadoId: 1,
    encargadoNombre: 'Ana',
    encargadoApellido: 'Pérez',
    territorio: 1,
    estado: 'incomplete',
    tipoSesion: 'parcial',
    totalManzanas: 4,
    manzanasMarcadas: 2,
    manzanasIds: '1,2',
    tieneParcial: false,
    ...p,
  };
}

describe('ReportesPage', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let ui: { confirmar: ReturnType<typeof vi.fn> };
  let toast: { show: ReturnType<typeof vi.fn> };
  let store: AdminStore;

  async function montar(): Promise<VistaReportes> {
    const page = TestBed.runInInjectionContext(() => new ReportesPage()) as unknown as VistaReportes;
    await new Promise(r => setTimeout(r, 0));
    return page;
  }

  beforeEach(() => {
    secuencia = 1;
    api = {
      eliminarReportes: vi.fn().mockResolvedValue({ eliminados: 1 }),
      enviosWhatsApp: vi.fn().mockResolvedValue([]),
    };
    ui = { confirmar: vi.fn().mockResolvedValue(true) };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminApi, useValue: api },
        { provide: AdminUi, useValue: ui },
        { provide: Toast, useValue: toast },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
    store = TestBed.inject(AdminStore);
    vi.spyOn(store, 'cargarReportes').mockResolvedValue();
    vi.spyOn(store, 'cargarManzanas').mockResolvedValue();
  });

  it('carga los reportes y guarda el error si falla', async () => {
    const page = await montar();
    expect(store.cargarReportes).toHaveBeenCalled();
    expect(page.cargando()).toBe(false);
    expect(page.error()).toBeNull();

    vi.spyOn(store, 'cargarReportes').mockRejectedValueOnce(new Error('sin red'));
    await page.cargar(true);
    expect(page.error()).toContain('No se pudieron cargar los reportes');
    expect(page.cargando()).toBe(false);
  });

  it('abre la vista de WhatsApp y carga los envíos una sola vez', async () => {
    const page = await montar();
    await page.abrir('reportes');
    expect(api['enviosWhatsApp']).not.toHaveBeenCalled();

    api['enviosWhatsApp'].mockResolvedValue([
      { id: '1', fecha: null, estado: 'FAILED', exito: false, messageId: null, error: 'x', statusCode: 500 },
      { id: '2', fecha: null, estado: 'SENT', exito: true, messageId: 'm', error: null, statusCode: 200 },
    ]);
    await page.abrir('whatsapp');
    expect(page.vista()).toBe('whatsapp');
    expect(page.envios()).toHaveLength(2);
    expect(page.fallidos()).toBe(1);

    await page.abrir('whatsapp');
    expect(api['enviosWhatsApp']).toHaveBeenCalledTimes(1);
  });

  it('avisa si no se pueden cargar los envíos', async () => {
    const page = await montar();
    api['enviosWhatsApp'].mockRejectedValue(new Error('caído'));
    await page.cargarEnvios();
    expect(toast.show).toHaveBeenCalledWith(expect.any(String), 5000, 'error');
  });

  it('aplica cada filtro y reinicia la página y la selección', async () => {
    const page = await montar();
    page.pagina.set(3);
    page.marcados.set(new Set([1]));

    page.setFiltro('desde', { target: { value: '2026-01-01' } } as unknown as Event);
    expect(page.desde()).toBe('2026-01-01');

    page.setFiltro('hasta', { target: { value: '2026-02-01' } } as unknown as Event);
    expect(page.hasta()).toBe('2026-02-01');

    page.setFiltro('territorio', { target: { value: '7' } } as unknown as Event);
    expect(page.territorio()).toBe(7);

    page.setFiltro('encargado', { target: { value: 'id:2' } } as unknown as Event);
    expect(page.encargado()).toBe('id:2');

    page.setFiltro('estado', { target: { value: 'completos' } } as unknown as Event);
    expect(page.estado()).toBe('completos');

    page.setFiltro('duplicados', { target: { checked: true } } as unknown as Event);
    expect(page.soloDuplicados()).toBe(true);
    expect(page.pagina()).toBe(0);
    expect(page.marcados().size).toBe(0);
  });

  it('lee el valor y el número de un evento, con vacío y no numérico en null', () => {
    const page = TestBed.runInInjectionContext(() => new ReportesPage()) as unknown as VistaReportes;
    expect(page.valor({ target: { value: 'abc' } } as unknown as Event)).toBe('abc');
    expect(page.numero({ target: { value: ' 12 ' } } as unknown as Event)).toBe(12);
    expect(page.numero({ target: { value: '12.9' } } as unknown as Event)).toBe(12);
    expect(page.numero({ target: { value: '' } } as unknown as Event)).toBeNull();
    expect(page.numero({ target: { value: 'x' } } as unknown as Event)).toBeNull();
  });

  it('limpia todos los filtros', async () => {
    const page = await montar();
    page.desde.set('2026-01-01');
    page.hasta.set('2026-02-01');
    page.territorio.set(7);
    page.encargado.set('id:2');
    page.estado.set('parciales');
    page.soloDuplicados.set(true);
    page.pagina.set(2);
    page.marcados.set(new Set([1]));

    page.limpiarFiltros();
    expect(page.desde()).toBe('');
    expect(page.hasta()).toBe('');
    expect(page.territorio()).toBeNull();
    expect(page.encargado()).toBe('todos');
    expect(page.estado()).toBe('todos');
    expect(page.soloDuplicados()).toBe(false);
    expect(page.pagina()).toBe(0);
    expect(page.marcados().size).toBe(0);
  });

  it('filtra por fecha, territorio, encargado, estado y duplicados', async () => {
    const uno = reporte({ territorio: 5, estado: 'completed', fecha: '2026-01-10T12:00:00Z', fechaPredicacion: '2026-01-10' });
    const dos = reporte({
      territorio: 6,
      encargadoId: null,
      encargadoNombre: 'Luis',
      encargadoApellido: 'Rojas',
      fecha: '2026-02-10T12:00:00Z',
      fechaPredicacion: '2026-02-10',
    });
    const dup = { ...uno, id: 900, fecha: '2026-01-10T12:00:20Z' };
    store.todosLosReportes.set([uno, dos, dup]);
    const page = await montar();

    expect(page.filtrados()).toHaveLength(3);
    expect(page.encargados()).toEqual([
      { clave: 'id:1', nombre: 'Ana Pérez' },
      { clave: 'nombre:luis rojas', nombre: 'Luis Rojas' },
    ]);

    page.desde.set('2026-02-01');
    expect(page.filtrados().map(r => r.id)).toEqual([dos.id]);
    page.desde.set('');
    page.hasta.set('2026-01-31');
    expect(page.filtrados().map(r => r.id)).toEqual([dup.id, uno.id]);
    page.hasta.set('');

    page.territorio.set(6);
    expect(page.filtrados().map(r => r.id)).toEqual([dos.id]);
    page.territorio.set(null);

    page.encargado.set('nombre:luis rojas');
    expect(page.filtrados().map(r => r.id)).toEqual([dos.id]);
    page.encargado.set('todos');

    page.estado.set('completos');
    expect(page.filtrados().map(r => r.id)).toEqual([dup.id, uno.id]);
    page.estado.set('parciales');
    expect(page.filtrados().map(r => r.id)).toEqual([dos.id]);
    page.estado.set('todos');

    page.soloDuplicados.set(true);
    expect(page.filtrados().map(r => r.id)).toEqual([dup.id]);
    expect(page.cantidadDuplicados()).toBe(1);
    expect(page.esDuplicado(dup)).toBe(true);
    expect(page.esDuplicado(dos)).toBe(false);
  });

  it('pagina el listado y marca toda la página visible', async () => {
    store.todosLosReportes.set(Array.from({ length: 120 }, (_, i) => reporte({ territorio: i + 1 })));
    const page = await montar();
    expect(page.paginas()).toBe(3);
    expect(page.visibles()).toHaveLength(50);
    expect(page.todosMarcados()).toBe(false);

    page.marcarPagina({ target: { checked: true } } as unknown as Event);
    expect(page.marcados().size).toBe(50);
    expect(page.todosMarcados()).toBe(true);

    page.pagina.set(2);
    expect(page.visibles()).toHaveLength(20);
    page.marcarPagina({ target: { checked: false } } as unknown as Event);
    expect(page.marcados().size).toBe(50);

    page.pagina.set(0);
    page.marcarPagina({ target: { checked: false } } as unknown as Event);
    expect(page.marcados().size).toBe(0);
  });

  it('marca y desmarca reportes individuales', async () => {
    store.todosLosReportes.set([reporte(), reporte()]);
    const page = await montar();
    page.marcar(1, { target: { checked: true } } as unknown as Event);
    expect([...page.marcados()]).toEqual([1]);
    page.marcar(2, { target: { checked: true } } as unknown as Event);
    expect([...page.marcados()].sort()).toEqual([1, 2]);
    page.marcar(1, { target: { checked: false } } as unknown as Event);
    expect([...page.marcados()]).toEqual([2]);
  });

  it('elimina los marcados y pide escribir ELIMINAR cuando son más de cinco', async () => {
    store.todosLosReportes.set(Array.from({ length: 8 }, () => reporte()));
    const page = await montar();
    page.marcados.set(new Set([1, 2, 3, 4, 5, 6]));
    await page.eliminarMarcados();
    expect(ui.confirmar).toHaveBeenCalledWith(expect.objectContaining({ escribir: 'ELIMINAR' }));
    expect(api['eliminarReportes']).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6]);
    expect(page.marcados().size).toBe(0);
    expect(toast.show).toHaveBeenCalledWith('1 reporte(s) eliminados', 3000, 'success');
    expect(store.todosLosReportes()?.some(r => r.id <= 6)).toBe(false);
  });

  it('no elimina sin selección, si se cancela, y avisa si falla', async () => {
    const page = await montar();
    await page.eliminarMarcados();
    expect(ui.confirmar).not.toHaveBeenCalled();

    page.marcados.set(new Set([1]));
    ui.confirmar.mockResolvedValueOnce(false);
    await page.eliminarMarcados();
    expect(api['eliminarReportes']).not.toHaveBeenCalled();

    ui.confirmar.mockResolvedValueOnce(true);
    api['eliminarReportes'].mockRejectedValueOnce(new Error('caído'));
    await page.eliminarMarcados();
    expect(toast.show).toHaveBeenCalledWith(expect.any(String), 6000, 'error');
  });

  it('marca duplicados limpiando los filtros que los ocultarían', async () => {
    const a = reporte({ territorio: 5, fecha: '2026-01-10T12:00:00Z' });
    const dup = { ...a, id: 700, fecha: '2026-01-10T12:00:20Z' };
    store.todosLosReportes.set([a, dup, reporte({ territorio: 6, fecha: '2026-01-11T12:00:00Z' })]);
    const page = await montar();
    page.territorio.set(6);
    page.marcarDuplicados();
    expect(page.territorio()).toBeNull();
    expect(page.soloDuplicados()).toBe(true);
    expect([...page.marcados()]).toEqual([700]);
  });

  it('solo se corrigen salidas vigentes', async () => {
    const page = await montar();
    expect(page.corregible(reporte({ origen: 'salida' }))).toBe(true);
    expect(page.corregible(reporte({ origen: undefined }))).toBe(true);
    expect(page.corregible(reporte({ origen: 'correccion' }))).toBe(false);
    expect(page.corregible(reporte({ anuladoEn: '2026-01-01' }))).toBe(false);
  });

  it('muestra el día de predicación con turno y detecta envíos de otro día', async () => {
    const page = await montar();
    expect(page.predicacion(reporte({ fecha: '2026-11-05T12:00:00Z' }))).toContain('05-11-2026');
    expect(
      page.predicacion(reporte({ fecha: '2026-11-05T12:00:00Z', fechaPredicacion: '2026-11-04', turno: 'tarde' })),
    ).toBe('04-11-2026 · tarde');
    expect(
      page.predicacion(reporte({ fecha: '2026-11-05T12:00:00Z', fechaPredicacion: '2026-11-04', turno: null })),
    ).toBe('04-11-2026');

    expect(page.enviadoOtroDia(reporte({ fecha: '2026-11-05T12:00:00Z', fechaPredicacion: '2026-11-04' }))).toBe(true);
    expect(page.enviadoOtroDia(reporte({ fecha: '2026-11-05T12:00:00Z' }))).toBe(false);
  });

  it('calcula la duración de la salida dentro del rango razonable', async () => {
    const page = await montar();
    expect(page.minutos(reporte())).toBeNull();
    const base = new Date('2026-11-05T12:00:00Z');
    expect(page.minutos(reporte({ fecha: base.toISOString(), inicioSesion: new Date(base.getTime() - 30 * 60_000).toISOString() }))).toBe(30);
    expect(page.minutos(reporte({ fecha: base.toISOString(), inicioSesion: new Date(base.getTime() - 20 * 3_600_000).toISOString() }))).toBeNull();
    expect(page.minutos(reporte({ fecha: base.toISOString(), inicioSesion: new Date(base.getTime() - 10_000).toISOString() }))).toBeNull();
  });

  it('exporta el listado filtrado y el registro de territorios', async () => {
    store.todosLosReportes.set([
      reporte({ territorio: 5, estado: 'completed', fecha: '2026-01-10T12:00:00Z', fechaPredicacion: '2026-01-10', turno: 'tarde' }),
      reporte({ territorio: 6, fecha: '2026-01-11T12:00:00Z', fechaPredicacion: '2026-01-11' }),
    ]);
    const page = await montar();
    const crear = vi.fn().mockReturnValue('blob:x');
    Object.defineProperty(URL, 'createObjectURL', { value: crear, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    const click = vi.fn();
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = click;

    page.exportarReportes();
    page.exportarRegistro();

    HTMLAnchorElement.prototype.click = original;
    expect(crear).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledTimes(2);
  });

  it('arma los ciclos del registro y los filtra por territorio', async () => {
    store.todosLosReportes.set([
      reporte({ territorio: 5, fecha: '2026-01-10T12:00:00Z', fechaPredicacion: '2026-01-10', estado: 'completed' }),
      reporte({ territorio: 6, fecha: '2026-01-11T12:00:00Z', fechaPredicacion: '2026-01-11', estado: 'completed' }),
    ]);
    const page = await montar();
    expect(page.ciclos().map(c => c.territorio).sort()).toEqual([5, 6]);
  });
});
