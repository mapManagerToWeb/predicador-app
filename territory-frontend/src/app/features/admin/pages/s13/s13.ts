import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Toast } from '../../../../core/services/toast';
import type { CicloAdmin, EstadoTerritorioAdmin, ManzanaFeature, ResumenTerritorioCiclo } from '../../admin.models';
import { CorreccionMap } from '../../map/correccion-map';
import { AdminApi, mensajeDeError } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { AdminUi } from '../../services/admin-ui';
import { completado } from '../../utils/analytics';
import {
  alternar,
  clave,
  estadoDesde,
  iguales,
  pedido,
  quitarZona,
  situacion,
  vaciar,
  type EstadoCorreccion,
} from '../../utils/correccion';
import { aCsv, descargar } from '../../utils/csv';
import { fmtFecha, fmtFechaHora } from '../../utils/formato';
import {
  anioDeServicio,
  asignaciones,
  paginasS13,
  rangoAnioDeServicio,
  tiemposPorTerritorio,
} from '../../utils/s13';
import { documentoS13 } from '../../utils/s13-docx';

type Vista = 's13' | 'ciclo' | 'corregir' | 'historial';
const TIPO_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * S-13 (registro de asignación de territorio), ciclos de territorios y
 * correcciones del estado actual. Nada de lo que se hace acá borra reportes:
 * cerrar un ciclo y corregir agregan un reporte nuevo con el nuevo estado.
 */
