import type { Feature, Polygon, Position } from 'geojson';

/** Ventana con orientación del dispositivo (en las pruebas, un doble). */
export interface FuenteOrientacion {
  DeviceOrientationEvent?: { requestPermission?: () => Promise<string> };
  screen?: { orientation?: { angle?: number } };
  addEventListener(tipo: string, oyente: EventListener, capturar?: boolean): void;
  removeEventListener(tipo: string, oyente: EventListener, capturar?: boolean): void;
}

type ConBrújula = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

/**
 * Largo del cono en pantalla (px): proporcional al ancho del mapa, con topes
 * para que no se vea diminuto en un teléfono chico ni enorme en una tablet.
 */
const LARGO_RUMBO_FRACCION = 0.1;
const LARGO_RUMBO_MIN_PX = 34;
const LARGO_RUMBO_MAX_PX = 48;
/** Medio ángulo de apertura: 52° en total, la apertura del cono de Google Maps. */
const MEDIO_ANGULO = 26;
const PASOS_CONO = 12;
/**
 * El cono se dibuja con tramos anidados que van sumando opacidad hacia el
 * punto: así el borde se desvanece hacia la punta como el de Google Maps, en
 * vez de leerse como una mancha de color parejo.
 */
const TRAMOS_CONO: readonly { fraccion: number; opacidad: number }[] = [
  { fraccion: 1, opacidad: 0.045 },
  { fraccion: 0.72, opacidad: 0.05 },
  { fraccion: 0.45, opacidad: 0.055 },
  { fraccion: 0.2, opacidad: 0.06 },
];
/** Como mucho se avisa 16 veces por segundo: el resto solo agrega temblor. */
const MS_ENTRE_AVISOS = 60;
/** Un cambio menor a esto no se nota en pantalla. */
const GRADOS_MINIMOS = 2;
/** Cuánto pesa cada lectura nueva: más bajo, más estable y más lento. */
const SUAVIZADO = 0.25;
/**
 * Cuánto se espera una lectura válida antes de dar el equipo por sin brújula.
 * Sin esto el cono simplemente no aparecía y no había forma de saber por qué.
 */
const MS_ESPERA_BRUJULA = 2000;

/** Por qué el equipo no puede decir hacia dónde apunta. */
export type MotivoSinRumbo = 'sin-soporte' | 'permiso-denegado' | 'sin-brujula';

/** Lo que se le dice al usuario cuando no hay cono de dirección. */
export const AVISO_SIN_RUMBO: Record<MotivoSinRumbo, string> = {
  'sin-soporte': 'Este navegador no tiene brújula: se ve tu ubicación, pero no hacia dónde apuntás',
  'permiso-denegado': 'Sin permiso de movimiento no hay cono de dirección: actívalo en los ajustes del navegador',
  'sin-brujula': 'El teléfono no está entregando la brújula: no se puede mostrar hacia dónde apuntás',
};

export function normalizar(grados: number): number {
  return ((grados % 360) + 360) % 360;
}

/**
 * Rumbo (grados desde el norte, en sentido horario) de un evento de
 * orientación. `anguloPantalla` compensa el teléfono de lado: el borde de
 * arriba de la pantalla deja de ser el borde de arriba del teléfono.
 */
export function rumboDeEvento(e: DeviceOrientationEvent, anguloPantalla = 0): number | null {
  const bruto = rumboBruto(e);
  return bruto === null ? null : normalizar(bruto + anguloPantalla);
}

function rumboBruto(e: DeviceOrientationEvent): number | null {
  const conBrújula = e as ConBrújula;
  const precision = conBrújula.webkitCompassAccuracy;
  const brújula = conBrújula.webkitCompassHeading;
  // iOS: el rumbo viene resuelto, pero avisa con precisión negativa cuando no sirve.
  if (typeof brújula === 'number' && Number.isFinite(brújula) && (precision === undefined || precision >= 0)) {
    return brújula;
  }
  // Android: `alpha` gira al revés que una brújula y solo es norte si es absoluta.
  if (e.absolute && typeof e.alpha === 'number' && Number.isFinite(e.alpha)) return 360 - e.alpha;
  return null;
}

/** Promedio por el lado corto del círculo: 350° y 10° están a 20°, no a 340°. */
export function suavizarRumbo(anterior: number | null, nuevo: number, factor = SUAVIZADO): number {
  if (anterior === null) return normalizar(nuevo);
  const delta = ((normalizar(nuevo) - normalizar(anterior) + 540) % 360) - 180;
  return normalizar(anterior + delta * factor);
}

/**
 * Metros por píxel a esa latitud con la convención de MapLibre: el mundo mide
 * `512 · 2^zoom` píxeles (no 256 como en Leaflet). Con esto el cono mide lo
 * mismo en pantalla a cualquier zoom.
 */
