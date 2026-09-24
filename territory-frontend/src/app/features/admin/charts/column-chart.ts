import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { fmtNumero } from '../utils/formato';

export interface Columna {
  etiqueta: string;
  valor: number;
  /** Líneas extra del tooltip (la primera línea es el valor). */
  detalle?: string[];
}

const MARGEN = { arriba: 12, derecha: 8, abajo: 26, izquierda: 40 };
const ANCHO_MAX_COLUMNA = 24;

/** Escala "linda" para el eje: 0 y pasos de 1/2/5 × 10^n. */
export function ticksEje(maximo: number, cantidad = 4): number[] {
  if (maximo <= 0) return [0, 1];
  const bruto = maximo / cantidad;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 5, 10].map(m => m * potencia).find(p => p >= bruto) ?? bruto;
  const ticks: number[] = [];
  for (let v = 0; v < maximo + paso; v += paso) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/**
 * Columnas de una sola serie (sin leyenda: el título de la tarjeta la
 * nombra). Cada columna es su propia zona de hover/foco con tooltip.
 */
@Component({
  selector: 'app-column-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ':host { display: block; }',
  template: `
    <div class="viz-frame" [style.height.px]="alto()">
      @if (ancho() > 0) {
        <svg [attr.width]="ancho()" [attr.height]="alto()" role="img" [attr.aria-label]="descripcion()">
          @for (t of ticks(); track t) {
            <line class="viz-grid" [attr.x1]="m.izquierda" [attr.x2]="ancho() - m.derecha"
                  [attr.y1]="y(t)" [attr.y2]="y(t)" />
            <text class="viz-tick" [attr.x]="m.izquierda - 6" [attr.y]="y(t)" text-anchor="end"
                  dominant-baseline="middle">{{ fmt(t) }}</text>
          }
          <line class="viz-axis" [attr.x1]="m.izquierda" [attr.x2]="ancho() - m.derecha"
                [attr.y1]="y(0)" [attr.y2]="y(0)" />
          @for (c of columnas(); track $index; let i = $index) {
            @if (c.valor > 0) {
              <path class="viz-bar" [class.activa]="activa() === i" [attr.d]="barra(i, c.valor)" />
            }
            @if (i % pasoEtiquetas() === 0) {
              <text class="viz-tick" [attr.x]="centro(i)" [attr.y]="alto() - 8" text-anchor="middle">
                {{ c.etiqueta }}
              </text>
            }
            <rect class="viz-hit" tabindex="0" [attr.x]="centro(i) - banda() / 2" [attr.y]="m.arriba"
                  [attr.width]="banda()" [attr.height]="alto() - m.arriba - m.abajo"
                  [attr.aria-label]="c.etiqueta + ': ' + fmt(c.valor) + ' ' + unidad()"
                  (pointerenter)="activa.set(i)" (pointerleave)="activa.set(null)"
                  (focus)="activa.set(i)" (blur)="activa.set(null)" />
          }
        </svg>
        @if (activa() !== null) {
          @let c = columnas()[activa()!];
          <div class="viz-tooltip" [style.left.px]="centro(activa()!)" [style.top.px]="y(c.valor)">
            <strong>{{ fmt(c.valor) }} {{ unidad() }}</strong>
            <span>{{ c.etiqueta }}</span>
            @for (linea of c.detalle ?? []; track $index) {
              <span>{{ linea }}</span>
            }
          </div>
        }
      }
    </div>
  `,
})
export class ColumnChart {
  readonly columnas = input.required<Columna[]>();
  readonly unidad = input('');
  readonly alto = input(220);
  readonly descripcion = input('Gráfico de columnas');

  protected readonly m = MARGEN;
  protected readonly ancho = signal(0);
  protected readonly activa = signal<number | null>(null);

  protected readonly ticks = computed(() => ticksEje(Math.max(0, ...this.columnas().map(c => c.valor))));
  protected readonly banda = computed(
    () => (this.ancho() - MARGEN.izquierda - MARGEN.derecha) / Math.max(1, this.columnas().length),
  );
  /** Muestra una etiqueta cada tantas columnas para que no se pisen (~56 px por etiqueta). */
  protected readonly pasoEtiquetas = computed(() => Math.max(1, Math.ceil(56 / Math.max(1, this.banda()))));

  constructor() {
    const host = inject(ElementRef<HTMLElement>);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = host.nativeElement as HTMLElement;
      this.ancho.set(el.clientWidth);
      const observer = new ResizeObserver(() => this.ancho.set(el.clientWidth));
      observer.observe(el);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected y(valor: number): number {
    const max = this.ticks().at(-1) ?? 1;
    const alto = this.alto() - MARGEN.arriba - MARGEN.abajo;
    return MARGEN.arriba + alto - (valor / max) * alto;
  }

  protected centro(i: number): number {
    return MARGEN.izquierda + this.banda() * (i + 0.5);
  }

  /** Columna con la punta redondeada (4 px) y la base recta sobre el eje. */
  protected barra(i: number, valor: number): string {
    const w = Math.max(2, Math.min(ANCHO_MAX_COLUMNA, this.banda() - 2));
    const x = this.centro(i) - w / 2;
    const top = this.y(valor);
    const base = this.y(0);
    const r = Math.min(4, w / 2, base - top);
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
  }

  protected fmt(v: number): string {
    return fmtNumero(v);
  }
}
