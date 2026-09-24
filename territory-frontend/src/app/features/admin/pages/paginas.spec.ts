import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Toast } from '../../../core/services/toast';
import type { ManzanasCollection, ReporteAdmin } from '../admin.models';
import { AdminApi } from '../services/admin-api';
import { AdminStore } from '../services/admin-store';
import { AdminUi } from '../services/admin-ui';
import { ReportesPage } from './reportes/reportes';
import { TerritoriosPage } from './territorios/territorios';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ResumenPage } from './resumen/resumen';

function iso(diasAtras: number, hora = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  d.setHours(hora, 0, 0, 0);
  return d.toISOString();
}

let id = 1;
function reporte(p: Partial<ReporteAdmin>): ReporteAdmin {
  return {
    id: id++, fecha: iso(1), inicioSesion: null, encargadoId: 1, encargadoNombre: 'Ana', encargadoApellido: 'Pérez',
    territorio: 1, estado: 'incomplete', tipoSesion: 'parcial', totalManzanas: 4, manzanasMarcadas: 2,
    manzanasIds: '1,2', tieneParcial: false, ...p,
  };
}

function manzanas(territorios: number[]): ManzanasCollection {
  return {
    type: 'FeatureCollection',
    features: territorios.map((t, i) => ({
      type: 'Feature', id: i + 1,
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      properties: { id: i + 1, territorio: t, nombre: `${t}.a`, areaM2: 100, valida: true },
    })),
  };
}

describe('páginas del panel (lógica)', () => {
  let store: AdminStore;
  let api: {
    eliminarReportes: ReturnType<typeof vi.fn>;
    enviosWhatsApp: ReturnType<typeof vi.fn>;
    reasignarManzanas: ReturnType<typeof vi.fn>;
    colores: ReturnType<typeof vi.fn>;
    calidad: ReturnType<typeof vi.fn>;
  };
  let confirmar: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    id = 1;
    api = {
      eliminarReportes: vi.fn(),
      enviosWhatsApp: vi.fn().mockResolvedValue([]),
      reasignarManzanas: vi.fn().mockResolvedValue({ actualizadas: 1 }),
      colores: vi.fn().mockResolvedValue({}),
      calidad: vi.fn().mockResolvedValue({ invalidas: [], solapes: [] }),
    };
    confirmar = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminApi, useValue: api },
        { provide: AdminUi, useValue: { confirmar } },
        { provide: Toast, useValue: { show: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    });
    store = TestBed.inject(AdminStore);
    // Sin red: los datos ya están "cargados".
    vi.spyOn(store, 'cargarReportes').mockResolvedValue();
    vi.spyOn(store, 'cargarManzanas').mockResolvedValue();
    store.manzanas.set(manzanas([1, 2, 3]));
  });

  it('Resumen: KPIs del período, cobertura y sin contar dobles envíos', () => {
    const completo = reporte({ territorio: 2, estado: 'completed', manzanasMarcadas: 1, fecha: iso(3) });
    store.reportes.set([
      reporte({ territorio: 1, manzanasMarcadas: 2, fecha: iso(1) }),
      completo,
      { ...completo, id: 99, fecha: new Date(new Date(completo.fecha).getTime() + 30_000).toISOString() },
      reporte({ territorio: 3, manzanasMarcadas: 5, fecha: iso(200) }),
    ]);
    const pagina = TestBed.runInInjectionContext(() => new ResumenPage()) as unknown as {
      kpi: () => { manzanas: number; reportes: number; territoriosCompletados: number };
      conteo: () => Record<string, number>;
      atencion: () => { territorio: number }[];
      periodo: { set: (p: string) => void };
    };

    expect(pagina.kpi()).toMatchObject({ manzanas: 3, reportes: 2, territoriosCompletados: 1 });
    expect(pagina.conteo()).toEqual({ 'al-dia': 1, pendiente: 0, atrasado: 0, 'sin-registro': 2 });
    // Nunca completados; primero el que nunca se trabajó... todos tienen trabajo: el más viejo primero.
    expect(pagina.atencion().map(c => c.territorio)).toEqual([3, 1]);

    pagina.periodo.set('365');
    expect(pagina.kpi().manzanas).toBe(8);
  });

  it('Reportes: filtra, marca duplicados y borra los seleccionados', async () => {
    const a = reporte({ territorio: 5, estado: 'completed', fecha: iso(2) });
    const dup = { ...a, id: 50, fecha: new Date(new Date(a.fecha).getTime() + 20_000).toISOString() };
    store.reportes.set([a, dup, reporte({ territorio: 6, fecha: iso(1) })]);
    api.eliminarReportes.mockResolvedValue({ eliminados: 1 });
    const pagina = TestBed.runInInjectionContext(() => new ReportesPage()) as unknown as {
      filtrados: () => ReporteAdmin[];
      marcados: () => Set<number>;
      marcarDuplicados: () => void;
      eliminarMarcados: () => Promise<void>;
      setFiltro: (f: string, e: Event) => void;
      ciclos: () => { territorio: number; fin: Date | null }[];
    };

    expect(pagina.filtrados()).toHaveLength(3);
    pagina.setFiltro('territorio', { target: { value: '6' } } as unknown as Event);
    expect(pagina.filtrados().map(r => r.territorio)).toEqual([6]);

    pagina.marcarDuplicados();
    expect([...pagina.marcados()]).toEqual([50]);
    expect(pagina.filtrados().map(r => r.id)).toEqual([50]);

    await pagina.eliminarMarcados();
    expect(confirmar).toHaveBeenCalled();
    expect(api.eliminarReportes).toHaveBeenCalledWith([50]);
    expect(store.reportes()?.map(r => r.id)).not.toContain(50);

    expect(pagina.ciclos().find(c => c.territorio === 5)?.fin).not.toBeNull();
  });

  it('Territorios: busca, sugiere el nombre y mueve manzanas creando un territorio nuevo', async () => {
    store.manzanas.set(manzanas([1, 1, 12, 13]));
    const pagina = TestBed.runInInjectionContext(() => new TerritoriosPage()) as unknown as {
      busqueda: { set: (v: string) => void };
      listaTerritorios: () => { numero: number; manzanas: number }[];
      territorio: { set: (t: number | null) => void };
      nuevaManzana: () => void;
      formNombre: () => string;
      formTerritorio: () => number | null;
      modo: () => string;
      cancelarDibujo: () => void;
      seleccion: { set: (s: Set<number>) => void };
      destinoMover: { set: (t: number | null) => void };
      moverSeleccion: () => Promise<void>;
    };

    pagina.busqueda.set('1');
    expect(pagina.listaTerritorios().map(t => t.numero)).toEqual([1, 12, 13]);
    pagina.busqueda.set('12');
    expect(pagina.listaTerritorios()).toEqual([{ numero: 12, manzanas: 1, color: '#888888' }]);

    pagina.territorio.set(12);
    pagina.nuevaManzana();
    expect(pagina.modo()).toBe('dibujar');
    expect(pagina.formTerritorio()).toBe(12);
    expect(pagina.formNombre()).toBe('12.b');
    pagina.cancelarDibujo();

    pagina.seleccion.set(new Set([1, 2]));
    pagina.destinoMover.set(40);
    await pagina.moverSeleccion();
    expect(confirmar).toHaveBeenCalledWith(expect.objectContaining({ mensaje: expect.stringContaining('no existe todavía') }));
    expect(api.reasignarManzanas).toHaveBeenCalledWith([1, 2], 40);
    expect(store.manzanasPorTerritorio().get(40)).toBe(2);
    expect(store.manzanasPorTerritorio().has(1)).toBe(false);
  });
});
