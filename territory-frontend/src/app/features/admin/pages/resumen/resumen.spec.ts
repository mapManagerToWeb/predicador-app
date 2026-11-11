import { ElementRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { ManzanasCollection, ReporteAdmin } from '../../admin.models';
import { AdminStore } from '../../services/admin-store';
import { ESTADOS, ResumenPage } from './resumen';

type Senal<T> = ReturnType<typeof signal<T>>;

interface VistaResumen {
  periodo: Senal<string>;
  encargado: Senal<string>;
  cargando: Senal<boolean>;
  error: Senal<string | null>;
  primerDato(): Date | null;
  rango(): { desde: Date; hasta: Date };
  opcionesEncargado(): { clave: string; nombre: string }[];
  enPeriodo(): ReporteAdmin[];
  kpi(): { manzanas: number; reportes: number; territoriosCompletados: number };
  actividad(): { etiqueta: string; valor: number; detalle: string[] }[];
  tituloActividad(): string;
  rankingEncargados(): { etiqueta: string; valor: number; detalle: string }[];
  calor(): number[][];
  cobertura(): { territorio: number; estado: string }[];
  conteo(): Record<string, number>;
  porcentajeAlDia(): number;
  atencion(): { territorio: number }[];
  enCurso(): { territorio: number }[];
  coloresMapa(): Record<number, string>;
  describirTerritorio(t: number): string;
  cargar(forzar?: boolean): Promise<void>;
  setPeriodo(p: string): void;
  onEncargado(e: Event): void;
  irATerritorio(t: number): void;
  ancho(estado: string): number;
  exportarCobertura(): void;
}

let secuencia = 1;

/**
 * Diferencia en días de calendario entre dos fechas, ignorando la hora.
 * `rango()` arranca en la medianoche local, así que restar los milisegundos
 * directo mezcla la hora del día en que corre la prueba (en CI, de madrugada).
 */
function diasDeCalendario(desde: Date, hasta: Date): number {
  const a = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function iso(diasAtras: number): string {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

function reporte(p: Partial<ReporteAdmin> = {}): ReporteAdmin {
  return {
    id: secuencia++,
    fecha: iso(1),
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

function manzanas(territorios: number[]): ManzanasCollection {
  return {
    type: 'FeatureCollection',
    features: territorios.map((t, i) => ({
      type: 'Feature',
      id: i + 1,
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      properties: { id: i + 1, territorio: t, nombre: `${t}.a`, areaM2: 100, valida: true },
    })),
  };
}

describe('ResumenPage', () => {
  let store: AdminStore;
  let router: { navigate: ReturnType<typeof vi.fn> };

  function montar(): VistaResumen {
    return TestBed.runInInjectionContext(() => new ResumenPage()) as unknown as VistaResumen;
  }

  beforeEach(() => {
    secuencia = 1;
    router = { navigate: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
      ],
    });
    store = TestBed.inject(AdminStore);
    vi.spyOn(store, 'cargarReportes').mockResolvedValue();
    vi.spyOn(store, 'cargarManzanas').mockResolvedValue();
    store.manzanas.set(manzanas([1, 2, 3]));
  });

  it('carga y guarda el error si falla', async () => {
    const page = montar();
    await page.cargar();
    expect(page.cargando()).toBe(false);
    expect(page.error()).toBeNull();

    vi.spyOn(store, 'cargarManzanas').mockRejectedValueOnce(new Error('sin red'));
    await page.cargar(true);
    expect(page.error()).toContain('No se pudieron cargar los datos');
  });

  it('calcula el primer dato y el rango del período', () => {
    store.todosLosReportes.set([reporte({ fecha: iso(10) }), reporte({ fecha: iso(200) })]);
    const page = montar();
    expect(page.primerDato()).toBeInstanceOf(Date);

    page.setPeriodo('30');
    const treinta = page.rango();
    expect(diasDeCalendario(treinta.desde, treinta.hasta)).toBe(29);

    page.setPeriodo('todo');
    expect(page.rango().desde.getTime()).toBe(page.primerDato()?.getTime());
  });

  it('usa una ventana de 30 días cuando no hay datos', () => {
    store.todosLosReportes.set([]);
    const page = montar();
    page.setPeriodo('todo');
    expect(page.primerDato()).toBeNull();
    const { desde, hasta } = page.rango();
    expect(Math.round((hasta.getTime() - desde.getTime()) / 86_400_000)).toBe(30);
  });

  it('filtra por encargado dentro del período', () => {
    store.todosLosReportes.set([
      reporte({ encargadoId: 1, encargadoNombre: 'Ana', fecha: iso(2) }),
      reporte({ encargadoId: 2, encargadoNombre: 'Luis', encargadoApellido: 'Rojas', fecha: iso(3) }),
      reporte({ encargadoId: null, encargadoNombre: 'Pedro', encargadoApellido: 'Soto', fecha: iso(4) }),
    ]);
    const page = montar();
    page.setPeriodo('30');
    expect(page.opcionesEncargado()).toEqual([
      { clave: 'id:1', nombre: 'Ana Pérez' },
      { clave: 'id:2', nombre: 'Luis Rojas' },
      { clave: 'nombre:pedro soto', nombre: 'Pedro Soto' },
    ]);
    expect(page.enPeriodo()).toHaveLength(3);

    page.onEncargado({ target: { value: 'id:2' } } as unknown as Event);
    expect(page.enPeriodo().map(r => r.encargadoNombre)).toEqual(['Luis']);

    page.onEncargado({ target: { value: 'nombre:pedro soto' } } as unknown as Event);
    expect(page.enPeriodo().map(r => r.encargadoNombre)).toEqual(['Pedro']);
  });

  it('agrupa por semana en períodos cortos y por mes en los largos', () => {
    store.todosLosReportes.set([reporte({ fecha: iso(5), manzanasMarcadas: 3 })]);
    const page = montar();

    page.setPeriodo('30');
    expect(page.tituloActividad()).toBe('Manzanas trabajadas por semana');
    const semanal = page.actividad();
    expect(semanal.length).toBeGreaterThan(0);
    expect(semanal[0].detalle[0]).toContain('Semana del');

    page.setPeriodo('365');
    expect(page.tituloActividad()).toBe('Manzanas trabajadas por mes');
    const mensual = page.actividad();
    expect(mensual[0].detalle[0]).toContain('Mes');
  });

  it('arma el ranking de encargados y el mapa de calor', () => {
    store.todosLosReportes.set([reporte({ fecha: iso(5), manzanasMarcadas: 4 })]);
    const page = montar();
    page.setPeriodo('30');
    const ranking = page.rankingEncargados();
    expect(ranking[0].etiqueta).toBe('Ana Pérez');
    expect(ranking[0].detalle).toContain('reportes');
    expect(page.calor().length).toBeGreaterThan(0);
  });

  it('calcula cobertura, conteo y porcentaje al día', () => {
    store.todosLosReportes.set([reporte({ territorio: 1, estado: 'completed', fecha: iso(2) })]);
    const page = montar();
    expect(page.cobertura().map(c => c.territorio).sort()).toEqual([1, 2, 3]);
    expect(page.conteo()['al-dia']).toBe(1);
    expect(page.porcentajeAlDia()).toBe(33);
    expect(page.ancho('al-dia')).toBeCloseTo(100 / 3);
  });

  it('devuelve 0 cuando no hay territorios', () => {
    store.manzanas.set(manzanas([]));
    const page = montar();
    expect(page.porcentajeAlDia()).toBe(0);
    expect(page.ancho('al-dia')).toBe(0);
  });

  it('ordena la atención y lista los territorios en curso', () => {
    store.todosLosReportes.set([
      reporte({ territorio: 1, estado: 'completed', fecha: iso(200) }),
      reporte({ territorio: 2, estado: 'incomplete', fecha: iso(1) }),
      reporte({ territorio: 3, estado: 'completed', fecha: iso(10) }),
    ]);
    const page = montar();
    const atencion = page.atencion().map(c => c.territorio);
    expect(atencion).toEqual([2, 1]);
    expect(page.enCurso().map(c => c.territorio)).toEqual([2]);
  });

  it('describe cada territorio para el mapa', () => {
    store.todosLosReportes.set([reporte({ territorio: 1, estado: 'completed', fecha: iso(3) })]);
    const page = montar();
    expect(page.describirTerritorio(99)).toBe('Territorio 99');
    expect(page.describirTerritorio(1)).toContain('Territorio 1 ·');
    expect(page.describirTerritorio(1)).toContain('completado');
    expect(page.describirTerritorio(2)).toContain('sin completar');
  });

  it('resuelve los colores del mapa desde el tema', () => {
    const page = montar();
    expect(Object.keys(page.coloresMapa()).sort()).toEqual(['1', '2', '3']);
    expect(Object.values(page.coloresMapa())).toContain('#888');
  });

  it('navega al territorio y cambia el período', () => {
    const page = montar();
    page.irATerritorio(7);
    expect(router.navigate).toHaveBeenCalledWith(['/admin/territorios'], { queryParams: { t: 7 } });
    page.setPeriodo('90');
    expect(page.periodo()).toBe('90');
  });

  it('exporta la cobertura a CSV', () => {
    store.todosLosReportes.set([reporte({ territorio: 1, estado: 'completed', fecha: iso(3) })]);
    const page = montar();
    const crear = vi.fn().mockReturnValue('blob:x');
    Object.defineProperty(URL, 'createObjectURL', { value: crear, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    const click = vi.fn();
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = click;
    page.exportarCobertura();
    HTMLAnchorElement.prototype.click = original;
    expect(crear).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });

  it('expone los estados de cobertura con su descripción', () => {
    expect(ESTADOS.map(e => e.estado)).toEqual(['al-dia', 'pendiente', 'atrasado', 'sin-registro']);
    expect(ESTADOS[0].descripcion).toContain('días');
  });
});