@Component({
  selector: 'app-s13',
  imports: [CorreccionMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './s13.html',
  styleUrl: './s13.css',
})
export class S13Page implements OnInit {
  protected readonly store = inject(AdminStore);
  private readonly api = inject(AdminApi);
  private readonly ui = inject(AdminUi);
  private readonly toast = inject(Toast);

  protected readonly vista = signal<Vista>('s13');
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly ciclos = signal<CicloAdmin[] | null>(null);
  protected readonly fmtFecha = fmtFecha;
  protected readonly fmtFechaHora = fmtFechaHora;

  // ── S-13 ──
  private readonly asignaciones = computed(() => asignaciones(this.store.reportes() ?? []));
  protected readonly anio = signal(anioDeServicio(new Date()));
  protected readonly anios = computed(() => {
    const anios = new Set([anioDeServicio(new Date()), ...this.asignaciones().map(a => anioDeServicio(a.asignado))]);
    return [...anios].sort((a, b) => b - a);
  });
  private readonly rango = computed(() => rangoAnioDeServicio(this.anio()));
  protected readonly paginas = computed(() => paginasS13(this.asignaciones(), this.store.territorios(), this.rango().desde, this.rango().hasta));
  protected readonly soloConDatos = signal(true);
  protected readonly filas = computed(() =>
    this.paginas()
      .flatMap((p, i) => p.filas.map(f => ({ ...f, pagina: i + 1 })))
      .filter(f => !this.soloConDatos() || f.asignaciones.some(Boolean) || f.ultimaCompletada),
  );
  protected readonly tiempos = computed(() =>
    tiemposPorTerritorio(this.asignaciones(), this.rango().desde, this.rango().hasta).filter(t => t.vueltas > 0),
  );
  protected readonly promedioGeneral = computed(() => {
    const dias = this.tiempos().flatMap(t => (t.promedioDias === null ? [] : Array(t.vueltas).fill(t.promedioDias) as number[]));
    return dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : null;
  });

  // ── Ciclo en curso ──
  protected readonly cicloActual = computed(() => this.ciclos()?.find(c => !c.fin) ?? null);
  protected readonly cerrados = computed(() => (this.ciclos() ?? []).filter(c => c.fin));
  protected readonly avance = computed(() => {
    const ciclo = this.cicloActual();
    const territorios = this.store.territorios();
    if (!ciclo) return null;
    const inicio = new Date(ciclo.inicio).getTime();
    const completados = new Set<number>();
    const ultimo = new Map<number, { fecha: number; enCurso: boolean }>();
    for (const r of this.store.reportes() ?? []) {
      const t = new Date(r.fecha).getTime();
      if (t < inicio || r.origen === 'reinicio') continue;
      if (completado(r)) completados.add(r.territorio);
      const previo = ultimo.get(r.territorio);
      if (!previo || t >= previo.fecha) ultimo.set(r.territorio, { fecha: t, enCurso: !completado(r) && (r.manzanasMarcadas ?? 0) > 0 });
    }
    const pendientes = territorios.filter(t => !completados.has(t));
    return {
      total: territorios.length,
      completados: territorios.filter(t => completados.has(t)).length,
      enCurso: pendientes.filter(t => ultimo.get(t)?.enCurso).length,
      pendientes,
    };
  });
  protected readonly notaCierre = signal('');
  protected readonly cerrando = signal(false);

  // ── Historial ──
  protected readonly abierto = signal<number | null>(null);

  // ── Corrección ──
  protected readonly territorioSel = signal<number | null>(null);
  protected readonly estadoRemoto = signal<EstadoTerritorioAdmin | null>(null);
  private readonly original = signal<EstadoCorreccion>(vaciar());
  protected readonly edicion = signal<EstadoCorreccion>(vaciar());
  protected readonly notaCorreccion = signal('');
  protected readonly guardando = signal(false);
  protected readonly cargandoTerritorio = signal(false);
  protected readonly manzanasSel = computed<ManzanaFeature[]>(() => {
    const t = this.territorioSel();
    return ((this.store.manzanas()?.features ?? []) as ManzanaFeature[])
      .filter(f => f.properties.territorio === t)
      .sort((a, b) => a.properties.nombre.localeCompare(b.properties.nombre, 'es', { numeric: true }));
  });
  protected readonly colorSel = computed(() => this.store.colores()[this.territorioSel() ?? -1] ?? '#2563eb');
  protected readonly hayCambios = computed(() => !iguales(this.original(), this.edicion()));
  protected readonly zonasAntiguas = computed(() =>
    this.edicion()
      .zonas.map((z, i) => ({ z, i }))
      .filter(({ z }) => !z.manzanaId),
  );
  protected readonly situacion = situacion;

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  protected async cargar(forzar = false): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      await Promise.all([this.store.cargarReportes(forzar), this.store.cargarManzanas(forzar), this.cargarCiclos()]);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarCiclos(): Promise<void> {
    this.ciclos.set(await this.api.ciclos());
  }

  protected abrir(v: Vista): void {
    this.vista.set(v);
  }

  protected elegirAnio(event: Event): void {
    this.anio.set(Number((event.target as HTMLSelectElement).value));
  }

  protected fechaDm(d: Date | null): string {
    return d ? `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}` : '';
  }

  // ── Descargas ──

  protected descargarS13(): void {
    const anio = this.anio();
    descargar(`S-13 año de servicio ${anio}.docx`, documentoS13(this.paginas(), String(anio)), TIPO_DOCX);
  }

  /** S-13 con las asignaciones de un ciclo (del inicio al cierre, o hasta hoy si sigue abierto). */
  protected descargarS13Ciclo(c: CicloAdmin): void {
    const desde = new Date(c.inicio);
    const hasta = c.fin ? new Date(c.fin) : new Date(Date.now() + 60_000);
    const paginas = paginasS13(this.asignaciones(), this.store.territorios(), desde, hasta);
    const etiqueta = `${fmtFecha(desde)} – ${c.fin ? fmtFecha(hasta) : 'hoy'}`;
    descargar(`S-13 ciclo ${desde.toISOString().slice(0, 10)}.docx`, documentoS13(paginas, etiqueta), TIPO_DOCX);
  }

  protected resumen(c: CicloAdmin): ResumenTerritorioCiclo[] {
    if (!c.resumen) return [];
    try {
      return JSON.parse(c.resumen) as ResumenTerritorioCiclo[];
    } catch {
      return [];
    }
  }

  protected completadosEn(c: CicloAdmin): number {
    return this.resumen(c).filter(t => t.completado.length > 0).length;
  }

  protected duracion(c: CicloAdmin): number {
    const fin = c.fin ? new Date(c.fin) : new Date();
    return Math.max(0, Math.round((fin.getTime() - new Date(c.inicio).getTime()) / 86_400_000));
  }

  protected estadoTexto(t: ResumenTerritorioCiclo): string {
    if (t.estado === 'completed') return 'Completo';
    if (t.estado === 'reiniciado' || !t.estado) return 'Sin trabajar';
    return `${t.manzanasMarcadas ?? 0} de ${t.totalManzanas ?? '?'} manzanas`;
  }

  protected fechasCompletado(t: ResumenTerritorioCiclo): string {
    return t.completado.map(f => fmtFecha(f)).join(', ');
  }

  protected descargarInforme(c: CicloAdmin): void {
    const csv = aCsv(
      ['Territorio', 'Estado al cerrar', 'Veces completado', 'Fechas en que se completó', 'Primera salida', 'Última salida', 'Encargados'],
      this.resumen(c).map(t => [
        t.territorio,
        this.estadoTexto(t),
        t.completado.length,
        this.fechasCompletado(t),
        fmtFecha(t.primeraSalida, ''),
        fmtFecha(t.ultimaSalida, ''),
        t.encargados.join(', '),
      ]),
    );
    descargar(`informe-ciclo-${c.inicio.slice(0, 10)}.csv`, csv);
  }

  // ── Cerrar ciclo ──

  protected async cerrarCiclo(): Promise<void> {
    const a = this.avance();
    const faltan = a ? a.total - a.completados : 0;
    const ok = await this.ui.confirmar({
      titulo: 'Cerrar el ciclo y reiniciar todos los territorios',
      mensaje:
        (faltan > 0 ? `Todavía faltan ${faltan} territorios por completar. ` : 'Se completaron todos los territorios. ') +
        'Se guarda el informe de este ciclo y todos los territorios vuelven a empezar sin marcas. ' +
        'No se borra ningún reporte: el historial y el S-13 siguen disponibles.',
      accion: 'Cerrar ciclo',
      peligro: true,
      escribir: 'REINICIAR',
    });
    if (!ok) return;
    this.cerrando.set(true);
    try {
      await this.api.cerrarCiclo(this.notaCierre().trim() || null);
      this.notaCierre.set('');
      await Promise.all([this.cargarCiclos(), this.store.cargarReportes(true)]);
      this.toast.show('Ciclo cerrado: los territorios vuelven a empezar', 4000, 'success');
      this.vista.set('historial');
    } catch (e) {
      this.toast.show(mensajeDeError(e), 5000, 'error');
    } finally {
      this.cerrando.set(false);
    }
  }

  // ── Corrección ──

  protected async elegirTerritorio(event: Event): Promise<void> {
    const valor = (event.target as HTMLSelectElement).value;
    const t = valor ? Number(valor) : null;
    if (this.hayCambios() && !(await this.ui.confirmar({ titulo: 'Descartar cambios', mensaje: 'Hay cambios sin guardar en el territorio actual.', accion: 'Descartar' }))) {
      (event.target as HTMLSelectElement).value = String(this.territorioSel() ?? '');
      return;
    }
    this.territorioSel.set(t);
    await this.cargarEstado();
  }

  private async cargarEstado(): Promise<void> {
    const t = this.territorioSel();
    this.notaCorreccion.set('');
    if (t === null) return;
    this.cargandoTerritorio.set(true);
    try {
      const estado = await this.api.estadoTerritorio(t);
      const inicial = estadoDesde(estado, this.manzanasSel());
      this.estadoRemoto.set(estado);
      this.original.set(inicial);
      this.edicion.set(inicial);
    } catch (e) {
      this.toast.show(mensajeDeError(e), 5000, 'error');
    } finally {
      this.cargandoTerritorio.set(false);
    }
  }

  protected alternar(m: ManzanaFeature): void {
    this.edicion.set(alternar(this.edicion(), m));
  }

  protected quitarZona(i: number): void {
    this.edicion.set(quitarZona(this.edicion(), i));
  }

  protected vaciarTerritorio(): void {
    this.edicion.set(vaciar());
  }

  protected deshacer(): void {
    this.edicion.set(this.original());
  }

  protected clave = clave;

  protected async guardarCorreccion(): Promise<void> {
    const t = this.territorioSel();
    if (t === null || !this.hayCambios()) return;
    const e = this.edicion();
    const ok = await this.ui.confirmar({
      titulo: `Guardar la corrección del territorio ${t}`,
      mensaje:
        `Queda con ${e.marcadas.size} manzanas enteras y ${e.zonas.length} por calles. ` +
        'Se registra como una corrección del administrador (no se borra ningún reporte) y los encargados lo ven así al abrirlo.',
      accion: 'Guardar corrección',
    });
    if (!ok) return;
    this.guardando.set(true);
    try {
      await this.api.corregir(pedido(e, t, this.manzanasSel().length, this.notaCorreccion()));
      await this.store.cargarReportes(true);
      await this.cargarEstado();
      this.toast.show(`Territorio ${t} corregido`, 3000, 'success');
    } catch (err) {
      this.toast.show(mensajeDeError(err), 5000, 'error');
    } finally {
      this.guardando.set(false);
    }
  }
}
