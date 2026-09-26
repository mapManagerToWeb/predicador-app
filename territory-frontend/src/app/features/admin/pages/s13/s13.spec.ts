import { TestBed } from '@angular/core/testing';
import type { CicloAdmin, ManzanasCollection, ReporteAdmin } from '../../admin.models';
import { AdminApi } from '../../services/admin-api';
import { AdminUi } from '../../services/admin-ui';
import { S13Page } from './s13';

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
    await vi.waitFor(() => expect(api['cerrarCiclo']).toHaveBeenCalledWith(null));
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
});
