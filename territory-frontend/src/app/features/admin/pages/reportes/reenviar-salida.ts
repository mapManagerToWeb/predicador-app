import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { WhatsAppService } from '../../../../core/services/whatsapp';
import { Toast } from '../../../../core/services/toast';
import type { ManzanaFeature, ReporteAdmin, SalidaAdmin } from '../../admin.models';
import { CorreccionMap } from '../../map/correccion-map';
import { AdminApi, mensajeDeError } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { diaLocal } from '../../utils/analytics';
import { baseDeSalida, estadoDeSalida, vaciar, zonasDeLaBase } from '../../utils/correccion';
import { fmtFecha, fmtTelefono } from '../../utils/formato';
import { fechaParaWhatsApp } from '../registrar/registrar';

/**
 * «Reenviar»: el administrador vuelve a enviar por WhatsApp un reporte que ya
 * se envió, para ver cómo llegó o tenerlo. Muestra la misma foto del mapa (cómo
 * quedó el territorio con ese reporte) y los datos del mensaje. Va al número de
 * la copia (si no hay, al de «Registrar salida»): lo decide el servidor.
 */
@Component({
  selector: 'app-reenviar-salida',
  imports: [CorreccionMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="adm-card adm-hoja reenviar-salida" aria-labelledby="reenviar-titulo">
      <div class="cabecera">
        <h2 id="reenviar-titulo">Reenviar por WhatsApp</h2>
        <button class="adm-btn ghost" type="button" (click)="cerrar.emit()">Cerrar</button>
      </div>
      @if (error(); as e) {
        <p class="adm-muted" role="alert">{{ e }}</p>
      } @else if (reporte(); as r) {
        <dl class="datos">
          <dt>Encargado</dt><dd>{{ nombre() || 'Sin nombre' }}</dd>
          <dt>Predicación</dt><dd>{{ fmtFecha(dia() + 'T12:00:00') }}{{ r.turno ? ' · ' + r.turno : '' }}</dd>
          <dt>Territorio</dt><dd>{{ r.territorio }} · {{ completo() ? 'completo' : (r.manzanasMarcadas ?? 0) + ' de ' + (r.totalManzanas ?? '—') + ' manzanas' }}</dd>
          <dt>Llega a</dt><dd>{{ destino() }}</dd>
        </dl>
        <p class="adm-sub">Así se ve la foto que va en el mensaje:</p>
        <app-correccion-map
          [manzanas]="manzanas()"
          [estado]="estado()"
          [color]="color()"
          [bloqueadas]="base().marcadas"
          [zonasBloqueadas]="zonasBloqueadas()"
          [anterioresEnColor]="true"
          [alto]="340"
        />
        <div class="adm-actions">
          <button class="adm-btn" type="button" (click)="cerrar.emit()">Cancelar</button>
          <button class="adm-btn primary" type="button" [disabled]="cargando() || enviando()" (click)="reenviar()">
            {{ enviando() ? 'Enviando…' : 'Reenviar' }}
          </button>
        </div>
      } @else {
        <p class="adm-muted">Cargando el reporte…</p>
      }
    </section>
  `,
  styles: `
    .reenviar-salida { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-4); }
    .cabecera { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); }
    .cabecera h2 { margin: 0; }
    .datos { display: grid; grid-template-columns: max-content 1fr; gap: 4px var(--space-4); margin: 0; font-size: var(--text-sm); }
    .datos dt { color: var(--ink-muted); }
    .datos dd { margin: 0; font-weight: 600; }
    .adm-sub { margin: 0; }
  `,
})
export class ReenviarSalida {
  readonly reporteId = input.required<number>();
  readonly cerrar = output<void>();

  private readonly api = inject(AdminApi);
  private readonly store = inject(AdminStore);
  private readonly whatsapp = inject(WhatsAppService);
  private readonly toast = inject(Toast);
  private readonly mapa = viewChild(CorreccionMap);

  protected readonly salida = signal<SalidaAdmin | null>(null);
  protected readonly destino = signal('…');
  protected readonly cargando = signal(true);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly reporte = computed<ReporteAdmin | null>(
    () => (this.salida() ? ((this.store.todosLosReportes() ?? []).find(r => r.id === this.reporteId()) ?? null) : null),
  );
  protected readonly nombre = computed(() => {
    const r = this.reporte();
    return r ? `${r.encargadoNombre ?? ''} ${r.encargadoApellido ?? ''}`.trim() : '';
  });
  protected readonly dia = computed(() => {
    const r = this.reporte();
    return r ? (r.fechaPredicacion ?? diaLocal(new Date(r.fecha))) : '';
  });
  protected readonly completo = computed(() => this.reporte()?.estado === 'completed');
  protected readonly manzanas = computed<ManzanaFeature[]>(() => {
    const t = this.salida()?.territorio;
    return ((this.store.manzanas()?.features ?? []) as ManzanaFeature[]).filter(f => f.properties.territorio === t);
  });
  /** Cómo quedó el territorio con este reporte (lo de antes en color, lo nuevo con borde, como al registrar). */
  protected readonly estado = computed(() => {
    const s = this.salida();
    return s ? estadoDeSalida(s, this.manzanas()) : vaciar();
  });
  protected readonly base = computed(() => {
    const s = this.salida();
    return s ? baseDeSalida(s, this.manzanas()) : vaciar();
  });
  protected readonly zonasBloqueadas = computed(() => zonasDeLaBase(this.base(), this.estado()));
  protected readonly color = computed(() => this.store.colores()[this.salida()?.territorio ?? -1] ?? '#2563eb');
  protected readonly fmtFecha = fmtFecha;

  constructor() {
    effect(() => {
      const id = this.reporteId();
      untracked(() => void this.cargar(id));
    });
  }

  private async cargar(id: number): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    this.salida.set(null);
    try {
      const destino = this.cargarDestino();
      await Promise.all([this.store.cargarManzanas(), this.store.cargarReportes()]);
      this.salida.set(await this.api.salida(id));
      if (!this.reporte()) throw new Error('sin reporte');
      await destino;
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo abrir el reporte'));
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarDestino(): Promise<void> {
    const [copia, panel] = await Promise.all([
      this.api.whatsappCopia().catch(() => ({ telefono: '' })),
      this.api.whatsappDestino().catch(() => ({ telefono: '' })),
    ]);
    const numero = copia.telefono || panel.telefono;
    this.destino.set(numero ? fmtTelefono(numero) : 'el número configurado en el servidor');
  }

  protected async reenviar(): Promise<void> {
    const r = this.reporte();
    if (!r) return;
    this.enviando.set(true);
    try {
      const captura = (await this.mapa()?.capturarSalida()) ?? null;
      const resultado = await this.whatsapp.reenviarDesdePanel({
        encargadoNombre: r.encargadoNombre ?? '',
        encargadoApellido: r.encargadoApellido ?? '',
        fechaRegistro: fechaParaWhatsApp(this.dia()),
        predicacion: r.turno ?? '',
        territorios: [
          {
            numero: r.territorio,
            finalizado: this.completo(),
            totalManzanas: r.totalManzanas ?? this.manzanas().length,
            manzanasMarcadas: r.manzanasMarcadas ?? 0,
          },
        ],
        screenshotBase64: captura,
        destinationNumber: null,
      });
      if (resultado.success) {
        this.toast.show(`Reporte reenviado a ${this.destino()}`, 4000, 'sent');
        this.cerrar.emit();
      } else {
        this.toast.show('No se pudo reenviar el WhatsApp. Inténtalo de nuevo.', 5000, 'error');
      }
    } catch (e) {
      this.toast.show(mensajeDeError(e, 'No se pudo reenviar el WhatsApp'), 5000, 'error');
    } finally {
      this.enviando.set(false);
    }
  }
}
