import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/**
 * Mapa de calor día × hora con una sola tonalidad: la intensidad crece con la
 * cantidad (secuencial) y el cero queda como celda neutra.
 */
@Component({
  selector: 'app-heatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ':host { display: block; }',
  template: `
    <div class="viz-heat" role="grid" aria-label="Reportes por día de la semana y hora">
      <span></span>
      @for (h of horas; track h) {
        <span class="viz-heat-hour">{{ h % 3 === 0 ? h : '' }}</span>
      }
      @for (fila of matriz(); track $index; let d = $index) {
        <span class="viz-heat-day">{{ dias[d].slice(0, 3) }}</span>
        @for (valor of fila; track $index; let h = $index) {
          <span
            class="viz-heat-cell"
            role="gridcell"
            tabindex="0"
            [class.cero]="valor === 0"
            [style.opacity]="valor === 0 ? 1 : 0.18 + 0.82 * (valor / maximo())"
            [attr.aria-label]="dias[d] + ' ' + h + ':00: ' + valor + ' reportes'"
            (pointerenter)="activa.set({ d, h, valor })"
            (pointerleave)="activa.set(null)"
            (focus)="activa.set({ d, h, valor })"
            (blur)="activa.set(null)"
          ></span>
        }
      }
    </div>
    <div class="viz-heat-foot">
      <span class="viz-heat-readout">
        @if (activa(); as a) {
          <strong>{{ a.valor }} {{ a.valor === 1 ? 'reporte' : 'reportes' }}</strong>
          {{ dias[a.d] }} de {{ a.h }}:00 a {{ a.h + 1 }}:00
        } @else {
          Pasá el cursor por una celda para ver el detalle
        }
      </span>
      <span class="viz-heat-scale" aria-hidden="true">
        Menos
        @for (o of escala; track o) {
          <span class="viz-heat-cell" [style.opacity]="o"></span>
        }
        Más
      </span>
    </div>
  `,
})
export class Heatmap {
  /** 7 filas (lunes a domingo) × 24 horas. */
  readonly matriz = input.required<number[][]>();

  protected readonly dias = DIAS;
  protected readonly horas = Array.from({ length: 24 }, (_, h) => h);
  protected readonly escala = [0.18, 0.45, 0.72, 1];
  protected readonly activa = signal<{ d: number; h: number; valor: number } | null>(null);
  protected readonly maximo = computed(() => Math.max(1, ...this.matriz().flat()));
}
