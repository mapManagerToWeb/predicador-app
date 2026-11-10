import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection, Polygon, Position } from 'geojson';
import { conoEnPantalla, RumboTelefono, type FuenteOrientacion, type MotivoSinRumbo } from './rumbo';

export type EstadoUbicacion = 'apagada' | 'buscando' | 'siguiendo' | 'fondo';
export type ErrorUbicacion = 'denegada' | 'no-disponible';

const ZOOM_AL_CENTRAR = 17;
const OPCIONES: PositionOptions = { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 };

/**
 * "Mi ubicación" como en Google Maps:
 * - el primer toque busca la posición, centra el mapa y lo sigue;
 * - cualquier gesto del usuario sobre el mapa deja de seguirlo: el punto azul
 *   se sigue moviendo pero el mapa se queda donde el usuario lo dejó;
 * - tocar el botón en ese estado vuelve a centrar y seguir;
 * - tocarlo mientras sigue apaga la ubicación.
 *
 * Encendida, dibuja también un cono hacia donde apunta el teléfono: sirve para
 * saber qué calle seguir. Si el equipo no tiene brújula, queda solo el punto.
 */
export class UbicacionMapa {
  private estado: EstadoUbicacion = 'apagada';
  private idSeguimiento: number | null = null;
  private ultima: Position | null = null;
  private precision: number | null = null;
  private rumbo: number | null = null;
  private readonly brujula: RumboTelefono;
  /** Movimientos de cámara iniciados por este objeto (no son gestos del usuario). */
  private moviendo = false;

