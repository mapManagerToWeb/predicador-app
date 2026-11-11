import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { limitesPrincipales } from '../../../../core/map/base-map';
import { situacionDe, type SituacionTerritorio } from '../../../../core/map/estado-publico';
import { Toast } from '../../../../core/services/toast';
import { AdminApi, mensajeDeError } from '../../services/admin-api';
import { AdminStore } from '../../services/admin-store';
import { avanceDe, textoDesde, textoMeta } from '../../utils/avance';
import { dibujarAvance, type FormatoAvance, type ManzanaAvance } from '../../utils/avance-dibujo';

/** Lo que el administrador escribió la última vez (se recuerda en este navegador). */
const CLAVE = 'territorios_imagen_avance';
interface Guardado {
  titulo: string;
  mensaje: string;
  metaNombre: string;
  metaFecha: string;
}
const POR_DEFECTO: Guardado = {
  titulo: '¡Así vamos, hermanos!',
  mensaje: 'Gracias por su esfuerzo. ¡Sigamos así hasta completar todos los territorios!',
  metaNombre: '',
  metaFecha: '',
};

function leerGuardado(): Guardado {
  try {
    return { ...POR_DEFECTO, ...(JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Partial<Guardado>) };
  } catch {
    return POR_DEFECTO;
  }
}

/**
 * Imagen para animar a los hermanos: cuánto se lleva de la vuelta (campaña),
 * con el mapa de la ciudad, un mensaje y, si hay, cuántos días faltan para la
 * meta. Cuadrada para el grupo de WhatsApp o vertical para el estado; se
 * descarga o se comparte.
 */
