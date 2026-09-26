import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  output,
  signal,
} from '@angular/core';

export interface PasoTutorial {
  /** Elemento a resaltar (`data-tutorial="…"`); sin él, la tarjeta va centrada. */
  objetivo?: string;
  titulo: string;
  texto: string;
}

export const PASOS: PasoTutorial[] = [
  {
    titulo: '¡Bienvenido!',
    texto: 'En pocos pasos te mostramos cómo marcar lo que predicaron. Puedes volver a verlo cuando quieras con el botón «?».',
  },
  {
    objetivo: 'buscar',
    titulo: '1. Abre tu territorio',
    texto: 'Escribe aquí el número del territorio, o tócalo directamente en el mapa.',
  },
  {
    objetivo: 'panel',
    titulo: '2. Marca las manzanas',
    texto: 'Toca en el mapa cada manzana que predicaron: se pinta de color. Si te equivocas, tócala otra vez y se despinta.',
  },
  {
    objetivo: 'modos',
    titulo: '3. ¿Solo algunas calles?',
    texto: 'Elige «Por calles», toca la manzana y después las calles que predicaron. Termina con «Listo».',
  },
  {
    objetivo: 'enviar',
    titulo: '4. Envía el reporte',
    texto: 'Elige «Mañana» o «Tarde» y toca «Enviar». Antes te mostramos un resumen para que confirmes. Si cierras la app antes de enviar, lo marcado se guarda.',
  },
  {
    objetivo: 'ubicacion',
    titulo: '5. ¿Dónde estoy?',
    texto: 'Este botón muestra dónde estás. Si mueves el mapa deja de seguirte; tócalo otra vez para volver a tu ubicación.',
  },
];

interface Caja {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Recorrido guiado sobre la pantalla real: resalta cada parte y explica qué hace. */
@Component({
  selector: 'app-tutorial',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tutorial.html',
  styleUrl: './tutorial.css',
})
export class Tutorial {
  readonly cerrar = output<void>();

  protected readonly pasos = PASOS;
  protected readonly indice = signal(0);
  protected readonly caja = signal<Caja | null>(null);
  protected readonly paso = computed(() => PASOS[this.indice()]);
  protected readonly ultimo = computed(() => this.indice() === PASOS.length - 1);
  /** La tarjeta va arriba si lo resaltado está en la mitad de abajo de la pantalla. */
  protected readonly tarjetaArriba = computed(() => {
    const c = this.caja();
    return !!c && c.top + c.height / 2 > (typeof window !== 'undefined' ? window.innerHeight / 2 : 0);
  });

  constructor() {
    const medir = () => this.medir();
    afterNextRender(() => {
      this.medir();
      window.addEventListener('resize', medir);
    });
    inject(DestroyRef).onDestroy(() => window.removeEventListener('resize', medir));
  }

  protected siguiente(): void {
    if (this.ultimo()) {
      this.cerrar.emit();
      return;
    }
    this.indice.update(i => i + 1);
    this.medir();
  }

  protected anterior(): void {
    this.indice.update(i => Math.max(0, i - 1));
    this.medir();
  }

  private medir(): void {
    const objetivo = this.paso().objetivo;
    const el = objetivo ? document.querySelector<HTMLElement>(`[data-tutorial="${objetivo}"]`) : null;
    if (!el) {
      this.caja.set(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const margen = 6;
    this.caja.set({ top: r.top - margen, left: r.left - margen, width: r.width + 2 * margen, height: r.height + 2 * margen });
  }
}