  constructor(
    private readonly map: MapLibreMap,
    private readonly geo: Geolocation | undefined,
    private readonly alCambiar: (e: EstadoUbicacion, error?: ErrorUbicacion) => void,
    fuenteRumbo: FuenteOrientacion | undefined = ventanaActual(),
    /** Por qué no hay cono de dirección, para que la pantalla lo explique. */
    private readonly alNoPoderRumbo?: (motivo: MotivoSinRumbo) => void,
  ) {
    this.brujula = new RumboTelefono(
      fuenteRumbo,
      rumbo => {
        this.rumbo = rumbo;
        this.refrescarRumbo();
      },
      undefined,
      motivo => this.alNoPoderRumbo?.(motivo),
    );
    map.addSource('ubicacion', { type: 'geojson', data: vacio() });
    // El cono va en su propia fuente: se recalcula al girar el teléfono y al
    // cambiar el zoom sin volver a subir el círculo de precisión.
    map.addSource('rumbo', { type: 'geojson', data: vacio() });
    map.addLayer({
      id: 'ubicacion-precision',
      type: 'fill',
      source: 'ubicacion',
      filter: ['==', ['geometry-type'], 'Polygon'],
      // Halo de precisión tenue, como el de Google Maps: informa sin tapar el mapa.
      paint: { 'fill-color': '#1a73e8', 'fill-opacity': 0.1 },
    });
    map.addLayer({
      id: 'ubicacion-rumbo',
      type: 'fill',
      source: 'rumbo',
      // La opacidad viene por tramo: la punta casi transparente, la base más marcada.
      paint: { 'fill-color': '#1a73e8', 'fill-opacity': ['coalesce', ['get', 'opacidad'], 0.05] },
    });
    // Sombra suave bajo el punto: le da volumen sobre el mapa, como el punto de Google Maps.
    map.addLayer({
      id: 'ubicacion-sombra',
      type: 'circle',
      source: 'ubicacion',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 15, 'circle-color': '#0f172a', 'circle-opacity': 0.14, 'circle-blur': 1 },
    });
    map.addLayer({
      id: 'ubicacion-punto',
      type: 'circle',
      source: 'ubicacion',
      filter: ['==', ['geometry-type'], 'Point'],
      // Punto azul con anillo blanco, del tamaño del de Google Maps.
      paint: { 'circle-radius': 9, 'circle-color': '#1a73e8', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 },
    });
    // El cono se mide en píxeles: al acercarse o alejarse hay que rehacerlo.
    map.on('zoom', () => {
      if (this.rumbo !== null) this.refrescarRumbo();
    });
    // Al girar el teléfono cambia el ancho del mapa: el largo del cono lo acompaña.
    map.on('resize', () => {
      if (this.rumbo !== null) this.refrescarRumbo();
    });
    // Un gesto del usuario trae `originalEvent`; los movimientos por código no.
    for (const tipo of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'] as const) {
      map.on(tipo, (e: { originalEvent?: Event }) => {
        if (e.originalEvent && !this.moviendo) this.dejarDeSeguir();
      });
    }
  }

  get actual(): EstadoUbicacion {
    return this.estado;
  }

  /** Acción del botón. */
  alternar(): void {
    switch (this.estado) {
      case 'apagada':
        this.encender();
        break;
      case 'buscando':
        break;
      case 'siguiendo':
        this.apagar();
        break;
      case 'fondo':
        this.cambiar('siguiendo');
        if (this.ultima) this.centrar(this.ultima);
        break;
    }
  }

  /** El mapa se movió por otra razón (se abrió un territorio o una manzana). */
  dejarDeSeguir(): void {
    if (this.estado === 'siguiendo') this.cambiar('fondo');
  }

  apagar(): void {
    if (this.idSeguimiento !== null) this.geo?.clearWatch(this.idSeguimiento);
    this.idSeguimiento = null;
    this.ultima = null;
    this.precision = null;
    this.rumbo = null;
    this.brujula.apagar();
    void this.fuente('ubicacion')?.setData(vacio());
    void this.fuente('rumbo')?.setData(vacio());
    this.cambiar('apagada');
  }

  private encender(): void {
    if (!this.geo) {
      this.cambiar('apagada', 'no-disponible');
      return;
    }
    this.cambiar('buscando');
    // Dentro del toque: iOS exige un gesto para pedir la brújula.
    void this.brujula.encender();
    this.idSeguimiento = this.geo.watchPosition(
      pos => this.alLlegar(pos),
      err => this.alFallar(err),
      OPCIONES,
    );
  }

  private alLlegar(pos: GeolocationPosition): void {
    const punto: Position = [pos.coords.longitude, pos.coords.latitude];
    this.ultima = punto;
    this.precision = pos.coords.accuracy;
    this.refrescarUbicacion();
    if (this.estado === 'buscando') {
      this.cambiar('siguiendo');
      this.centrar(punto, Math.max(this.map.getZoom(), ZOOM_AL_CENTRAR));
    } else if (this.estado === 'siguiendo') {
      this.centrar(punto);
    }
    // En "fondo" solo se mueve el punto: el mapa queda donde el usuario lo dejó.
  }

  private alFallar(err: GeolocationPositionError): void {
    if (err.code === 1) {
      this.apagar();
      this.alCambiar('apagada', 'denegada');
    } else if (this.estado === 'buscando') {
      this.apagar();
      this.alCambiar('apagada', 'no-disponible');
    }
    // Si ya había posición, un corte momentáneo del GPS no apaga nada.
  }

  private refrescarUbicacion(): void {
    const fuente = this.fuente('ubicacion');
    if (!this.ultima) {
      void fuente?.setData(vacio());
      return;
    }
    const punto = this.ultima;
    void fuente?.setData({
      type: 'FeatureCollection',
      features: [circulo(punto, this.precision ?? 0), { type: 'Feature', geometry: { type: 'Point', coordinates: punto }, properties: {} }],
    });
    this.refrescarRumbo();
  }

  private refrescarRumbo(): void {
    const fuente = this.fuente('rumbo');
    if (!this.ultima || this.rumbo === null) {
      void fuente?.setData(vacio());
      return;
    }
    void fuente?.setData({
      type: 'FeatureCollection',
      features: conoEnPantalla(this.ultima, this.rumbo, this.map.getZoom(), this.anchoMapa()),
    });
  }

  /** El cono se mide contra el mapa real: en un teléfono chico tiene que achicarse. */
  private anchoMapa(): number {
    const ancho = this.map.getContainer()?.clientWidth ?? 0;
    return ancho > 0 ? ancho : 390;
  }

  private fuente(id: string): GeoJSONSource | undefined {
    return this.map.getSource(id) as GeoJSONSource | undefined;
  }

  private centrar(punto: Position, zoom?: number): void {
    // Parado en el mismo lugar el GPS repite la posición: si no hay nada que
    // mover no se mueve (y no queda esperando un moveend que no llega).
    const c = this.map.getCenter();
    const quieto = Math.abs(c.lng - punto[0]) < 1e-6 && Math.abs(c.lat - punto[1]) < 1e-6;
    if (quieto && (zoom === undefined || zoom === this.map.getZoom())) return;
    this.moviendo = true;
    // Escuchar antes de mover: con "reducir movimiento" el easeTo termina en el acto.
    this.map.once('moveend', () => (this.moviendo = false));
    this.map.easeTo({ center: punto as [number, number], zoom, duration: 500 });
  }

  private cambiar(e: EstadoUbicacion, error?: ErrorUbicacion): void {
    this.estado = e;
    this.alCambiar(e, error);
  }
}

function vacio(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function ventanaActual(): FuenteOrientacion | undefined {
  return typeof window !== 'undefined' ? (window as unknown as FuenteOrientacion) : undefined;
}

/** Círculo de precisión (radio en metros) como polígono de 32 lados. */
function circulo([lng, lat]: Position, radioM: number): Feature<Polygon> {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const anillo: Position[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * 2 * Math.PI;
    anillo.push([lng + (radioM * Math.cos(a)) / kx, lat + (radioM * Math.sin(a)) / 110_540]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [anillo] }, properties: {} };
}
