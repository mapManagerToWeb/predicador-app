import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  Apariencia,
  OPACIDAD_PREDICADAS_MAXIMA,
  OPACIDAD_PREDICADAS_MINIMA,
  OPACIDAD_PREDICADAS_POR_DEFECTO,
  limpiarOpacidad,
  opacidadFranja,
} from '../../../core/services/apariencia';
import { Toast } from '../../../core/services/toast';
import { AdminApi, mensajeDeError } from '../services/admin-api';

/** Color de muestra para la vista previa (un rosado como el de varios territorios). */
const MUESTRA = '225, 29, 116';

/**
 * «Intensidad de lo predicado»: qué tan fuerte se pintan las manzanas
 * predicadas en el mapa de los hermanos y en el visor. Algunos hermanos las
 * veían «muy claritas» y se confundían. Vale para todos.
 */
@Component({
  selector: 'app-apariencia',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="adm-card ap-tarjeta" aria-labelledby="ap-titulo">
      <h2 id="ap-titulo">Intensidad de lo predicado</h2>
      <p class="adm-sub">
        Qué tan fuerte se pintan las manzanas predicadas en el mapa de los hermanos y en el visor. Vale para todos; lo ven
        al abrir el mapa.
      </p>
      <div class="ap-cuerpo">
        <div class="ap-control">
          <label class="ap-etiqueta" for="ap-rango">
            <span>Intensidad</span>
            <strong>{{ porcentaje() }} %</strong>
          </label>
          <input
            id="ap-rango"
            type="range"
            [min]="minimo"
            [max]="maximo"
            step="5"
            [value]="porcentaje()"
            (input)="elegir($event)"
          />
          <div class="ap-extremos" aria-hidden="true"><span>Más suave</span><span>Más fuerte</span></div>
          <div class="adm-actions">
            <button class="adm-btn" type="button" [disabled]="valor() === porDefecto || guardando()" (click)="valor.set(porDefecto)">
              La de siempre
            </button>
            <button class="adm-btn primary" type="button" [disabled]="!cambiado() || guardando()" (click)="guardar()">
              Guardar
            </button>
          </div>
        </div>
        <div class="ap-muestras" aria-label="Cómo se verá">
          @for (fondo of fondos; track fondo.nombre) {
            <figure class="ap-muestra" [style.background]="fondo.color">
              <div class="ap-manzana" [style.background]="rgba(valor())"><span>Predicada</span></div>
              <div class="ap-manzana ap-parcial" [style.background]="rgba(franja())">
                <i class="ap-calle"></i><span>Una calle</span>
              </div>
              <div class="ap-manzana" [style.background]="rgba(0.1)"><span>Sin predicar</span></div>
              <figcaption>{{ fondo.nombre }}</figcaption>
            </figure>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    :host { display: contents; }
    .ap-tarjeta { grid-column: 1 / -1; }
    .ap-tarjeta .adm-sub { max-width: 70ch; line-height: 1.5; }
    .ap-cuerpo { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: var(--space-6); align-items: start; margin-top: var(--space-3); }
    .ap-control { display: flex; flex-direction: column; gap: var(--space-2); }
    .ap-etiqueta { display: flex; justify-content: space-between; font-size: var(--text-sm); }
    .ap-etiqueta strong { font-variant-numeric: tabular-nums; }
    .ap-control input[type='range'] { width: 100%; accent-color: var(--color-primary); min-height: 32px; }
    .ap-extremos { display: flex; justify-content: space-between; font-size: var(--text-xs); color: var(--ink-muted); }
    .ap-muestras { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
    .ap-muestra { margin: 0; padding: var(--space-3); border-radius: var(--radius-md); display: grid; gap: 8px; }
    .ap-muestra figcaption { font-size: var(--text-xs); text-align: center; color: #1f2937; background: rgba(255, 255, 255, 0.8); border-radius: 6px; padding: 2px 6px; justify-self: center; }
    .ap-manzana { position: relative; height: 40px; border: 2px solid rgb(225, 29, 116); border-radius: 3px; display: grid; place-items: center; overflow: hidden; }
    .ap-manzana span { position: relative; font-size: 11px; font-weight: 600; color: #111827; background: rgba(255, 255, 255, 0.85); padding: 1px 6px; border-radius: 4px; }
    .ap-calle { position: absolute; left: 0; right: 0; bottom: -2px; height: 7px; background: rgb(225, 29, 116); box-shadow: 0 0 0 2px rgba(17, 24, 39, 0.8); }
    @media (max-width: 900px) { .ap-cuerpo { grid-template-columns: 1fr; } }
  `,
})
export class AparienciaPanel {
  private readonly apariencia = inject(Apariencia);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);

  protected readonly minimo = OPACIDAD_PREDICADAS_MINIMA * 100;
  protected readonly maximo = OPACIDAD_PREDICADAS_MAXIMA * 100;
  protected readonly porDefecto = OPACIDAD_PREDICADAS_POR_DEFECTO;
  protected readonly fondos = [
    { nombre: 'Mapa', color: '#f2efe9' },
    { nombre: 'Satélite', color: '#55604a' },
  ];

  /** Lo que se está eligiendo (todavía sin guardar). */
  protected readonly valor = signal(this.apariencia.opacidadPredicadas());
  protected readonly guardando = signal(false);
  protected readonly porcentaje = computed(() => Math.round(this.valor() * 100));
  protected readonly franja = computed(() => opacidadFranja(this.valor()));
  protected readonly cambiado = computed(() => this.valor() !== this.apariencia.opacidadPredicadas());

  constructor() {
    void this.apariencia.cargar();
    // Cuando llega la guardada del servidor, el control la muestra (si no se estaba cambiando).
    let ultima = this.apariencia.opacidadPredicadas();
    effect(() => {
      const guardada = this.apariencia.opacidadPredicadas();
      untracked(() => {
        if (this.valor() === ultima) this.valor.set(guardada);
        ultima = guardada;
      });
    });
  }

  protected rgba(opacidad: number): string {
    return `rgba(${MUESTRA}, ${opacidad})`;
  }

  protected elegir(evento: Event): void {
    this.valor.set(limpiarOpacidad(Number((evento.target as HTMLInputElement).value) / 100));
  }

  protected async guardar(): Promise<void> {
    this.guardando.set(true);
    try {
      const guardada = await this.api.setOpacidadPredicadas(this.valor());
      this.apariencia.usar(guardada);
      this.valor.set(guardada);
      this.toast.show('Guardado: los hermanos lo verán al abrir el mapa', 4000, 'success');
    } catch (e) {
      this.toast.show(mensajeDeError(e, 'No se pudo guardar la intensidad'), 5000, 'error');
    } finally {
      this.guardando.set(false);
    }
  }
}
