import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { limitesDeNavegacion, limitesPrincipales, etiquetasTerritorios, type FondoMapa } from '../../core/map/base-map';
import { AVISO_SIN_RUMBO } from '../../core/map/rumbo';
import { Profile } from '../../core/services/profile';
import { AuthTokenService } from '../../core/services/auth-token';
import { Toast } from '../../core/services/toast';
import { CLAVE_TEMA, ponerTema } from '../../core/utils/tema';
import { diasElegibles } from './utils/dia';
import { MapaStore } from './mapa.store';
import { Capacitacion } from '../../core/services/capacitacion';
import { Apariencia } from '../../core/services/apariencia';
import { MapaVista, type EstadoUbicacion } from './mapa-vista';
import { Tutorial } from './tutorial/tutorial';
import type { ModoMarcado } from './mapa.types';

const CLAVE_FONDO = 'territory_satellite';
/** El hermano ocultó la indicación de abajo («Busca tu territorio…» y los colores). */
const CLAVE_SIN_INDICACION = 'mapa.indicacion.oculta';
/**
 * Pantalla muy angosta: un teléfono con el zoom de pantalla del sistema (vista
 * cansada) deja la página en unos 280 puntos y los cuadros tapaban medio mapa.
 */
export const CONSULTA_ANGOSTA = '(max-width: 330px)';

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribir(clave: string, valor: string): void {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento la preferencia vale solo para esta visita.
  }
}

/**
 * Mapa de marcado de los encargados (MapLibre). La página solo arma la
 * pantalla: las reglas están en {@link MapaStore} y el dibujo en {@link MapaVista}.
 */
@Component({
  selector: 'app-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Tutorial],
  providers: [MapaStore],
  templateUrl: './map.html',
  styleUrl: './map.css',
})
export class MapPage {
  protected readonly store = inject(MapaStore);
  private readonly router = inject(Router);
  private readonly perfil = inject(Profile);
  private readonly authToken = inject(AuthTokenService);
  private readonly toast = inject(Toast);
  /** Aviso de capacitación en curso (no en el modo práctica, que no envía nada). */
  protected readonly capacitacion = inject(Capacitacion);
  /** Qué tan fuerte se pinta lo predicado (lo elige el administrador). */
  private readonly apariencia = inject(Apariencia);
  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('mapa');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private vista: MapaVista | null = null;

  protected readonly busqueda = signal('');
  protected readonly verSugerencias = signal(false);
  protected readonly ubicacion = signal<EstadoUbicacion>('apagada');
  protected readonly fondo = signal<FondoMapa>(leer(CLAVE_FONDO) === 'true' ? 'satelite' : 'mapa');
  protected readonly oscuro = signal(leer(CLAVE_TEMA) === 'dark');
  protected readonly verTutorial = signal(false);
  protected readonly sinIndicacion = signal(leer(CLAVE_SIN_INDICACION) === '1');
  protected readonly angosta = signal(false);
  /** Días que se pueden informar (se recalculan cada vez que se abre una pregunta). */
  protected readonly dias = computed(() => {
    this.store.pregunta();
    return diasElegibles();
  });
  /** "Otro día" abierto: muestra los días anteriores a ayer. */
  protected readonly otrosDias = signal(false);

