import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BarList, type Barra } from '../../charts/bar-list';
import { ColumnChart, type Columna } from '../../charts/column-chart';
import { Heatmap } from '../../charts/heatmap';
import { CoverageMap } from '../../map/coverage-map';
import { mensajeDeError } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import {
  cobertura,
  DIAS_AL_DIA,
  DIAS_ATRASADO,
  deduplicar,
  type EstadoCobertura,
  mapaDeCalor,
  nombreEncargado,
  porEncargado,
  porPeriodo,
  resumen,
} from '../../utils/analytics';
import { aCsv, descargar } from '../../utils/csv';
import { fmtDiaMes, fmtFecha, fmtMesAnio, fmtNumero, fmtRelativo } from '../../utils/formato';

type Periodo = '30' | '90' | '365' | 'todo';

interface InfoEstado {
  estado: EstadoCobertura;
  nombre: string;
  descripcion: string;
  clase: string;
  variable: string;
}

export const ESTADOS: InfoEstado[] = [
  {
    estado: 'al-dia',
    nombre: 'Al día',
    descripcion: `completado hace ${DIAS_AL_DIA} días o menos`,
    clase: 'good',
    variable: '--st-good',
  },
  {
    estado: 'pendiente',
    nombre: 'Pendiente',
    descripcion: `completado hace ${DIAS_AL_DIA + 1}–${DIAS_ATRASADO} días`,
    clase: 'warning',
    variable: '--st-warning',
  },
  {
    estado: 'atrasado',
    nombre: 'Atrasado',
    descripcion: `más de ${DIAS_ATRASADO} días sin completarse`,
    clase: 'critical',
    variable: '--st-critical',
  },
  {
    estado: 'sin-registro',
    nombre: 'Sin registro',
    descripcion: 'no hay un reporte que lo complete',
    clase: '',
    variable: '--st-none',
  },
];

