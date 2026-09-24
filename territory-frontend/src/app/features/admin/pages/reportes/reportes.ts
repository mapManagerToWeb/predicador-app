import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Toast } from '../../../../core/services/toast';
import type { EnvioWhatsApp, ReporteAdmin } from '../../admin.models';
import { AdminApi, mensajeDeError } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { AdminUi } from '../../services/admin-ui';
import { completado, deduplicar, diasEntre, duplicados, nombreEncargado, registroTerritorios } from '../../utils/analytics';
import { aCsv, descargar } from '../../utils/csv';
import { fmtFecha, fmtFechaHora, fmtNumero } from '../../utils/formato';

type Vista = 'reportes' | 'registro' | 'whatsapp';
type FiltroEstado = 'todos' | 'completos' | 'parciales';

const POR_PAGINA = 50;

@Component({
  selector: 'app-reportes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reportes.html',
  styleUrl: './reportes.css',
})
export class ReportesPage {
  protected readonly store = inject(AdminStore);
  private readonly api = inject(AdminApi);
  private readonly ui = inject(AdminUi);
  private readonly toast = inject(Toast);

  protected readonly vista = signal<Vista>('reportes');
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  // ── Filtros del listado ──
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly territorio = signal<number | null>(null);
  protected readonly encargado = signal('todos');
  protected readonly estado = signal<FiltroEstado>('todos');
  protected readonly soloDuplicados = signal(false);
  protected readonly pagina = signal(0);
  protected readonly marcados = signal<Set<number>>(new Set());

  protected readonly envios = signal<EnvioWhatsApp[] | null>(null);
  protected readonly registroTerritorio = signal<number | null>(null);