  protected readonly sugerencias = computed(() => {
    const texto = this.busqueda().trim();
    if (!texto) return [];
    const ultimo = texto.split(/[,\s]+/).pop() ?? '';
    return this.store
      .numeros()
      .filter(n => String(n).startsWith(ultimo))
      .slice(0, 8);
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect(() => {
      if (!this.store.pregunta()) this.otrosDias.set(false);
    });
    effect(() => {
      const estado = this.store.estadoVista();
      this.vista?.mostrar(estado);
    });
    effect(() => {
      const opacidad = this.apariencia.opacidadPredicadas();
      this.vista?.ponerOpacidad(opacidad);
    });
    afterNextRender(() => {
      const consulta = window.matchMedia?.(CONSULTA_ANGOSTA);
      if (consulta) {
        this.angosta.set(consulta.matches);
        const alCambiar = (e: MediaQueryListEvent) => this.angosta.set(e.matches);
        consulta.addEventListener?.('change', alCambiar);
        destroyRef.onDestroy(() => consulta.removeEventListener?.('change', alCambiar));
      }
      this.aplicarTema();
      void this.iniciar();
      void this.apariencia.cargar();
      if (!this.store.modoPractica) destroyRef.onDestroy(this.capacitacion.vigilar());
    });
    // El mapa encuadra en lo que el panel deja libre: con varios territorios
    // abiertos el panel crece, y con un margen fijo quedaban manzanas debajo.
    let observador: ResizeObserver | null = null;
    effect(() => {
      const panel = this.panel()?.nativeElement;
      observador?.disconnect();
      // Sin panel (el hermano ocultó la indicación) el mapa usa toda la pantalla.
      if (!panel) untracked(() => this.vista?.ajustarMargenes({ abajo: 0, derecha: 0 }));
      if (!panel || typeof ResizeObserver === 'undefined') return;
      observador = new ResizeObserver(() => this.medirPanel(panel));
      observador.observe(panel);
    });
    destroyRef.onDestroy(() => {
      observador?.disconnect();
      this.vista?.destruir();
    });
  }

  private async iniciar(): Promise<void> {
    if (!(await this.store.cargar())) return;
    const manzanas = this.store.manzanas();
    const coleccion = {
      type: 'FeatureCollection' as const,
      features: manzanas.map(m => ({ type: 'Feature' as const, geometry: m.geometria, properties: { territorio: m.territorio } })),
    };
    this.vista = await MapaVista.crear(
      this.contenedor().nativeElement,
      manzanas.map(m => ({ id: m.id, territorio: m.territorio, color: this.store.colorDe(m.territorio), geometria: m.geometria })),
      etiquetasTerritorios(coleccion),
      this.fondo(),
      {
        alTocar: t => this.store.tocar(t),
        alTocarLado: i => this.store.tocarLado(i),
        alCambiarUbicacion: (e, error) => {
          this.ubicacion.set(e);
          if (error === 'denegada') this.toast.show('Permiso de ubicación denegado: actívalo en los ajustes del navegador', 5000, 'warning');
          else if (error) this.toast.show('No se pudo obtener tu ubicación', 3000, 'warning');
        },
        alSinRumbo: motivo => this.toast.show(AVISO_SIN_RUMBO[motivo], 5000, 'warning'),
      },
    );
    this.vista.limitar(limitesDeNavegacion(coleccion));
    this.store.conectar(this.vista);
    const panel = this.panel()?.nativeElement;
    if (panel) this.medirPanel(panel);
    this.vista.ponerOpacidad(this.apariencia.opacidadPredicadas());
    this.vista.mostrar(this.store.estadoVista());
    const abiertos = this.store.abiertos();
    if (abiertos.length) this.vista.encuadrar(abiertos, false);
    else {
      const caja = limitesPrincipales(coleccion, 0.12);
      if (caja) this.vista.encuadrarTodo(caja);
    }
  }

  private medirPanel(panel: HTMLElement): void {
    // El mapa ocupa toda la página y el panel se ubica dentro de ella. Se mide
    // con offset* y no con getBoundingClientRect: mientras el panel entra
    // animado (sube unos píxeles) el rectángulo en pantalla da un lugar que no
    // es el definitivo.
    const mapa = this.contenedor().nativeElement;
    // Con el teléfono de lado el panel es una columna a la derecha (ver map.css).
    const columna = panel.offsetTop < 40 && panel.offsetWidth < mapa.clientWidth * 0.6;
    this.vista?.ajustarMargenes(
      columna
        ? { abajo: 0, derecha: Math.max(0, mapa.clientWidth - panel.offsetLeft) }
        : { abajo: Math.max(0, mapa.clientHeight - panel.offsetTop), derecha: 0 },
    );
  }

  protected reintentar(): void {
    void this.iniciar();
  }

  // ── Buscador ──

  /** Oculta (o vuelve a mostrar) la indicación de abajo; se recuerda en el teléfono. */
  protected ocultarIndicacion(ocultar: boolean): void {
    this.sinIndicacion.set(ocultar);
    escribir(CLAVE_SIN_INDICACION, ocultar ? '1' : '0');
  }

  protected alEscribir(event: Event): void {
    const valor = (event.target as HTMLInputElement).value.replace(/[^\d,\s]/g, '');
    this.busqueda.set(valor);
    this.verSugerencias.set(valor.length > 0);
  }

  protected async buscar(event?: Event): Promise<void> {
    event?.preventDefault();
    const texto = this.busqueda();
    this.verSugerencias.set(false);
    (document.activeElement as HTMLElement | null)?.blur();
    await this.store.buscar(texto);
    this.busqueda.set('');
  }

  protected async elegir(numero: number): Promise<void> {
    const partes = this.busqueda().split(/[,\s]+/).filter(Boolean);
    partes[partes.length - 1] = String(numero);
    this.busqueda.set(partes.join(', '));
    await this.buscar();
  }

  protected ocultarSugerencias(): void {
    setTimeout(() => this.verSugerencias.set(false), 150);
  }

  // ── Panel ──

  protected cambiarModo(modo: ModoMarcado): void {
    this.store.cambiarModo(modo);
  }

  protected cambiarTurno(turno: 'mañana' | 'tarde'): void {
    this.store.predicacion.set(turno);
  }

  protected elegirDia(atras: number): void {
    this.store.diaAtras.set(atras);
    if (atras < 2) this.otrosDias.set(false);
  }

  protected hace(fecha: string | null): string {
    if (!fecha) return '';
    const dias = Math.round((Date.now() - new Date(fecha).getTime()) / 86_400_000);
    if (dias <= 0) return 'hoy';
    if (dias === 1) return 'ayer';
    if (dias < 45) return `hace ${dias} días`;
    return `hace ${Math.round(dias / 30.4)} meses`;
  }

  protected fechaCorta(fecha: string | null): string {
    return fecha ? new Date(fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' }) : '';
  }

  // ── Botones del mapa ──

  protected alternarUbicacion(): void {
    this.vista?.alternarUbicacion();
  }

  protected alternarFondo(): void {
    const fondo: FondoMapa = this.fondo() === 'mapa' ? 'satelite' : 'mapa';
    this.fondo.set(fondo);
    escribir(CLAVE_FONDO, String(fondo === 'satelite'));
    this.vista?.cambiarFondo(fondo);
  }

  protected alternarTema(): void {
    this.oscuro.set(!this.oscuro());
    escribir(CLAVE_TEMA, this.oscuro() ? 'dark' : 'light');
    this.aplicarTema();
  }

  private aplicarTema(): void {
    ponerTema(this.oscuro());
  }

  protected abrirTutorial(): void {
    this.verTutorial.set(true);
  }

  protected cerrarTutorial(): void {
    this.verTutorial.set(false);
  }

  protected salir(): void {
    if (this.store.modoPractica) {
      // La práctica no cierra la sesión real: se vuelve al mapa si hay una.
      void this.router.navigate(this.authToken.hasToken() ? ['/map'] : ['/login']);
      return;
    }
    const salirYa = () => {
      this.perfil.clear();
      this.authToken.logout();
      void this.router.navigate(['/login']);
    };
    this.store.pregunta.set({
      titulo: '¿Cerrar sesión?',
      texto: this.store.hayCambios()
        ? 'Tienes marcas sin enviar: se pierden si cierras la sesión.'
        : 'Para volver a entrar vas a necesitar tu número de teléfono.',
      si: 'Cerrar sesión',
      no: 'Cancelar',
      peligro: this.store.hayCambios(),
      alConfirmar: salirYa,
    });
  }
}