@Component({
  selector: 'app-resumen',
  imports: [ColumnChart, BarList, Heatmap, CoverageMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resumen.html',
  styleUrl: './resumen.css',
})
export class ResumenPage {
  protected readonly store = inject(AdminStore);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly periodos: { valor: Periodo; nombre: string }[] = [
    { valor: '30', nombre: '30 días' },
    { valor: '90', nombre: '90 días' },
    { valor: '365', nombre: '12 meses' },
    { valor: 'todo', nombre: 'Todo' },
  ];
  protected readonly estados = ESTADOS;
  protected readonly periodo = signal<Periodo>('90');
  protected readonly encargado = signal('todos');
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  private readonly ahora = signal(new Date());

  /** Historial completo sin dobles envíos. */
  private readonly todos = computed(() => deduplicar(this.store.reportes() ?? []));
  protected readonly primerDato = computed(() => {
    const fechas = this.todos().map(r => new Date(r.fecha).getTime());
    return fechas.length ? new Date(Math.min(...fechas)) : null;
  });

  protected readonly rango = computed(() => {
    const hasta = this.ahora();
    const p = this.periodo();
    let desde: Date;
    if (p === 'todo') {
      desde = this.primerDato() ?? new Date(hasta.getTime() - 30 * 86_400_000);
    } else {
      desde = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate() - Number(p) + 1);
    }
    return { desde, hasta };
  });

  protected readonly opcionesEncargado = computed(() => porEncargado(this.todos()).map(f => ({ clave: f.clave, nombre: f.nombre })));

  protected readonly enPeriodo = computed(() => {
    const { desde, hasta } = this.rango();
    const clave = this.encargado();
    return this.todos().filter(r => {
      const t = new Date(r.fecha);
      if (t < desde || t > hasta) return false;
      if (clave === 'todos') return true;
      const propia = r.encargadoId != null ? `id:${r.encargadoId}` : `nombre:${nombreEncargado(r).toLowerCase()}`;
      return propia === clave;
    });
  });

  protected readonly kpi = computed(() => resumen(this.enPeriodo()));

  private readonly granularidad = computed(() =>
    (this.rango().hasta.getTime() - this.rango().desde.getTime()) / 86_400_000 > 120 ? 'mes' : 'semana',
  );

  protected readonly actividad = computed<Columna[]>(() => {
    const g = this.granularidad();
    return porPeriodo(this.enPeriodo(), this.rango().desde, this.rango().hasta, g).map(p => ({
      etiqueta: g === 'mes' ? fmtMesAnio(p.inicio) : fmtDiaMes(p.inicio),
      valor: p.manzanas,
      detalle: [
        `${g === 'mes' ? 'Mes' : 'Semana del'} ${g === 'mes' ? fmtMesAnio(p.inicio) : fmtDiaMes(p.inicio)}`,
        `${p.reportes} reportes · ${p.completados} completados`,
      ],
    }));
  });
  protected readonly tituloActividad = computed(() =>
    this.granularidad() === 'mes' ? 'Manzanas trabajadas por mes' : 'Manzanas trabajadas por semana',
  );

  protected readonly rankingEncargados = computed<Barra[]>(() =>
    porEncargado(this.enPeriodo()).map(f => ({
      etiqueta: f.nombre,
      valor: f.manzanas,
      detalle:
        `${f.reportes} reportes · ${f.territorios} territorios · ${f.completados} completados` +
        (f.minutosPorManzana !== null ? ` · ${fmtNumero(f.minutosPorManzana)} min por manzana` : ''),
    })),
  );

  protected readonly calor = computed(() => mapaDeCalor(this.enPeriodo()));

  protected readonly cobertura = computed(() =>
    cobertura(this.todos(), this.store.manzanasPorTerritorio(), this.ahora()).filter(c =>
      this.store.manzanasPorTerritorio().has(c.territorio),
    ),
  );

  protected readonly conteo = computed(() => {
    const conteo: Record<EstadoCobertura, number> = { 'al-dia': 0, pendiente: 0, atrasado: 0, 'sin-registro': 0 };
    for (const c of this.cobertura()) conteo[c.estado]++;
    return conteo;
  });

  protected readonly porcentajeAlDia = computed(() => {
    const total = this.cobertura().length;
    return total ? Math.round((this.conteo()['al-dia'] / total) * 100) : 0;
  });

  /**
   * Primero los atrasados (más días primero), después los que nunca se
   * completaron (los que nunca se trabajaron, y luego los que llevan más
   * tiempo sin trabajarse) y al final los pendientes.
   */
  protected readonly atencion = computed(() => {
    const prioridad: Record<EstadoCobertura, number> = { atrasado: 0, 'sin-registro': 1, pendiente: 2, 'al-dia': 3 };
    const trabajo = (c: { ultimoTrabajo: Date | null }) => c.ultimoTrabajo?.getTime() ?? -Infinity;
    return this.cobertura()
      .filter(c => c.estado !== 'al-dia')
      .sort(
        (a, b) =>
          prioridad[a.estado] - prioridad[b.estado] ||
          (b.diasDesdeCompletado ?? 0) - (a.diasDesdeCompletado ?? 0) ||
          trabajo(a) - trabajo(b) ||
          a.territorio - b.territorio,
      )
      .slice(0, 12);
  });

  protected readonly enCurso = computed(() =>
    this.cobertura()
      .filter(c => c.enCurso)
      .sort((a, b) => (b.ultimoTrabajo?.getTime() ?? 0) - (a.ultimoTrabajo?.getTime() ?? 0)),
  );

  /** Colores del mapa: el estado de cada territorio, resuelto desde las variables CSS del tema. */
  protected readonly coloresMapa = computed(() => {
    const estilos = getComputedStyle(this.host.nativeElement);
    const colorDe = Object.fromEntries(ESTADOS.map(e => [e.estado, estilos.getPropertyValue(e.variable).trim() || '#888']));
    return Object.fromEntries(this.cobertura().map(c => [c.territorio, colorDe[c.estado]]));
  });

  protected readonly describirTerritorio = (t: number): string => {
    const c = this.cobertura().find(x => x.territorio === t);
    if (!c) return `Territorio ${t}`;
    const estado = ESTADOS.find(e => e.estado === c.estado)?.nombre ?? '';
    const cuando = c.ultimoCompletado ? `completado ${fmtRelativo(c.ultimoCompletado)}` : 'sin completar';
    return `Territorio ${t} · ${estado} · ${cuando}${c.enCurso ? ' · en curso' : ''}`;
  };

  constructor() {
    void this.cargar();
  }

  async cargar(forzar = false): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      await Promise.all([this.store.cargarReportes(forzar), this.store.cargarManzanas(forzar)]);
      this.ahora.set(new Date());
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudieron cargar los datos'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected setPeriodo(p: Periodo): void {
    this.periodo.set(p);
  }

  protected onEncargado(event: Event): void {
    this.encargado.set((event.target as HTMLSelectElement).value);
  }

  protected irATerritorio(t: number): void {
    void this.router.navigate(['/admin/territorios'], { queryParams: { t } });
  }

  protected ancho(estado: EstadoCobertura): number {
    const total = this.cobertura().length;
    return total ? (this.conteo()[estado] / total) * 100 : 0;
  }

  protected exportarCobertura(): void {
    const filas = this.cobertura().map(c => [
      c.territorio,
      c.manzanas,
      ESTADOS.find(e => e.estado === c.estado)?.nombre ?? '',
      fmtFecha(c.ultimoCompletado, ''),
      c.diasDesdeCompletado,
      c.vecesCompletado,
      fmtFecha(c.ultimoTrabajo, ''),
      c.ultimoEncargado ?? '',
      c.enCurso ? 'Sí' : 'No',
    ]);
    const csv = aCsv(
      ['Territorio', 'Manzanas', 'Estado', 'Último completado', 'Días desde completado', 'Veces completado',
        'Último trabajo', 'Último encargado', 'En curso'],
      filas,
    );
    descargar(`cobertura-territorios-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  protected readonly fmtNumero = fmtNumero;
  protected readonly fmtFecha = fmtFecha;
  protected readonly fmtRelativo = fmtRelativo;
}
