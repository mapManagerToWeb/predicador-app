import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { Toast } from '../../../core/services/toast';
import type { PruebaCapacitacion } from '../admin.models';
import { mensajeDeError } from '../services/admin-api';
import { AdminStore } from '../services/admin-store';
import { AdminUi } from '../services/admin-ui';
import { fmtFechaHora } from '../utils/formato';

/** Cada cuánto se actualiza la cantidad de pruebas mientras dura la capacitación. */
export const REFRESCO_CAPACITACION_MS = 30_000;

/**
 * Modo capacitación del panel. Mientras dura, los hermanos usan la app de
 * verdad (reportes, WhatsApp, visor) y todo lo que envían es de prueba; al
 * terminar se borra y cada territorio vuelve a como estaba.
 *
 * `vista="barra"`: el aviso arriba de todas las páginas (solo si hay una en
 * curso). `vista="tarjeta"`: la tarjeta del Resumen para empezarla o terminarla.
 */
@Component({
  selector: 'app-capacitacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (vista() === 'barra') {
      @if (activa()) {
        <div class="cap-barra" role="status">
          <span>
            <strong>Capacitación en curso</strong> desde {{ desde() }} · {{ textoPruebas() }}. Al terminar se borran.
          </span>
          <button class="adm-btn" type="button" (click)="abierta.set(true)">Ver y terminar</button>
        </div>
      }
    } @else {
      <section class="adm-card cap-tarjeta" aria-labelledby="cap-titulo">
        <h2 id="cap-titulo">Capacitación</h2>
        @if (estado() === null) {
          <p class="adm-sub">Se puede usar cuando el servidor esté actualizado.</p>
        } @else if (activa()) {
          <p class="adm-sub">
            En curso desde {{ desde() }}: {{ textoPruebas() }}. Todo lo que se envíe hasta que la termines es de prueba.
          </p>
          <div class="adm-actions">
            <button class="adm-btn danger" type="button" [disabled]="ocupado()" (click)="abierta.set(true)">Ver y terminar</button>
          </div>
        } @else {
          <p class="adm-sub">
            Para enseñar a usar la app con envíos de verdad: los hermanos marcan y envían en cualquier territorio, les llega
            el WhatsApp y el visor lo muestra. Al terminar se borra todo lo enviado durante la capacitación y cada territorio
            vuelve a como estaba. Mientras dure no se puede cerrar el ciclo ni corregir reportes de antes.
          </p>
          <div class="adm-actions">
            <button class="adm-btn primary" type="button" [disabled]="ocupado()" (click)="empezar()">Empezar capacitación</button>
          </div>
        }
      </section>
    }

    @if (abierta() && activa()) {
      <div class="adm-overlay" tabindex="-1" (click)="cerrarSiFondo($event)" (keydown.escape)="abierta.set(false)">
        <div class="adm-dialog cap-lista" role="dialog" aria-modal="true" aria-labelledby="cap-lista-titulo">
          <h2 id="cap-lista-titulo">Reportes de prueba</h2>
          <p>
            Lo enviado desde {{ desde() }}: al terminar se borra todo. Si alguno era una salida real, anótalo y regístralo
            después en «Registrar salida».
          </p>
          @if (pruebas().length) {
            <ul>
              @for (p of pruebas(); track p.id) {
                <li>
                  <strong>Territorio {{ p.territorio }}</strong>
                  <span>{{ p.encargado ?? 'Sin nombre' }}{{ p.estado === 'completed' ? ' · completo' : '' }}</span>
                  <span class="adm-muted">{{ fmtFechaHora(p.fecha) }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="adm-muted">Todavía no se ha enviado nada.</p>
          }
          <div class="adm-actions">
            <button class="adm-btn" type="button" (click)="abierta.set(false)">Volver</button>
            <button class="adm-btn danger" type="button" [disabled]="ocupado()" (click)="terminar()">
              {{ pruebas().length ? 'Terminar y borrar las pruebas' : 'Terminar capacitación' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: contents; }
    .cap-barra {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4);
      margin-bottom: var(--space-4); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
      background: #1f2937; color: #f9fafb; font-size: var(--text-sm); line-height: 1.4;
    }
    .cap-barra strong { color: #fde047; }
    .cap-tarjeta { grid-column: 1 / -1; }
    .cap-tarjeta .adm-sub { max-width: 70ch; line-height: 1.5; }
    .cap-lista { width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); display: flex; flex-direction: column; }
    .cap-lista ul { list-style: none; margin: 0 0 var(--space-4); padding: 0; overflow-y: auto; border-top: 1px solid var(--color-border-solid); }
    .cap-lista li {
      display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--space-3); align-items: baseline;
      padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border-solid); font-size: var(--text-sm);
    }
    @media (max-width: 600px) { .cap-lista li { grid-template-columns: 1fr auto; } .cap-lista li > span:nth-child(2) { grid-column: 1 / -1; grid-row: 2; } }
  `,
})
export class CapacitacionPanel {
  readonly vista = input<'barra' | 'tarjeta'>('tarjeta');

  private readonly store = inject(AdminStore);
  private readonly ui = inject(AdminUi);
  private readonly toast = inject(Toast);

  protected readonly estado = this.store.capacitacion;
  protected readonly activa = computed(() => this.estado()?.activa === true);
  protected readonly pruebas = computed<PruebaCapacitacion[]>(() => this.estado()?.pruebas ?? []);
  protected readonly desde = computed(() => fmtFechaHora(this.estado()?.desde ?? null));
  protected readonly textoPruebas = computed(() => {
    const n = this.pruebas().length;
    return n === 0 ? 'ningún reporte de prueba todavía' : n === 1 ? '1 reporte de prueba' : `${n} reportes de prueba`;
  });
  protected readonly abierta = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly fmtFechaHora = fmtFechaHora;

  constructor() {
    void this.store.cargarCapacitacion();
    // La barra (siempre a la vista en el panel) mantiene al día la cantidad de pruebas, y se
    // entera si la capacitación se empezó o se terminó desde otro aparato.
    const reloj = setInterval(() => {
      if (this.vista() === 'barra') void this.store.cargarCapacitacion();
    }, REFRESCO_CAPACITACION_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  protected async empezar(): Promise<void> {
    const ok = await this.ui.confirmar({
      titulo: 'Empezar la capacitación',
      mensaje:
        'Desde ahora todo lo que se envíe desde la app, y lo que registres en el panel, es de prueba: llega el WhatsApp y se ve ' +
        'en el visor, pero al terminar se borra. Avisa a los hermanos que no envíen salidas reales mientras dure.',
      accion: 'Empezar',
    });
    if (!ok) return;
    this.ocupado.set(true);
    try {
      await this.store.empezarCapacitacion();
      this.toast.show('Capacitación en curso', 3000, 'success');
    } catch (e) {
      this.toast.show(mensajeDeError(e, 'No se pudo empezar la capacitación'), 5000, 'error');
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async terminar(): Promise<void> {
    // Lo último antes de decidir (pudo llegar algo mientras se miraba la lista).
    await this.store.cargarCapacitacion();
    const n = this.pruebas().length;
    this.abierta.set(false);
    const ok = await this.ui.confirmar(
      n === 0
        ? { titulo: 'Terminar la capacitación', mensaje: 'No se envió ningún reporte de prueba: no hay nada que borrar.', accion: 'Terminar' }
        : {
            titulo: `Borrar ${n === 1 ? 'el reporte' : `los ${n} reportes`} de prueba`,
            mensaje:
              `Se borra todo lo enviado desde ${this.desde()} y cada territorio vuelve a como estaba antes de la capacitación. ` +
              'No se puede deshacer.',
            accion: 'Terminar y borrar',
            peligro: true,
            escribir: 'BORRAR',
          },
    );
    if (!ok) return;
    this.ocupado.set(true);
    try {
      const borrados = await this.store.terminarCapacitacion();
      this.toast.show(
        borrados === 0
          ? 'Capacitación terminada'
          : `Capacitación terminada: ${borrados === 1 ? 'se borró 1 reporte' : `se borraron ${borrados} reportes`} de prueba`,
        5000,
        'success',
      );
    } catch (e) {
      this.toast.show(mensajeDeError(e, 'No se pudo terminar la capacitación'), 6000, 'error');
    } finally {
      this.ocupado.set(false);
    }
  }

  protected cerrarSiFondo(evento: MouseEvent): void {
    if (evento.target === evento.currentTarget) this.abierta.set(false);
  }
}
