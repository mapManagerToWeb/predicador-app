import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MapaStore } from '../mapa.store';

/** Territorio y manzana de la práctica. */
export interface Practica {
  territorio: number;
  manzana: string;
}

export interface PasoTutorial {
  titulo: string;
  texto: string;
  /** Elemento a señalar (`data-tutorial="…"`). */
  objetivo?: string;
  /**
   * Paso para hacer (no solo leer): el tutorial espera a que el usuario lo
   * haga en el mapa de verdad, sobre el territorio de práctica.
   */
  hecho?: (store: MapaStore, p: Practica) => boolean;
  /** Aro que late sobre la manzana de práctica. */
  pulso?: boolean;
  /** Felicitación al lograrlo. */
  bien?: string;
  /** "Hazlo por mí": la app hace el paso delante del usuario, para que vea cómo queda. */
  hacerPorMi?: (store: MapaStore, p: Practica) => void;
}

const marcada = (s: MapaStore, p: Practica) => s.salida().get(p.territorio)?.marcadas.includes(p.manzana) ?? false;
const porCalles = (s: MapaStore, p: Practica) =>
  s.salida().get(p.territorio)?.zonas.some(z => z.manzanaId === p.manzana) ?? false;

export const PASOS: PasoTutorial[] = [
  {
    titulo: '¡Vamos a practicar!',
    texto: 'Te mostramos cómo se usa con un territorio de ejemplo. Lo que hagas ahora no se guarda ni se envía.',
  },
  {
    objetivo: 'buscar',
    titulo: 'Abre tu territorio',
    texto: 'Escribe aquí el número de tu territorio, o tócalo en el mapa. Para practicar, ya abrimos uno por ti.',
  },
  {
    titulo: 'Marca una manzana',
    texto: 'Toca la manzana que tiene el círculo amarillo.',
    pulso: true,
    hecho: marcada,
    bien: '¡Muy bien! Quedó pintada: ya está marcada.',
    hacerPorMi: (s, p) => s.tocar({ manzana: p.manzana, cercana: null }),
  },
  {
    titulo: '¿Te equivocaste?',
    texto: 'Tócala otra vez y se despinta.',
    pulso: true,
    hecho: (s, p) => !marcada(s, p),
    bien: '¡Eso es! Se despintó.',
    hacerPorMi: (s, p) => s.tocar({ manzana: p.manzana, cercana: null }),
  },
  {
    objetivo: 'modo-calles',
    titulo: '¿Solo algunas calles?',
    texto: 'Toca el botón «Por calles».',
    hecho: s => s.modo() === 'calles',
    bien: 'Bien. Ahora cada toque en una manzana abre sus calles.',
    hacerPorMi: s => s.cambiarModo('calles'),
  },
  {
    titulo: 'Abre la manzana',
    texto: 'Toca la manzana que tiene el círculo amarillo.',
    pulso: true,
    hecho: (s, p) => s.edicion()?.manzanaId === p.manzana,
    hacerPorMi: (s, p) => {
      s.cambiarModo('calles');
      s.tocar({ manzana: p.manzana, cercana: null });
    },
  },
  {
    titulo: 'Elige las calles',
    texto: 'Toca el número de una calle que predicaron: se pone verde con ✓.',
    hecho: s => (s.edicion()?.seleccion.length ?? 0) > 0,
    hacerPorMi: s => s.tocarLado(0),
  },
  {
    objetivo: 'calles-listo',
    titulo: 'Guárdala',
    texto: 'Toca «Listo».',
    hecho: (s, p) => s.edicion() === null && porCalles(s, p),
    bien: '¡Perfecto! Quedó marcada solo esa calle.',
    hacerPorMi: s => s.guardarLados(false),
  },
  {
    objetivo: 'enviar',
    titulo: 'Envía el reporte',
    texto: 'Al terminar, elige «Mañana» o «Tarde» y toca «Enviar». Antes te mostramos un resumen para que confirmes. Si cierras la app antes de enviar, lo marcado queda guardado.',
  },
  {
    objetivo: 'ubicacion',
    titulo: '¿Dónde estoy?',
    texto: 'Este botón muestra dónde estás. Si mueves el mapa deja de seguirte; tócalo otra vez para volver a tu ubicación.',
  },
  {
    titulo: '¡Listo, ya sabes usarla!',
    texto: 'Borramos lo que marcaste en la práctica. Si quieres repetirla, toca el botón «?».',
  },
];

/** Tiempo antes de ofrecer "Hazlo por mí" en un paso para hacer. */
const AYUDA_MS = 20_000;
const FELICITACION_MS = 1600;

interface Caja {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Tutorial con práctica: explica cada parte y, en los pasos importantes, pide
 * hacerlo de verdad sobre un territorio de ejemplo (marcar, desmarcar, marcar
 * por calles). Solo avanza cuando el usuario lo logra; al terminar, todo
 * vuelve a como estaba y nada se guarda ni se envía.
 */
@Component({
  selector: 'app-tutorial',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tutorial.html',
  styleUrl: './tutorial.css',
})
export class Tutorial {
  readonly cerrar = output<void>();

