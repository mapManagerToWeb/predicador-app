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
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { limitesPrincipales, etiquetasTerritorios, type FondoMapa } from '../../core/map/base-map';
import { Profile } from '../../core/services/profile';
import { AuthTokenService } from '../../core/services/auth-token';
import { Toast } from '../../core/services/toast';
import { MapaStore } from './mapa.store';
import { MapaVista, type EstadoUbicacion } from './mapa-vista';
import { Tutorial } from './tutorial/tutorial';
import type { ModoMarcado } from './mapa.types';

const CLAVE_TEMA = 'territory_theme';
const CLAVE_FONDO = 'territory_satellite';
const CLAVE_TUTORIAL = 'mapa.tutorial.visto';

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
  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('mapa');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private vista: MapaVista | null = null;

  protected readonly busqueda = signal('');
  protected readonly verSugerencias = signal(false);
  protected readonly ubicacion = signal<EstadoUbicacion>('apagada');
  protected readonly fondo = signal<FondoMapa>(leer(CLAVE_FONDO) === 'true' ? 'satelite' : 'mapa');
  protected readonly oscuro = signal(leer(CLAVE_TEMA) === 'dark');
  protected readonly verTutorial = signal(false);

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
      const estado = this.store.estadoVista();
      this.vista?.mostrar(estado);
    });
    afterNextRender(() => {
      this.aplicarTema();
      void this.iniciar();
    });
    // El mapa encuadra en lo que el panel deja libre: con varios territorios
    // abiertos el panel crece, y con un margen fijo quedaban manzanas debajo.
    let observador: ResizeObserver | null = null;
    effect(() => {
      const panel = this.panel()?.nativeElement;
      observador?.disconnect();
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
      },
    );
    this.store.conectar(this.vista);
    const panel = this.panel()?.nativeElement;
    if (panel) this.medirPanel(panel);
    this.vista.mostrar(this.store.estadoVista());
    const abiertos = this.store.abiertos();
    if (abiertos.length) this.vista.encuadrar(abiertos, false);
    else {
      const caja = limitesPrincipales(coleccion, 0.12);
      if (caja) this.vista.encuadrarTodo(caja);
    }
    if (!leer(CLAVE_TUTORIAL)) this.verTutorial.set(true);
  }

  private medirPanel(panel: HTMLElement): void {
    const contenedor = this.contenedor().nativeElement.getBoundingClientRect();
    this.vista?.ajustarMargenes({ abajo: Math.max(0, contenedor.bottom - panel.getBoundingClientRect().top) });
  }

  protected reintentar(): void {
    void this.iniciar();
  }

  // ── Buscador ──

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
    document.documentElement.setAttribute('data-theme', this.oscuro() ? 'dark' : 'light');
  }

  protected abrirTutorial(): void {
    this.verTutorial.set(true);
  }

  protected cerrarTutorial(): void {
    this.verTutorial.set(false);
    escribir(CLAVE_TUTORIAL, '1');
  }

  protected salir(): void {
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