export function metrosPorPixel(zoom: number, lat: number): number {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/** Largo del cono en pantalla para ese ancho de mapa. */
export function largoRumboPx(anchoMapa: number): number {
  const ancho = Number.isFinite(anchoMapa) && anchoMapa > 0 ? anchoMapa : 390;
  return Math.min(LARGO_RUMBO_MAX_PX, Math.max(LARGO_RUMBO_MIN_PX, ancho * LARGO_RUMBO_FRACCION));
}

/**
 * Sector (cono) que nace en `punto` y abre hacia `rumbo`. Va en coordenadas
 * geográficas, así que el mapa lo gira solo cuando cambia su orientación.
 */
export function cono([lng, lat]: Position, rumbo: number, largoM: number, medioAngulo = MEDIO_ANGULO): Feature<Polygon> {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110_540;
  const anillo: Position[] = [[lng, lat]];
  for (let i = 0; i <= PASOS_CONO; i++) {
    const a = ((rumbo - medioAngulo + (2 * medioAngulo * i) / PASOS_CONO) * Math.PI) / 180;
    anillo.push([lng + (largoM * Math.sin(a)) / kx, lat + (largoM * Math.cos(a)) / ky]);
  }
  anillo.push([lng, lat]);
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [anillo] }, properties: {} };
}

/**
 * Cono del mismo largo en pantalla a cualquier zoom, en tramos anidados: la
 * punta queda casi transparente y la base toma un azul suave. Así se lee como
 * un haz de dirección y no como una mancha sobre el mapa.
 */
export function conoEnPantalla(punto: Position, rumbo: number, zoom: number, anchoMapa: number): Feature<Polygon>[] {
  const largoM = metrosPorPixel(zoom, punto[1]) * largoRumboPx(anchoMapa);
  return TRAMOS_CONO.map(({ fraccion, opacidad }) => ({
    ...cono(punto, rumbo, largoM * fraccion),
    properties: { opacidad },
  }));
}

/**
 * Brújula del teléfono. Solo avisa cuando el rumbo cambió lo suficiente: el
 * sensor tiembla aunque el teléfono esté quieto.
 */
export class RumboTelefono {
  private oyente: EventListener | null = null;
  private anterior: number | null = null;
  private ultimoAviso: number | null = null;
  private ultimoEvento = 0;
  private generacion = 0;
  private espera: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly fuente: FuenteOrientacion | undefined,
    private readonly alCambiar: (rumbo: number) => void,
    private readonly ahora: () => number = () => Date.now(),
    /** Avisa por qué no hay rumbo, para que la pantalla lo pueda explicar. */
    private readonly alNoPoder: (motivo: MotivoSinRumbo) => void = () => undefined,
  ) {}

  /** Debe llamarse desde un toque: iOS pide el permiso dentro del gesto. */
  async encender(): Promise<void> {
    const fuente = this.fuente;
    if (!fuente || typeof fuente.DeviceOrientationEvent === 'undefined') {
      this.alNoPoder('sin-soporte');
      return;
    }
    this.apagar();
    const generacion = this.generacion;
    const pedir = fuente.DeviceOrientationEvent.requestPermission;
    if (typeof pedir === 'function') {
      try {
        const estado = await pedir.call(fuente.DeviceOrientationEvent);
        // Mientras se respondía el permiso, el usuario pudo apagar la ubicación.
        if (generacion !== this.generacion) return;
        if (estado !== 'granted') {
          this.alNoPoder('permiso-denegado');
          return;
        }
      } catch {
        this.alNoPoder('permiso-denegado');
        return;
      }
    }
    this.oyente = (e: Event) => this.alEvento(e as DeviceOrientationEvent);
    fuente.addEventListener('deviceorientationabsolute', this.oyente, true);
    fuente.addEventListener('deviceorientation', this.oyente, true);
    this.espera = setTimeout(() => {
      this.espera = null;
      // Sin ninguna lectura, el equipo no tiene brújula (o el navegador la bloquea).
      if (this.anterior === null) this.alNoPoder('sin-brujula');
    }, MS_ESPERA_BRUJULA);
  }

  apagar(): void {
    this.generacion++;
    if (this.espera !== null) {
      clearTimeout(this.espera);
      this.espera = null;
    }
    if (this.oyente && this.fuente) {
      this.fuente.removeEventListener('deviceorientationabsolute', this.oyente, true);
      this.fuente.removeEventListener('deviceorientation', this.oyente, true);
    }
    this.oyente = null;
    this.anterior = null;
    this.ultimoAviso = null;
    this.ultimoEvento = 0;
  }

  private alEvento(e: DeviceOrientationEvent): void {
    const rumbo = rumboDeEvento(e, this.anguloPantalla());
    if (rumbo === null) return;
    if (this.espera !== null) {
      clearTimeout(this.espera);
      this.espera = null;
    }
    const ahora = this.ahora();
    if (ahora - this.ultimoEvento < MS_ENTRE_AVISOS) return;
    this.ultimoEvento = ahora;
    const suave = suavizarRumbo(this.anterior, rumbo);
    this.anterior = suave;
    if (this.ultimoAviso !== null && Math.abs(((suave - this.ultimoAviso + 540) % 360) - 180) < GRADOS_MINIMOS) return;
    this.ultimoAviso = suave;
    this.alCambiar(suave);
  }

  private anguloPantalla(): number {
    const angulo = this.fuente?.screen?.orientation?.angle;
    return typeof angulo === 'number' ? angulo : 0;
  }
}
