import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Toast } from '../../../../core/services/toast';
import type { ManzanaFeature, SalidaAdmin } from '../../admin.models';
import { CorreccionMap, type CalleVisible } from '../../map/correccion-map';
import { AdminApi, mensajeDeError } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { AdminUi } from '../../services/admin-ui';
import {
  aporteDeSalida,
  alternarEnSalida,
  baseDeSalida,
  clave,
  estadoDeSalida,
  iguales,
  pedidoSalida,
  quitarZonaEnSalida,
  vaciar,
  zonasDeLaBase,
  type EstadoCorreccion,
} from '../../utils/correccion';
import { diaLocal } from '../../utils/analytics';
import { alternarCalle, callesParaMapa, ladosDe } from '../../utils/registro';
import { fmtFechaHora } from '../../utils/formato';

/**
 * Corrige el reporte de una salida en la que el encargado se equivocó (ADR
 * 0014): se ve cómo quedó el territorio después de esa salida, con lo que ya
 * estaba antes en gris, y se quita o agrega lo que marcó. El original queda
 * anulado en el historial y se guarda uno corregido en su lugar; el servidor
 * recalcula los reportes posteriores, y el S-13 y el resumen se actualizan.
 */
@Component({
  selector: 'app-corregir-salida',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CorreccionMap],
  templateUrl: './corregir-salida.html',
  styleUrl: './corregir-salida.css',
})
export class CorregirSalida {
  readonly reporteId = input.required<number>();
  /** true si se guardó algo. */
  readonly cerrar = output<boolean>();

  private readonly api = inject(AdminApi);
  private readonly store = inject(AdminStore);
  private readonly ui = inject(AdminUi);
  private readonly toast = inject(Toast);

  protected readonly salida = signal<SalidaAdmin | null>(null);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly nota = signal('');
  /** Día ("AAAA-MM-DD") y turno de la predicación (ADR 0018). */
  protected readonly dia = signal('');
  protected readonly turno = signal('');
  private readonly diaOriginal = signal('');
  private readonly turnoOriginal = signal('');
  protected readonly hoy = diaLocal(new Date());
  protected readonly base = signal<EstadoCorreccion>(vaciar());
  private readonly original = signal<EstadoCorreccion>(vaciar());
  protected readonly edicion = signal<EstadoCorreccion>(vaciar());
  /** Marcar manzanas enteras o elegir calles de una manzana (como al registrar una salida). */
  protected readonly modo = signal<'entera' | 'calles'>('entera');
  protected readonly manzanaCalles = signal<ManzanaFeature | null>(null);
  protected readonly calles = computed<CalleVisible[] | null>(() => {
    const m = this.manzanaCalles();
    return m && this.modo() === 'calles' ? callesParaMapa(this.base(), this.edicion(), m) : null;
  });

  protected readonly manzanas = computed<ManzanaFeature[]>(() => {
    const t = this.salida()?.territorio;
    return ((this.store.manzanas()?.features ?? []) as ManzanaFeature[])
      .filter(f => f.properties.territorio === t)
      .sort((a, b) => a.properties.nombre.localeCompare(b.properties.nombre, 'es', { numeric: true }));
  });
  protected readonly color = computed(() => this.store.colores()[this.salida()?.territorio ?? -1] ?? '#2563eb');
  protected readonly zonasBloqueadas = computed(() => zonasDeLaBase(this.base(), this.edicion()));
  protected readonly aporte = computed(() => aporteDeSalida(this.base(), this.edicion()));
  protected readonly aporteOriginal = computed(() => aporteDeSalida(this.base(), this.original()));
  protected readonly hayCambios = computed(
    () => !iguales(this.original(), this.edicion()) || this.dia() !== this.diaOriginal() || this.turno() !== this.turnoOriginal(),
  );
  protected readonly fmtFechaHora = fmtFechaHora;

