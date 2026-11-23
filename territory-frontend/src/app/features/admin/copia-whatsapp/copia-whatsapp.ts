import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Toast } from '../../../core/services/toast';
import { esCelularChileno, MENSAJE_TELEFONO_INVALIDO } from '../../../core/utils/phone';
import { AdminApi, mensajeDeError } from '../services/admin-api';
import { fmtTelefono } from '../utils/formato';

/**
 * «Copia de cada reporte por WhatsApp»: WhatsApp no deja que la app escriba en
 * el grupo, y los hermanos se olvidaban de reenviar el reporte que les llega.
 * Con un número aquí, cada reporte que envían desde la app le llega también a
 * esa persona (por ejemplo, al encargado de territorios).
 */
@Component({
  selector: 'app-copia-whatsapp',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="adm-card cw-tarjeta" aria-labelledby="cw-titulo">
      <h2 id="cw-titulo">Copia de cada reporte por WhatsApp</h2>
      <p class="adm-sub">
        Cada reporte que un hermano envía desde la app le llega a él y también a este número (por ejemplo, el tuyo o el del
        hermano a cargo de territorios). No se envía copia de lo que registras en el panel ni durante una capacitación. Déjalo
        vacío para no recibir copias.
      </p>
      @if (cargado()) {
        @if (editando()) {
          <form class="cw-form" (submit)="$event.preventDefault(); guardar()">
            <label class="adm-field">
              <span>Número de WhatsApp</span>
              <input
                class="adm-input"
                type="tel"
                inputmode="tel"
                autocomplete="off"
                placeholder="9 1234 5678"
                [value]="texto()"
                (input)="texto.set(leer($event))"
              />
            </label>
            <div class="adm-actions">
              <button class="adm-btn" type="button" [disabled]="guardando()" (click)="editando.set(false)">Cancelar</button>
              <button class="adm-btn primary" type="submit" [disabled]="guardando()">Guardar</button>
            </div>
          </form>
        } @else {
          <div class="cw-estado">
            @if (telefono()) {
              <span>Las copias llegan a <strong>{{ fmtTelefono(telefono()) }}</strong></span>
            } @else {
              <span class="adm-muted">Sin copia: el reporte solo le llega al hermano que lo envía.</span>
            }
            <button class="adm-btn" type="button" (click)="editar()">{{ telefono() ? 'Cambiar' : 'Elegir un número' }}</button>
          </div>
        }
      } @else if (sinServidor()) {
        <p class="adm-muted">Se puede usar cuando el servidor esté actualizado.</p>
      }
    </section>
  `,
  styles: `
    :host { display: contents; }
    .cw-tarjeta { grid-column: 1 / -1; }
    .cw-tarjeta .adm-sub { max-width: 70ch; line-height: 1.5; }
    .cw-estado { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-2); }
    .cw-form { display: flex; flex-direction: column; gap: var(--space-2); max-width: 360px; margin-top: var(--space-2); }
  `,
})
export class CopiaWhatsappPanel {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);

  protected readonly telefono = signal('');
  protected readonly texto = signal('');
  protected readonly cargado = signal(false);
  protected readonly sinServidor = signal(false);
  protected readonly editando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly fmtTelefono = fmtTelefono;
  protected readonly valido = computed(() => !this.texto().trim() || esCelularChileno(this.texto()));

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    try {
      this.telefono.set((await this.api.whatsappCopia()).telefono ?? '');
      this.cargado.set(true);
    } catch {
      this.sinServidor.set(true);
    }
  }

  protected leer(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected editar(): void {
    this.texto.set(this.telefono() ? fmtTelefono(this.telefono()) : '');
    this.editando.set(true);
  }

  protected async guardar(): Promise<void> {
    if (!this.valido()) {
      this.toast.show(MENSAJE_TELEFONO_INVALIDO, 5000, 'warning');
      return;
    }
    this.guardando.set(true);
    try {
      const { telefono } = await this.api.setWhatsappCopia(this.texto().trim());
      this.telefono.set(telefono ?? '');
      this.editando.set(false);
      this.toast.show(telefono ? 'Listo: las copias llegarán a ese número' : 'Listo: ya no se envían copias', 3500, 'success');
    } catch (e) {
      this.toast.show(mensajeDeError(e, 'No se pudo guardar el número'), 5000, 'error');
    } finally {
      this.guardando.set(false);
    }
  }
}