  private readonly store = inject(MapaStore);
  private readonly tarjeta = viewChild<ElementRef<HTMLElement>>('tarjeta');
  protected readonly pasos = PASOS;
  protected readonly indice = signal(0);
  protected readonly caja = signal<Caja | null>(null);
  protected readonly logrado = signal(false);
  protected readonly ayuda = signal(false);
  private readonly practica = signal<Practica | null>(null);
  private temporizadores: ReturnType<typeof setTimeout>[] = [];
  private seguimiento: ReturnType<typeof setInterval> | null = null;

  protected readonly paso = computed(() => PASOS[this.indice()]);
  protected readonly ultimo = computed(() => this.indice() === PASOS.length - 1);
  protected readonly paraHacer = computed(() => !!this.paso().hecho);
  /** Numeración de los pasos para hacer: "Práctica 2 de 6". */
  protected readonly progreso = computed(() => {
    const hacer = PASOS.map((p, i) => (p.hecho ? i : -1)).filter(i => i >= 0);
    return { actual: hacer.indexOf(this.indice()) + 1, total: hacer.length };
  });
  protected readonly tarjetaArriba = computed(() => {
    if (this.paraHacer()) return true;
    const c = this.caja();
    return !!c && c.top + c.height / 2 > (typeof window !== 'undefined' ? window.innerHeight / 2 : 0);
  });

  constructor() {
    const medir = () => this.medir();
    afterNextRender(() => {
      this.entrar();
      window.addEventListener('resize', medir);
    });
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('resize', medir);
      this.limpiarTemporizadores();
      this.store.resaltarManzana(null);
      this.store.ajustarMargenes({ arriba: 90 });
      this.store.terminarPractica();
    });

    // Paso para hacer: avanza solo cuando el usuario lo logra en el mapa.
    effect(() => {
      const paso = this.paso();
      const practica = this.practica();
      if (!paso.hecho || !practica || this.logrado()) return;
      if (!paso.hecho(this.store, practica)) return;
      untracked(() => {
        this.logrado.set(true);
        this.store.resaltarManzana(null);
        this.temporizar(() => this.siguiente(), paso.bien ? FELICITACION_MS : 400);
      });
    });
  }

  protected siguiente(): void {
    if (this.ultimo()) {
      this.cerrar.emit();
      return;
    }
    this.indice.update(i => i + 1);
    this.entrar();
  }

  protected anterior(): void {
    // En la práctica no se vuelve a un paso para hacer (ya está hecho).
    let i = this.indice() - 1;
    while (i > 0 && PASOS[i].hecho) i--;
    this.indice.set(Math.max(0, i));
    this.entrar();
  }

  /**
   * "Hazlo por mí": nadie queda atascado. La app hace el paso delante del
   * usuario (así ve cómo queda) y el tutorial sigue como si lo hubiera hecho.
   */
  protected hacerPorMi(): void {
    const paso = this.paso();
    const practica = this.practica();
    if (practica && paso.hacerPorMi) paso.hacerPorMi(this.store, practica);
    // Si igual no quedó hecho (p. ej. una manzana sin calles), se sigue.
    if (!this.logrado()) this.temporizar(() => !this.logrado() && this.siguiente(), 800);
  }

  private entrar(): void {
    this.limpiarTemporizadores();
    this.logrado.set(false);
    this.ayuda.set(false);
    const paso = this.paso();
    if (paso.hecho) {
      this.asegurarPractica();
      this.temporizar(() => this.ayuda.set(true), AYUDA_MS);
      // El botón señalado puede moverse (el panel cambia al abrir las calles).
      if (paso.objetivo) this.seguimiento = setInterval(() => this.medir(), 400);
    }
    const practica = this.practica();
    this.store.resaltarManzana(paso.pulso && practica ? practica.manzana : null);
    // Después de dibujar la tarjeta: medir lo resaltado y dejar libre el mapa debajo de ella.
    this.temporizar(() => {
      this.medir();
      const t = this.tarjeta()?.nativeElement.getBoundingClientRect();
      this.store.ajustarMargenes({ arriba: paso.hecho && t ? t.bottom : 90 });
      if (paso.pulso && practica) this.store.encuadrarManzana(practica.manzana);
    }, 0);
  }

  private asegurarPractica(): void {
    if (this.practica()) return;
    const sugerida = this.store.sugerirPractica();
    if (!sugerida) return;
    this.store.iniciarPractica(sugerida.territorio);
    this.practica.set(sugerida);
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

  private temporizar(f: () => void, ms: number): void {
    this.temporizadores.push(setTimeout(f, ms));
  }

  private limpiarTemporizadores(): void {
    for (const t of this.temporizadores) clearTimeout(t);
    this.temporizadores = [];
    if (this.seguimiento) clearInterval(this.seguimiento);
    this.seguimiento = null;
  }
}
