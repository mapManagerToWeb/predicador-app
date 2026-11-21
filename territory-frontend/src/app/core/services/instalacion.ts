import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Qué aviso de instalación corresponde a este teléfono:
 * - `android`: Chrome (o Samsung Internet) ofreció instalarla → botón «Instalar».
 * - `iphone-safari` / `iphone-chrome`: Apple no deja poner un botón; se muestran los pasos.
 * - `iphone-otro`: otro navegador de iPhone; se le pide abrir el enlace en Safari.
 */
export type AvisoInstalar = 'android' | 'iphone-safari' | 'iphone-chrome' | 'iphone-otro';

/** Lo que el navegador le pasa a la página cuando la app se puede instalar (solo Android). */
export interface EventoInstalar extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** «Ahora no»: el aviso no vuelve hasta pasados estos días. */
export const DIAS_SIN_AVISO = 3;
/** Ya está instalada (o el hermano dijo que ya la tiene): el aviso no vuelve nunca. */
export const CLAVE_INSTALADA = 'territorios_app_instalada';
export const CLAVE_AHORA_NO = 'territorios_instalar_ahora_no';

/** Nombre con que el script de `index.html` guarda el evento si llega antes que la app. */
const EVENTO_TEMPRANO = '__eventoInstalar';

interface DatosNavegador {
  userAgent: string;
  maxTouchPoints: number;
}

/** Android, iPhone/iPad (y con qué navegador) o ninguno de los dos (computador). */
export function tipoDeTelefono(nav: DatosNavegador): AvisoInstalar | null {
  const ua = nav.userAgent;
  if (/android/i.test(ua)) return 'android';
  // El iPad moderno se presenta como un Mac; se lo reconoce porque tiene pantalla táctil.
  const esIos = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && nav.maxTouchPoints > 1);
  if (!esIos) return null;
  if (/crios/i.test(ua)) return 'iphone-chrome';
  // Firefox, Edge, Opera, Google y las apps con navegador propio dicen «Safari» igual: se descartan primero.
  if (/fxios|edgios|opios|opt\/|gsa\/|fban|fbav|instagram|line\//i.test(ua)) return 'iphone-otro';
  return /safari/i.test(ua) ? 'iphone-safari' : 'iphone-otro';
}

/**
 * Ofrecer instalar la app en el teléfono, sin que nadie tenga que enseñar el
 * menú del navegador.
 *
 * Nunca se ofrece si ya está instalada:
 * - abierta desde el ícono (pantalla completa, sin barra del navegador) se
 *   reconoce siempre, y se anota para no volver a ofrecerla en ese teléfono;
 * - en Android, Chrome solo avisa (`beforeinstallprompt`) cuando no está
 *   instalada, y al instalarla avisa también (`appinstalled`);
 * - en iPhone, Safari no puede saber si la app ya está en la pantalla de
 *   inicio (Apple guarda los datos de la app instalada aparte). Por eso ahí el
 *   aviso tiene «Ya la tengo instalada», que lo apaga para siempre.
 */
@Injectable({ providedIn: 'root' })
export class Instalacion {
  private readonly doc = inject(DOCUMENT);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));

  /** El aviso que toca mostrar, o `null` si no hay que mostrar nada. */
  readonly aviso = signal<AvisoInstalar | null>(null);
  /**
   * El aviso llegó cuando el hermano ya estaba usando la app (Chrome puede
   * tardar unos segundos). En el mapa entonces no se muestra: no se le tapa
   * la pantalla a mitad de algo; sale la próxima vez que la abra.
   */
  readonly llegoTarde = signal(false);

  private evento: EventoInstalar | null = null;
  private iniciada = false;
  private tocado = false;

  iniciar(): void {
    const ventana = this.doc.defaultView;
    if (this.iniciada || !this.navegador || !ventana) return;
    this.iniciada = true;

    if (this.abiertaComoApp(ventana)) {
      this.guardar(CLAVE_INSTALADA, '1');
      return;
    }

    const telefono = tipoDeTelefono(ventana.navigator);
    if (telefono === 'android') {
      ventana.addEventListener('pointerdown', () => (this.tocado = true), { capture: true, passive: true, once: true });
      ventana.addEventListener('beforeinstallprompt', e => this.alPoderInstalar(e as EventoInstalar));
      ventana.addEventListener('appinstalled', () => this.marcarInstalada());
      const temprano = (ventana as unknown as Record<string, EventoInstalar | undefined>)[EVENTO_TEMPRANO];
      if (temprano) this.alPoderInstalar(temprano);
      return;
    }
    if (telefono && this.puedeAvisar()) this.aviso.set(telefono);
  }

  /** Botón «Instalar» (Android): abre la ventana del propio teléfono. */
  async instalar(): Promise<'instalada' | 'cancelada' | 'no-disponible'> {
    const evento = this.evento;
    if (!evento) return 'no-disponible';
    // El navegador deja usar el evento una sola vez.
    this.evento = null;
    try {
      await evento.prompt();
      const { outcome } = await evento.userChoice;
      if (outcome === 'accepted') {
        this.marcarInstalada();
        return 'instalada';
      }
    } catch {
      // El navegador ya no lo permite: se trata como cancelado.
    }
    this.ahoraNo();
    return 'cancelada';
  }

  /** «Ahora no»: vuelve a ofrecerse en unos días. */
  ahoraNo(): void {
    this.guardar(CLAVE_AHORA_NO, String(Date.now()));
    this.aviso.set(null);
  }

  /** «Ya la tengo instalada» (iPhone), o Android avisó que se instaló. */
  marcarInstalada(): void {
    this.guardar(CLAVE_INSTALADA, '1');
    this.evento = null;
    this.aviso.set(null);
  }

  private alPoderInstalar(e: EventoInstalar): void {
    // Sin esto Chrome muestra además su propia barrita abajo.
    e.preventDefault();
    if (!this.puedeAvisar()) return;
    this.evento = e;
    this.llegoTarde.set(this.tocado);
    this.aviso.set('android');
  }

  private abiertaComoApp(ventana: Window): boolean {
    const nav = ventana.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
    if (typeof ventana.matchMedia !== 'function') return false;
    return ['standalone', 'fullscreen', 'minimal-ui'].some(modo => ventana.matchMedia(`(display-mode: ${modo})`).matches);
  }

  private puedeAvisar(): boolean {
    if (this.leer(CLAVE_INSTALADA) === '1') return false;
    const ahoraNo = Number(this.leer(CLAVE_AHORA_NO) ?? 0);
    return !(Date.now() - ahoraNo < DIAS_SIN_AVISO * 24 * 60 * 60_000);
  }

  private leer(clave: string): string | null {
    try {
      return this.doc.defaultView?.localStorage.getItem(clave) ?? null;
    } catch {
      return null;
    }
  }

  private guardar(clave: string, valor: string): void {
    try {
      this.doc.defaultView?.localStorage.setItem(clave, valor);
    } catch {
      // Sin almacenamiento (modo privado): el aviso puede volver a salir, nada más.
    }
  }
}