@Component({
  selector: 'app-imagen-avance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'cerrar.emit()' },
  template: `
    <div class="adm-overlay">
      <div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="avance-titulo">
        <div class="vista" [class.vertical]="formato() === 'vertical'">
          @if (cargando()) {
            <p class="adm-muted">Preparando la imagen…</p>
          }
          <canvas #lienzo [hidden]="cargando()" aria-label="Vista previa de la imagen"></canvas>
        </div>
        <form class="campos" (submit)="$event.preventDefault()">
          <h2 id="avance-titulo">Imagen para los hermanos</h2>
          <p class="adm-muted">{{ explicacion() }}</p>
          @if (error(); as e) {
            <div class="adm-alert" role="alert">{{ e }}</div>
          }

          <div class="adm-seg" role="group" aria-label="Forma de la imagen">
            <button type="button" [class.activo]="formato() === 'cuadrada'" (click)="formato.set('cuadrada')">Para el grupo</button>
            <button type="button" [class.activo]="formato() === 'vertical'" (click)="formato.set('vertical')">Para el estado</button>
          </div>

          <label class="adm-field">
            Título
            <input maxlength="40" [value]="titulo()" (input)="titulo.set(valor($event))" />
          </label>
          <label class="adm-field">
            Mensaje
            <textarea class="adm-input" rows="3" maxlength="110" [value]="mensaje()" (input)="mensaje.set(valor($event))"></textarea>
          </label>

          <fieldset class="meta">
            <legend>Meta (opcional)</legend>
            <p class="adm-muted">Si hay que terminar antes de una fecha, la imagen dice cuántos días faltan.</p>
            <div class="fila">
              <label class="adm-field">
                Para
                <input maxlength="30" placeholder="la asamblea" [value]="metaNombre()" (input)="metaNombre.set(valor($event))" />
              </label>
              <label class="adm-field">
                Fecha
                <input type="date" [value]="metaFecha()" (input)="metaFecha.set(valor($event))" />
              </label>
            </div>
            @if (metaNombre().trim() && metaFecha() && !meta()) {
              <p class="adm-muted">Esa fecha ya pasó: no sale en la imagen.</p>
            }
          </fieldset>

          <div class="adm-actions">
            <button class="adm-btn" type="button" (click)="cerrar.emit()">Cerrar</button>
            @if (puedeCompartir()) {
              <button class="adm-btn" type="button" [disabled]="cargando()" (click)="compartir()">Compartir</button>
            }
            <button class="adm-btn primary" type="button" [disabled]="cargando()" (click)="descargar()">Descargar imagen</button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: `
    .dialogo {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
      gap: var(--space-6);
      width: min(1040px, calc(100vw - 32px));
      max-height: calc(100dvh - 32px);
      overflow: auto;
      padding: var(--space-6);
      background: var(--surface-1);
      border: 1px solid var(--color-border-solid);
      border-radius: var(--radius-lg);
      box-shadow: var(--elev-3);
    }
    .vista { display: grid; place-items: center; min-height: 320px; min-width: 0; }
    .vista canvas {
      width: 100%;
      max-width: min(560px, 100%);
      max-height: calc(100dvh - 96px);
      object-fit: contain;
      border-radius: var(--radius-md);
      box-shadow: var(--elev-2);
    }
    .vista.vertical canvas { width: auto; height: calc(100dvh - 96px); max-height: 760px; }
    .campos { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
    .campos input, .campos textarea { width: 100%; min-width: 0; box-sizing: border-box; }
    .campos h2 { margin: 0; font-size: var(--text-lg); }
    .campos p { margin: 0; font-size: var(--text-sm); line-height: 1.5; }
    .meta { border: 1px solid var(--color-border-solid); border-radius: var(--radius-sm); padding: var(--space-3); margin: 0; display: grid; gap: var(--space-2); }
    .meta legend { padding: 0 4px; font-size: var(--text-sm); font-weight: 600; }
    .fila { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-2); }
    textarea { resize: vertical; font: inherit; }
    .adm-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); margin-top: auto; }
    @media (max-width: 760px) {
      .dialogo { grid-template-columns: minmax(0, 1fr); padding: var(--space-4); gap: var(--space-4); }
      .vista.vertical canvas { height: auto; width: 100%; max-height: none; }
    }
  `,
})
export class ImagenAvance {
  readonly cerrar = output<void>();

  private readonly store = inject(AdminStore);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  private readonly lienzo = viewChild<ElementRef<HTMLCanvasElement>>('lienzo');

  private readonly guardado = leerGuardado();
  protected readonly formato = signal<FormatoAvance>('cuadrada');
  protected readonly titulo = signal(this.guardado.titulo);
  protected readonly mensaje = signal(this.guardado.mensaje);
  protected readonly metaNombre = signal(this.guardado.metaNombre);
  protected readonly metaFecha = signal(this.guardado.metaFecha);

  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly puedeCompartir = signal(false);
  private readonly situaciones = signal<ReadonlyMap<number, SituacionTerritorio>>(new Map());
  private readonly inicioVuelta = signal<string | null>(null);
  private readonly logo = signal<HTMLImageElement | null>(null);

  protected readonly desde = computed(() => textoDesde(this.inicioVuelta()));
  protected readonly explicacion = computed(() => {
    const desde = this.desde();
    return (
      'Muestra cuántos territorios se completaron desde que empezó la vuelta' +
      (desde ? ` (${desde.toLowerCase()})` : '') +
      '. Descárgala y compártela con los hermanos.'
    );
  });
  protected readonly meta = computed(() => textoMeta({ nombre: this.metaNombre(), fecha: this.metaFecha() }, new Date()));
  private readonly manzanas = computed<ManzanaAvance[]>(() =>
    (this.store.manzanas()?.features ?? []).map(f => ({ territorio: f.properties.territorio, geometria: f.geometry })),
  );
  private readonly caja = computed(() => {
    const coleccion = this.store.manzanas();
    // Un recorte mayor que en los mapas: lo que importa es que se vea la ciudad.
    return coleccion ? (limitesPrincipales(coleccion, 0.1) as [[number, number], [number, number]] | null) : null;
  });

  constructor() {
    afterNextRender(() => void this.cargar());
    effect(() => {
      const canvas = this.lienzo()?.nativeElement;
      const datos = {
        avance: avanceDe(this.store.territorios(), this.situaciones()),
        manzanas: this.manzanas(),
        situaciones: this.situaciones(),
        caja: this.caja(),
        titulo: this.titulo().trim(),
        mensaje: this.mensaje(),
        meta: this.meta(),
        desde: this.desde(),
        logo: this.logo(),
      };
      const formato = this.formato();
      if (!canvas || this.cargando()) return;
      dibujarAvance(canvas, datos, formato);
    });
    effect(() => {
      const guardar: Guardado = { titulo: this.titulo(), mensaje: this.mensaje(), metaNombre: this.metaNombre(), metaFecha: this.metaFecha() };
      try {
        localStorage.setItem(CLAVE, JSON.stringify(guardar));
      } catch {
        // Sin almacenamiento (modo privado): se pierde al cerrar, nada más.
      }
    });
  }

  private async cargar(): Promise<void> {
    try {
      const [estados, ciclos] = await Promise.all([
        this.api.estadoPublico(),
        this.api.ciclos().catch(() => []),
        this.store.cargarManzanas(),
        this.cargarRecursos(),
      ]);
      this.situaciones.set(new Map(estados.map(e => [e.territorio, situacionDe(e)])));
      this.inicioVuelta.set(ciclos.find(c => !c.fin)?.inicio ?? null);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cargar cómo van los territorios'));
    } finally {
      this.cargando.set(false);
    }
  }

  /** La letra y el logo tienen que estar listos antes de dibujar (el canvas no espera). */
  private async cargarRecursos(): Promise<void> {
    try {
      await Promise.all(['800 64px Inter', '700 40px Inter', '600 26px Inter', '500 30px Inter'].map(f => document.fonts.load(f)));
    } catch {
      // Sin la letra se dibuja con la del sistema.
    }
    const logo = new Image();
    logo.src = '/logo.jpeg';
    try {
      await logo.decode();
      this.logo.set(logo);
    } catch {
      this.logo.set(null);
    }
    try {
      const prueba = new File([''], 'prueba.png', { type: 'image/png' });
      this.puedeCompartir.set(typeof navigator.canShare === 'function' && navigator.canShare({ files: [prueba] }));
    } catch {
      this.puedeCompartir.set(false);
    }
  }

  protected valor(e: Event): string {
    return (e.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  private nombreArchivo(): string {
    return `avance-territorios-${new Date().toISOString().slice(0, 10)}-${this.formato() === 'cuadrada' ? 'grupo' : 'estado'}.png`;
  }

  private imagen(): Promise<Blob | null> {
    const canvas = this.lienzo()?.nativeElement;
    return new Promise(resolve => (canvas ? canvas.toBlob(resolve, 'image/png') : resolve(null)));
  }

  protected async descargar(): Promise<void> {
    const blob = await this.imagen();
    if (!blob) {
      this.toast.show('No se pudo armar la imagen', 4000, 'error');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.nombreArchivo();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  protected async compartir(): Promise<void> {
    const blob = await this.imagen();
    if (!blob) return;
    try {
      await navigator.share({ files: [new File([blob], this.nombreArchivo(), { type: 'image/png' })] });
    } catch (e) {
      // Cerrar el menú de compartir no es un error.
      if (!(e instanceof DOMException && e.name === 'AbortError')) await this.descargar();
    }
  }
}
