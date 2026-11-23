import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { WhatsAppService } from '../../../../core/services/whatsapp';
import { Toast } from '../../../../core/services/toast';
import type { ManzanaFeature, ReporteAdmin, SalidaAdmin } from '../../admin.models';
import { CorreccionMap } from '../../map/correccion-map';
import { AdminApi, mensajeDeError } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { diaLocal } from '../../utils/analytics';
import { baseDeSalida, estadoDeSalida, vaciar, zonasDeLaBase, type EstadoCorreccion } from '../../utils/correccion';
import { envioDe } from '../../utils/envio';
import { fmtFecha, fmtTelefono } from '../../utils/formato';
import { fechaParaWhatsApp } from '../registrar/registrar';

/** Un territorio del envío, con su salida (lo que había antes y cómo quedó). */
interface TerritorioDelEnvio {
  reporte: ReporteAdmin;
  salida: SalidaAdmin;
}

function unir(estados: EstadoCorreccion[]): EstadoCorreccion {
  return estados.reduce<EstadoCorreccion>(
    (todo, e) => ({ marcadas: new Set([...todo.marcadas, ...e.marcadas]), zonas: [...todo.zonas, ...e.zonas] }),
    vaciar(),
  );
}

/**
 * «Reenviar»: el administrador vuelve a enviar por WhatsApp un reporte que ya
 * se envió, para ver cómo llegó o tenerlo. La app guarda una fila por
 * territorio, pero el hermano los mandó juntos: aquí se abre el envío completo
 * (todos sus territorios, cada uno se puede quitar) y va en un solo mensaje,
 * con la foto del mapa como la de la app. Llega al número de la copia (si no
 * hay, al de «Registrar salida»): lo decide el servidor.
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
      } @else if (envio().length) {
        <dl class="datos">
          <dt>Encargado</dt><dd>{{ nombre() || 'Sin nombre' }}</dd>
          <dt>Predicación</dt><dd>{{ fmtFecha(dia() + 'T12:00:00') }}{{ turno() ? ' · ' + turno() : '' }}</dd>
          <dt>Llega a</dt><dd>{{ destino() }}</dd>
        </dl>
        <fieldset class="territorios">
          <legend>{{ envio().length > 1 ? 'Territorios de este envío (' + envio().length + ')' : 'Territorio' }}</legend>
          @for (t of envio(); track t.reporte.id) {
            @if (envio().length > 1) {
              <label class="territorio">
                <input type="checkbox" [checked]="elegidos().has(t.reporte.id)" (change)="alternar(t.reporte.id)" />
                <span class="punto" [style.background]="colores()[t.reporte.territorio]"></span>
                <span>Territorio {{ t.reporte.territorio }}</span>
                <span class="adm-muted">{{ detalle(t.reporte) }}</span>
              </label>
            } @else {
              <div class="territorio">
                <span class="punto" [style.background]="colores()[t.reporte.territorio]"></span>
                <span>Territorio {{ t.reporte.territorio }}</span>
                <span class="adm-muted">{{ detalle(t.reporte) }}</span>
              </div>
            }
          }
        </fieldset>
        @if (seleccion().length) {
          <p class="adm-sub">Así se ve la foto que va en el mensaje:</p>
          <app-correccion-map
            [manzanas]="manzanas()"
            [estado]="estado()"
            [colores]="colores()"
            [bloqueadas]="base().marcadas"
            [zonasBloqueadas]="zonasBloqueadas()"
            [anterioresEnColor]="true"
            [alto]="360"
          />
        } @else {
          <p class="adm-muted">Elige al menos un territorio.</p>
        }
        <div class="adm-actions">
          <button class="adm-btn" type="button" (click)="cerrar.emit()">Cancelar</button>
          <button class="adm-btn primary" type="button" [disabled]="cargando() || enviando() || !seleccion().length" (click)="reenviar()">
            {{ enviando() ? 'Enviando…' : seleccion().length > 1 ? 'Reenviar ' + seleccion().length + ' territorios' : 'Reenviar' }}
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
    .territorios { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
    .territorios legend { font-size: var(--text-sm); color: var(--ink-muted); margin-bottom: 4px; padding: 0; }
    .territorio { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); font-weight: 600; min-height: 32px; }
    .territorio input { width: 18px; height: 18px; min-height: 0; margin: 0; }
    .territorio .adm-muted { font-weight: 400; }
    .punto { width: 12px; height: 12px; border-radius: 50%; flex: none; border: 1px solid rgb(0 0 0 / 0.2); }
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

  protected readonly envio = signal<TerritorioDelEnvio[]>([]);
  protected readonly elegidos = signal<ReadonlySet<number>>(new Set());
  protected readonly destino = signal('…');
  protected readonly cargando = signal(true);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly seleccion = computed(() => this.envio().filter(t => this.elegidos().has(t.reporte.id)));
  private readonly primero = computed(() => this.envio()[0]?.reporte ?? null);
  protected readonly nombre = computed(() => {
    const r = this.primero();
    return r ? `${r.encargadoNombre ?? ''} ${r.encargadoApellido ?? ''}`.trim() : '';
  });
  protected readonly dia = computed(() => {
    const r = this.primero();
    return r ? (r.fechaPredicacion ?? diaLocal(new Date(r.fecha))) : '';
  });
  protected readonly turno = computed(() => this.primero()?.turno ?? '');

  private readonly porTerritorio = computed(() => {
    const m = new Map<number, ManzanaFeature[]>();
    for (const f of (this.store.manzanas()?.features ?? []) as ManzanaFeature[]) {
      const t = f.properties.territorio;
      m.set(t, [...(m.get(t) ?? []), f]);
    }
    return m;
  });
  private manzanasDe(t: number): ManzanaFeature[] {
    return this.porTerritorio().get(t) ?? [];
  }
  protected readonly manzanas = computed(() => this.seleccion().flatMap(t => this.manzanasDe(t.reporte.territorio)));
  /** Cómo quedaron los territorios con este envío (lo de antes en color, lo nuevo con borde, como al registrar). */
  protected readonly estado = computed(() =>
    unir(this.seleccion().map(t => estadoDeSalida(t.salida, this.manzanasDe(t.reporte.territorio)))),
  );
  protected readonly base = computed(() => unir(this.seleccion().map(t => baseDeSalida(t.salida, this.manzanasDe(t.reporte.territorio)))));
  protected readonly zonasBloqueadas = computed(() => zonasDeLaBase(this.base(), this.estado()));
  protected readonly colores = computed(() => {
    const c: Record<number, string> = {};
    for (const t of this.envio()) c[t.reporte.territorio] = this.store.colores()[t.reporte.territorio] ?? '#2563eb';
    return c;
  });
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
    this.envio.set([]);
    try {
      const destino = this.cargarDestino();
      await Promise.all([this.store.cargarManzanas(), this.store.cargarReportes()]);
      const todos = this.store.todosLosReportes() ?? [];
      const reporte = todos.find(r => r.id === id);
      if (!reporte) throw new Error('sin reporte');
      const filas = envioDe(reporte, todos);
      const salidas = await Promise.all(filas.map(r => this.api.salida(r.id)));
      this.envio.set(filas.map((r, i) => ({ reporte: r, salida: salidas[i] })));
      this.elegidos.set(new Set(filas.map(r => r.id)));
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

  protected detalle(r: ReporteAdmin): string {
    return r.estado === 'completed' ? 'completo' : `${r.manzanasMarcadas ?? 0} de ${r.totalManzanas ?? '—'} manzanas`;
  }

  protected alternar(id: number): void {
    const s = new Set(this.elegidos());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.elegidos.set(s);
  }

  protected async reenviar(): Promise<void> {
    const elegidos = this.seleccion();
    const r = this.primero();
    if (!r || !elegidos.length) return;
    this.enviando.set(true);
    try {
      const captura = (await this.mapa()?.capturarSalida()) ?? null;
      const resultado = await this.whatsapp.reenviarDesdePanel({
        encargadoNombre: r.encargadoNombre ?? '',
        encargadoApellido: r.encargadoApellido ?? '',
        fechaRegistro: fechaParaWhatsApp(this.dia()),
        predicacion: this.turno(),
        territorios: elegidos.map(({ reporte }) => ({
          numero: reporte.territorio,
          finalizado: reporte.estado === 'completed',
          totalManzanas: reporte.totalManzanas ?? this.manzanasDe(reporte.territorio).length,
          manzanasMarcadas: reporte.manzanasMarcadas ?? 0,
        })),
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
