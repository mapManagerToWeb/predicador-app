import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { fmtNumero } from '../utils/formato';

export interface Barra {
  etiqueta: string;
  valor: number;
  detalle?: string;
}

/**
 * Barras horizontales de una sola serie, con el valor en la punta. Sirve para
 * rankings con nombres largos (encargados, territorios).
 */
@Component({
  selector: 'app-bar-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ':host { display: block; }',
  template: `
    <ul class="viz-barlist" role="list">
      @for (b of visibles(); track b.etiqueta; let i = $index) {
        <li
          tabindex="0"
          [attr.aria-label]="b.etiqueta + ': ' + fmt(b.valor) + ' ' + unidad() + (b.detalle ? '. ' + b.detalle : '')"
          (pointerenter)="activa.set(i)"
          (pointerleave)="activa.set(null)"
          (focus)="activa.set(i)"
          (blur)="activa.set(null)"
          [class.activa]="activa() === i"
        >
          <span class="viz-barlist-label">{{ b.etiqueta }}</span>
          <span class="viz-barlist-track">
            <span class="viz-barlist-bar" [style.width.%]="porcentaje(b.valor)"></span>
            <span class="viz-barlist-value">{{ fmt(b.valor) }}</span>
          </span>
          @if (activa() === i && b.detalle) {
            <span class="viz-tooltip viz-tooltip-inline">{{ b.detalle }}</span>
          }
        </li>
      } @empty {
        <li class="viz-empty">Sin datos en el período</li>
      }
    </ul>
    @if (barras().length > limite()) {
      <p class="viz-note">Se muestran {{ limite() }} de {{ barras().length }}. La tabla tiene el detalle completo.</p>
    }
  `,
})
export class BarList {
  readonly barras = input.required<Barra[]>();
  readonly unidad = input('');
  readonly limite = input(10);

  protected readonly activa = signal<number | null>(null);
  protected readonly visibles = computed(() => this.barras().slice(0, this.limite()));
  private readonly maximo = computed(() => Math.max(1, ...this.barras().map(b => b.valor)));

  protected porcentaje(valor: number): number {
    return (valor / this.maximo()) * 100;
  }

  protected fmt(v: number): string {
    return fmtNumero(v);
  }
}