  constructor() {
    const el = inject(ElementRef<HTMLElement>);
    afterNextRender(() => (el.nativeElement as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' }));
    effect(() => {
      const id = this.reporteId();
      untracked(() => void this.cargar(id));
    });
  }

  private async cargar(id: number): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    this.nota.set('');
    try {
      await this.store.cargarManzanas();
      const s = await this.api.salida(id);
      this.salida.set(s);
      const inicial = estadoDeSalida(s, this.manzanas());
      this.base.set(baseDeSalida(s, this.manzanas()));
      this.original.set(inicial);
      this.edicion.set(inicial);
      const dia = s.fechaPredicacion ?? diaLocal(new Date(s.fecha));
      this.dia.set(dia);
      this.diaOriginal.set(dia);
      this.turno.set(s.turno ?? '');
      this.turnoOriginal.set(s.turno ?? '');
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo abrir el reporte'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected cambiarModo(modo: 'entera' | 'calles'): void {
    this.modo.set(modo);
    if (modo === 'entera') this.manzanaCalles.set(null);
  }

  protected alTocarManzana(m: ManzanaFeature): void {
    if (this.modo() === 'entera') {
      this.edicion.set(alternarEnSalida(this.base(), this.edicion(), m));
      return;
    }
    if (this.base().marcadas.has(clave(m))) {
      this.toast.show(`La manzana ${m.properties.nombre} ya estaba completa antes de esta salida`, 3000, 'info');
      return;
    }
    this.manzanaCalles.set(m);
  }

  /** En modo «por calles», tocar las calles marcadas abre esa manzana; si no, las quita. */
  protected alTocarZona(i: number): void {
    if (this.modo() === 'calles') {
      const id = this.edicion().zonas[i]?.manzanaId;
      const m = id ? this.manzanas().find(x => clave(x) === id) : undefined;
      if (m) this.manzanaCalles.set(m);
      return;
    }
    this.edicion.set(quitarZonaEnSalida(this.base(), this.edicion(), i));
  }

  protected alTocarCalle(indice: number): void {
    const m = this.manzanaCalles();
    if (m) this.edicion.set(alternarCalle(this.base(), this.edicion(), m, ladosDe(m), indice));
  }

  protected deshacer(): void {
    this.manzanaCalles.set(null);
    this.edicion.set(this.original());
    this.dia.set(this.diaOriginal());
    this.turno.set(this.turnoOriginal());
  }

  protected async guardar(anular: boolean): Promise<void> {
    const s = this.salida();
    if (!s || (!anular && !this.hayCambios())) return;
    const a = this.aporte();
    const posteriores = s.posteriores
      ? ` Los ${s.posteriores} reporte(s) que vinieron después en el territorio se recalculan.`
      : '';
    const ok = await this.ui.confirmar(
      anular
        ? {
            titulo: 'Anular el reporte entero',
            mensaje:
              `La salida de ${s.encargado} en el territorio ${s.territorio} deja de contar: el territorio queda como estaba antes ` +
              `y no aparece en el S-13 ni en el resumen. El reporte queda en el historial como anulado.${posteriores}`,
            accion: 'Anular reporte',
            peligro: true,
          }
        : {
            titulo: 'Guardar la corrección del reporte',
            mensaje:
              `Esta salida queda con ${a.enteras} manzana(s) entera(s) y ${a.porCalles} por calles. ` +
              `El reporte original queda anulado en el historial y se guarda uno corregido en su lugar.${posteriores}`,
            accion: 'Guardar corrección',
          },
    );
    if (!ok) return;
    this.guardando.set(true);
    try {
      const r = await this.api.corregirSalida(s.id, {
        ...pedidoSalida(this.edicion(), anular, this.nota()),
        fechaPredicacion: anular ? null : this.dia() || null,
        turno: anular ? null : this.turno() || null,
      });
      await this.store.cargarReportes(true);
      const recalculados = r.recalculados ? ` Se recalcularon ${r.recalculados} reporte(s) posteriores.` : '';
      const detenido = r.detenido ? ' Después hubo una corrección o un cierre de ciclo: desde ahí el estado no se tocó.' : '';
      this.toast.show(`${anular ? 'Reporte anulado.' : 'Reporte corregido.'}${recalculados}${detenido}`, 6000, 'success');
      this.cerrar.emit(true);
    } catch (e) {
      this.toast.show(mensajeDeError(e), 6000, 'error');
    } finally {
      this.guardando.set(false);
    }
  }
}