  private readonly todos = computed(() =>
    [...(this.store.reportes() ?? [])].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()),
  );
  private readonly idsDuplicados = computed(() => new Set(duplicados(this.todos()).map(r => r.id)));

  protected readonly encargados = computed(() => {
    const vistos = new Map<string, string>();
    for (const r of this.todos()) vistos.set(this.claveEncargado(r), nombreEncargado(r));
    return [...vistos].map(([clave, nombre]) => ({ clave, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

  protected readonly filtrados = computed(() => {
    const desde = this.desde() ? new Date(`${this.desde()}T00:00:00`) : null;
    const hasta = this.hasta() ? new Date(`${this.hasta()}T23:59:59.999`) : null;
    return this.todos().filter(r => {
      const f = new Date(r.fecha);
      if (desde && f < desde) return false;
      if (hasta && f > hasta) return false;
      if (this.territorio() !== null && r.territorio !== this.territorio()) return false;
      if (this.encargado() !== 'todos' && this.claveEncargado(r) !== this.encargado()) return false;
      if (this.estado() === 'completos' && !completado(r)) return false;
      if (this.estado() === 'parciales' && completado(r)) return false;
      if (this.soloDuplicados() && !this.idsDuplicados().has(r.id)) return false;
      return true;
    });
  });

  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.filtrados().length / POR_PAGINA)));
  protected readonly visibles = computed(() =>
    this.filtrados().slice(this.pagina() * POR_PAGINA, (this.pagina() + 1) * POR_PAGINA),
  );
  protected readonly todosMarcados = computed(
    () => this.visibles().length > 0 && this.visibles().every(r => this.marcados().has(r.id)),
  );

  protected readonly ciclos = computed(() => {
    const t = this.registroTerritorio();
    return registroTerritorios(deduplicar(this.todos()))
      .filter(c => t === null || c.territorio === t)
      .sort((a, b) => a.territorio - b.territorio || b.inicio.getTime() - a.inicio.getTime());
  });

  protected readonly fallidos = computed(() => (this.envios() ?? []).filter(e => e.estado === 'FAILED' || (!e.exito && e.estado !== 'IN_PROGRESS')).length);

  constructor() {
    void this.cargar();
  }

  async cargar(forzar = false): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      await this.store.cargarReportes(forzar);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudieron cargar los reportes'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected async abrir(p: Vista): Promise<void> {
    this.vista.set(p);
    if (p === 'whatsapp' && this.envios() === null) await this.cargarEnvios();
  }

  protected async cargarEnvios(): Promise<void> {
    try {
      this.envios.set(await this.api.enviosWhatsApp());
    } catch (e) {
      this.toast.show(mensajeDeError(e), 5000, 'error');
    }
  }

  // ── Filtros ──

  protected setFiltro(
    filtro: 'desde' | 'hasta' | 'territorio' | 'encargado' | 'estado' | 'duplicados',
    event: Event,
  ): void {
    switch (filtro) {
      case 'desde':
        this.desde.set(this.valor(event));
        break;
      case 'hasta':
        this.hasta.set(this.valor(event));
        break;
      case 'territorio':
        this.territorio.set(this.numero(event));
        break;
      case 'encargado':
        this.encargado.set(this.valor(event));
        break;
      case 'estado':
        this.estado.set(this.valor(event) as FiltroEstado);
        break;
      case 'duplicados':
        this.soloDuplicados.set((event.target as HTMLInputElement).checked);
        break;
    }
    this.pagina.set(0);
    this.marcados.set(new Set());
  }

  protected valor(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected numero(event: Event): number | null {
    const v = (event.target as HTMLInputElement).value.trim();
    return v === '' || Number.isNaN(Number(v)) ? null : Math.trunc(Number(v));
  }

  protected limpiarFiltros(): void {
    this.desde.set('');
    this.hasta.set('');
    this.territorio.set(null);
    this.encargado.set('todos');
    this.estado.set('todos');
    this.soloDuplicados.set(false);
    this.pagina.set(0);
    this.marcados.set(new Set());
  }

  // ── Selección y borrado ──

  protected marcar(id: number, event: Event): void {
    const ids = new Set(this.marcados());
    if ((event.target as HTMLInputElement).checked) ids.add(id);
    else ids.delete(id);
    this.marcados.set(ids);
  }

  protected marcarPagina(event: Event): void {
    const ids = new Set(this.marcados());
    const marcar = (event.target as HTMLInputElement).checked;
    for (const r of this.visibles()) {
      if (marcar) ids.add(r.id);
      else ids.delete(r.id);
    }
    this.marcados.set(ids);
  }

  /** Muestra solo los dobles envíos (sin otros filtros que los oculten) y los deja seleccionados. */
  protected marcarDuplicados(): void {
    this.limpiarFiltros();
    this.soloDuplicados.set(true);
    this.marcados.set(new Set(this.idsDuplicados()));
  }

  protected async eliminarMarcados(): Promise<void> {
    const ids = [...this.marcados()];
    if (ids.length === 0) return;
    const ok = await this.ui.confirmar({
      titulo: `Eliminar ${ids.length} reporte(s)`,
      mensaje:
        'Se borran definitivamente. Afecta las estadísticas y lo que el mapa muestra como trabajado en esos territorios.',
      accion: 'Eliminar',
      peligro: true,
      escribir: ids.length > 5 ? 'ELIMINAR' : undefined,
    });
    if (!ok) return;
    try {
      const { eliminados } = await this.api.eliminarReportes(ids);
      const borrar = new Set(ids);
      this.store.reportes.update(l => l?.filter(r => !borrar.has(r.id)) ?? l);
      this.marcados.set(new Set());
      this.toast.show(`${eliminados} reporte(s) eliminados`, 3000, 'success');
    } catch (e) {
      this.toast.show(mensajeDeError(e), 6000, 'error');
    }
  }

  // ── Exportar ──

  protected exportarReportes(): void {
    const csv = aCsv(
      ['Id', 'Fecha', 'Encargado', 'Territorio', 'Estado', 'Manzanas marcadas', 'Total manzanas', 'Duración (min)', 'Manzanas'],
      this.filtrados().map(r => [
        r.id,
        fmtFechaHora(r.fecha, ''),
        nombreEncargado(r),
        r.territorio,
        completado(r) ? 'Completo' : 'Parcial',
        r.manzanasMarcadas,
        r.totalManzanas,
        this.minutos(r),
        r.manzanasIds ?? '',
      ]),
    );
    descargar(`reportes-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  protected exportarRegistro(): void {
    const csv = aCsv(
      ['Territorio', 'Inicio', 'Completado', 'Días', 'Encargados', 'Reportes'],
      this.ciclos().map(c => [
        c.territorio,
        fmtFecha(c.inicio, ''),
        c.fin ? fmtFecha(c.fin, '') : 'En curso',
        c.fin ? diasEntre(c.inicio, c.fin) : null,
        c.encargados.join(', '),
        c.reportes,
      ]),
    );
    descargar(`registro-territorios-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  // ── Plantilla ──

  protected claveEncargado(r: ReporteAdmin): string {
    return r.encargadoId != null ? `id:${r.encargadoId}` : `nombre:${nombreEncargado(r).toLowerCase()}`;
  }

  /** Duración de la salida (desde la primera manzana marcada hasta el envío). */
  protected minutos(r: ReporteAdmin): number | null {
    if (!r.inicioSesion) return null;
    const min = (new Date(r.fecha).getTime() - new Date(r.inicioSesion).getTime()) / 60_000;
    return min >= 1 && min <= 12 * 60 ? Math.round(min) : null;
  }

  protected esDuplicado(r: ReporteAdmin): boolean {
    return this.idsDuplicados().has(r.id);
  }

  protected readonly cantidadDuplicados = computed(() => this.idsDuplicados().size);
  protected readonly diasEntre = diasEntre;
  protected readonly nombreEncargado = nombreEncargado;
  protected readonly completado = completado;
  protected readonly fmtFecha = fmtFecha;
  protected readonly fmtFechaHora = fmtFechaHora;
  protected readonly fmtNumero = fmtNumero;
}
