import { TestBed } from '@angular/core/testing';
import type { CicloAdmin, ManzanasCollection, ReporteAdmin } from '../../admin.models';
import { AdminApi } from '../../services/admin-api';
import { AdminUi } from '../../services/admin-ui';
import { S13Page } from './s13';
import { Toast } from '../../../../core/services/toast';

const descargar = vi.fn();
vi.mock('../../utils/csv', async original => ({ ...(await original<typeof import('../../utils/csv')>()), descargar: (...a: unknown[]) => descargar(...a) }));
vi.mock('../../map/correccion-map', async () => {
  const { Component, input, output } = await import('@angular/core');
  @Component({ selector: 'app-correccion-map', template: '' })
  class CorreccionMapFalso {
    readonly manzanas = input<unknown>();
    readonly estado = input<unknown>();
    readonly color = input<string>();
    readonly manzanaClick = output<unknown>();
    readonly zonaClick = output<number>();
  }
  return { CorreccionMap: CorreccionMapFalso };
});

const cuadro = { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
const MANZANAS: ManzanasCollection = {
  type: 'FeatureCollection',
  features: ['a', 'b'].map((l, i) => ({
    type: 'Feature', id: i + 1, geometry: cuadro,
    properties: { id: i + 1, territorio: 9, nombre: `9.${l}`, areaM2: 1, valida: true },
  })),
};
const hoy = new Date();
const iso = (diasAtras: number) => new Date(hoy.getTime() - diasAtras * 86_400_000).toISOString();
const REPORTES: ReporteAdmin[] = [
  { id: 1, fecha: iso(5), inicioSesion: null, encargadoId: 1, encargadoNombre: 'Ana', encargadoApellido: 'Soto', territorio: 9,
    estado: 'completed', tipoSesion: 'completa', totalManzanas: 2, manzanasMarcadas: 2, manzanasIds: '9-9.a,9-9.b', tieneParcial: false, origen: 'salida' },
];
const CICLO: CicloAdmin = { id: 1, inicio: iso(30), fin: null, nota: null, resumen: null };

describe('S13Page', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let ui: AdminUi;

  async function crear() {
    const fixture = TestBed.createComponent(S13Page);
    await fixture.whenStable();
    await vi.waitFor(() => expect(api['ciclos']).toHaveBeenCalled());
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    descargar.mockClear();
    api = {
      manzanas: vi.fn().mockResolvedValue(MANZANAS),
      colores: vi.fn().mockResolvedValue({ 9: '#f00' }),
      reportesEntre: vi.fn().mockResolvedValue(REPORTES),
      ciclos: vi.fn().mockResolvedValue([CICLO]),
      cerrarCiclo: vi.fn().mockResolvedValue({ ...CICLO, id: 2 }),
      cambiarInicioCiclo: vi.fn().mockResolvedValue({ ciclo: CICLO, enLaVueltaAnterior: 2 }),
      estadoTerritorio: vi.fn().mockResolvedValue({
        territorio: 9, fecha: iso(5), estado: 'completed', origen: 'salida', encargado: 'Ana Soto',
        manzanasIds: '9-9.a,9-9.b', geometriaParcial: null, puntosParciales: null, totalManzanas: 2,
      }),
      corregir: vi.fn().mockResolvedValue({ id: 50 }),
    };
    TestBed.configureTestingModule({ imports: [S13Page], providers: [{ provide: AdminApi, useValue: api }] });
    ui = TestBed.inject(AdminUi);
  });

  it('muestra las asignaciones del año y descarga el S-13 en Word', async () => {
    const { el } = await crear();
    expect(el.querySelector('table.s13')?.textContent).toContain('Ana Soto');
    (Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Descargar S-13 (Word)')) as HTMLButtonElement).click();
    expect(descargar).toHaveBeenCalledWith(expect.stringMatching(/^S-13 año de servicio \d{4}\.docx$/), expect.any(Uint8Array), expect.stringContaining('wordprocessingml'));
  });

  it('cerrar el ciclo pide confirmación y lo cierra', async () => {
    const { fixture, el } = await crear();
    (Array.from(el.querySelectorAll('[role=tab]')).find(b => b.textContent?.includes('Ciclo actual')) as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el.textContent).toContain('1 / 1');
    (Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Cerrar ciclo y reiniciar')) as HTMLButtonElement).click();
    expect(ui.confirmacion()?.escribir).toBe('REINICIAR');
    expect(api['cerrarCiclo']).not.toHaveBeenCalled();
    ui.responder(true);
    // Sin elegir otro día, la vuelta nueva empieza hoy (no se manda fecha).
    await vi.waitFor(() => expect(api['cerrarCiclo']).toHaveBeenCalledWith(null, null));
  });

  it('cerrar el ciclo desde un día anterior (inicio de una campaña) manda ese día', async () => {
    const { fixture, el } = await crear();
    (Array.from(el.querySelectorAll('[role=tab]')).find(b => b.textContent?.includes('Ciclo actual')) as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    const fecha = el.querySelector('input[type=date]') as HTMLInputElement;
    const hace3 = new Date();
    hace3.setDate(hace3.getDate() - 3);
    const dia = `${hace3.getFullYear()}-${String(hace3.getMonth() + 1).padStart(2, '0')}-${String(hace3.getDate()).padStart(2, '0')}`;
    fecha.value = dia;
    fecha.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Cerrar ciclo y reiniciar')) as HTMLButtonElement).click();
    expect(ui.confirmacion()?.mensaje).toContain('La vuelta nueva empezará el');
    ui.responder(true);
    await vi.waitFor(() => expect(api['cerrarCiclo']).toHaveBeenCalledWith(null, dia));
  });

  it('corregir: desmarcar una manzana y guardar manda el nuevo estado', async () => {
    const { fixture, el } = await crear();
    (Array.from(el.querySelectorAll('[role=tab]')).find(b => b.textContent?.includes('Corregir')) as HTMLButtonElement).click();
    await fixture.whenStable();
    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = '9';
    select.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(el.querySelectorAll('.manzanas li')).toHaveLength(2));
    await fixture.whenStable();
    (el.querySelector('.manzanas li button') as HTMLButtonElement).click();
    await fixture.whenStable();
    (Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Guardar corrección')) as HTMLButtonElement).click();
    ui.responder(true);
    await vi.waitFor(() =>
      expect(api['corregir']).toHaveBeenCalledWith(expect.objectContaining({ territorio: 9, manzanasIds: '9-9.b', totalManzanas: 2, manzanasMarcadas: 1 })),
    );
  });

  it('corrige el día en que empezó la vuelta actual y avisa si hay reportes que quedaron en la anterior', async () => {
    const { fixture, el } = await crear();
    (Array.from(el.querySelectorAll('[role=tab]')).find(b => b.textContent?.includes('Ciclo actual')) as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    (Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Cambiar el día en que empezó')) as HTMLButtonElement).click();
    fixture.detectChanges();
    const fecha = el.querySelector('.cambiar-inicio input[type=date]') as HTMLInputElement;
    fecha.value = '2026-11-07';
    fecha.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (Array.from(el.querySelectorAll('.cambiar-inicio button')).find(b => b.textContent?.includes('Guardar')) as HTMLButtonElement).click();
    expect(ui.confirmacion()?.mensaje).toContain('No se cierra otro ciclo');
    const aviso = vi.spyOn(TestBed.inject(Toast), 'show');
    ui.responder(true);
    await vi.waitFor(() => expect(api['cambiarInicioCiclo']).toHaveBeenCalledWith('2026-11-07'));
    await vi.waitFor(() => expect(aviso).toHaveBeenCalledWith(expect.stringContaining('2 reporte(s)'), 12000, 'warning'));
  });

  describe('lógica de la página', () => {
    type Pagina = Record<string, unknown> & {
      vista(): string;
      anio(): number;
      error(): string | null;
      territorioSel(): number | null;
      edicion(): { marcadas: Set<string>; zonas: { manzanaId?: string }[] };
      hayCambios(): boolean;
      modo(): string;
      manzanaCalles(): { properties: { nombre: string } } | null;
      calles(): { marcada: boolean }[] | null;
      cargando(): boolean;
    };
    const llamar = (p: Pagina, metodo: string, ...args: unknown[]) => (p[metodo] as (...a: unknown[]) => unknown)(...args);
    const cerrado = (resumen: string | null): CicloAdmin => ({ id: 3, inicio: '2026-03-01T03:00:00Z', fin: '2026-06-01T04:00:00Z', nota: null, resumen });
    const territorio = (cambios: object) => ({
      territorio: 9, estado: 'completed', manzanasMarcadas: 2, totalManzanas: 2, completado: ['2026-04-02T12:00:00Z'],
      primeraSalida: '2026-03-05T12:00:00Z', ultimaSalida: '2026-04-02T12:00:00Z', encargados: ['Ana Soto'], ...cambios,
    });
    let toast: { show: ReturnType<typeof vi.fn> };

    async function pagina(): Promise<Pagina> {
      toast = TestBed.inject(Toast) as unknown as { show: ReturnType<typeof vi.fn> };
      vi.spyOn(toast, 'show');
      const { fixture } = await crear();
      return fixture.componentInstance as unknown as Pagina;
    }

    it('el informe de un ciclo cerrado: resumen, duración, textos y CSV', async () => {
      const p = await pagina();
      const c = cerrado(JSON.stringify([territorio({}), territorio({ territorio: 10, estado: 'incomplete', manzanasMarcadas: 1, totalManzanas: null, completado: [] }), territorio({ territorio: 11, estado: 'reiniciado', completado: [] })]));
      expect(llamar(p, 'completadosEn', c)).toBe(1);
      expect(llamar(p, 'duracion', c)).toBe(92);
      const [t9, t10, t11] = llamar(p, 'resumen', c) as ReturnType<typeof territorio>[];
      expect(llamar(p, 'estadoTexto', t9)).toBe('Completo');
      expect(llamar(p, 'estadoTexto', t10)).toBe('1 de ? manzanas');
      expect(llamar(p, 'estadoTexto', t11)).toBe('Sin trabajar');
      expect(llamar(p, 'fechasCompletado', t9)).toMatch(/2026/);
      // Un resumen dañado o ausente no rompe la página.
      expect(llamar(p, 'resumen', cerrado('{roto'))).toEqual([]);
      expect(llamar(p, 'resumen', cerrado(null))).toEqual([]);
      llamar(p, 'descargarInforme', c);
      const [nombre, csv] = descargar.mock.calls.at(-1)!;
      expect(nombre).toBe('informe-ciclo-2026-03-01.csv');
      expect(csv).toContain('Ana Soto');
      expect(csv).toContain('Sin trabajar');
    });

    it('descarga el S-13 de un ciclo, abierto o cerrado', async () => {
      const p = await pagina();
      llamar(p, 'descargarS13Ciclo', cerrado(null));
      expect(descargar.mock.calls.at(-1)![0]).toBe('S-13 ciclo 2026-03-01.docx');
      llamar(p, 'descargarS13Ciclo', CICLO);
      expect(descargar.mock.calls.at(-1)![0]).toMatch(/^S-13 ciclo \d{4}-\d{2}-\d{2}\.docx$/);
    });

    it('elegir año, cambiar de pestaña y formatear fechas', async () => {
      const p = await pagina();
      llamar(p, 'elegirAnio', { target: { value: '2025' } });
      expect(p.anio()).toBe(2025);
      llamar(p, 'abrir', 'historial');
      expect(p.vista()).toBe('historial');
      expect(llamar(p, 'fechaDm', new Date(2026, 0, 5))).toBe('05-01');
      expect(llamar(p, 'fechaDm', null)).toBe('');
    });

    it('si no carga, lo dice', async () => {
      api['ciclos'].mockRejectedValue(new Error('caído'));
      const p = await pagina();
      await vi.waitFor(() => expect(p.cargando()).toBe(false));
      expect(p.error()).not.toBeNull();
    });

    it('cerrar el ciclo: si cancela no pasa nada; si falla, lo dice', async () => {
      const p = await pagina();
      const cerrar = llamar(p, 'cerrarCiclo') as Promise<void>;
      ui.responder(false);
      await cerrar;
      expect(api['cerrarCiclo']).not.toHaveBeenCalled();

      api['cerrarCiclo'].mockRejectedValue(new Error('caído'));
      const otra = llamar(p, 'cerrarCiclo') as Promise<void>;
      ui.responder(true);
      await otra;
      expect(toast.show).toHaveBeenCalledWith(expect.any(String), 12000, 'error');
    });

    it('corregir por calles, vaciar y deshacer', async () => {
      const p = await pagina();
      await llamar(p, 'elegirTerritorio', { target: { value: '9' } });
      const [a, b] = MANZANAS.features;
      expect(p.edicion().marcadas.size).toBe(2);

      // «Calles» de la lista abre la manzana en modo calles; marcar una calle la deja por calles.
      llamar(p, 'alternar', a);
      llamar(p, 'elegirCalles', a);
      expect(p.modo()).toBe('calles');
      expect(p.calles()?.length).toBeGreaterThan(0);
      llamar(p, 'alTocarCalle', 0);
      expect(p.edicion().zonas).toHaveLength(1);
      // En modo calles, tocar otra manzana la abre y tocar la franja vuelve a abrir la suya.
      llamar(p, 'alTocarManzana', b);
      expect(p.manzanaCalles()?.properties.nombre).toBe('9.b');
      llamar(p, 'alTocarZona', 0);
      expect(p.manzanaCalles()?.properties.nombre).toBe('9.a');
      // En modo entera, tocar la franja la quita y tocar una manzana la alterna.
      llamar(p, 'cambiarModo', 'entera');
      expect(p.manzanaCalles()).toBeNull();
      llamar(p, 'alTocarZona', 0);
      expect(p.edicion().zonas).toHaveLength(0);
      llamar(p, 'alTocarManzana', a);
      expect(p.edicion().marcadas.has('9-9.a')).toBe(true);

      llamar(p, 'vaciarTerritorio');
      expect(p.edicion().marcadas.size).toBe(0);
      expect(p.hayCambios()).toBe(true);
      llamar(p, 'deshacer');
      expect(p.hayCambios()).toBe(false);
      // Sin cambios, guardar no hace nada.
      await llamar(p, 'guardarCorreccion');
      expect(api['corregir']).not.toHaveBeenCalled();
    });

    it('cambiar de territorio con cambios sin guardar pregunta; si no descarta, se queda', async () => {
      const p = await pagina();
      await llamar(p, 'elegirTerritorio', { target: { value: '9' } });
      llamar(p, 'vaciarTerritorio');
      const select = { value: '' };
      const cambio = llamar(p, 'elegirTerritorio', { target: select }) as Promise<void>;
      ui.responder(false);
      await cambio;
      expect(p.territorioSel()).toBe(9);
      expect(select.value).toBe('9');
    });

    it('si no carga el estado del territorio o falla la corrección, lo dice', async () => {
      const p = await pagina();
      api['estadoTerritorio'].mockRejectedValueOnce(new Error('caído'));
      await llamar(p, 'elegirTerritorio', { target: { value: '9' } });
      expect(toast.show).toHaveBeenCalledWith(expect.any(String), 5000, 'error');

      await llamar(p, 'elegirTerritorio', { target: { value: '9' } });
      llamar(p, 'vaciarTerritorio');
      api['corregir'].mockRejectedValue(new Error('caído'));
      const guardar = llamar(p, 'guardarCorreccion') as Promise<void>;
      ui.responder(true);
      await guardar;
      expect(toast.show).toHaveBeenCalledTimes(2);
      // Elegir «ninguno» deja la corrección vacía.
      const ninguno = llamar(p, 'elegirTerritorio', { target: { value: '' } }) as Promise<void>;
      ui.responder(true);
      await ninguno;
      expect(p.territorioSel()).toBeNull();
    });
  });
});
