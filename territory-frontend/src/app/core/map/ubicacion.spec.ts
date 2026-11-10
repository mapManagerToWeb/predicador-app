import { UbicacionMapa, type EstadoUbicacion } from './ubicacion';
import { largoRumboPx, metrosPorPixel, type FuenteOrientacion } from './rumbo';
import type { Feature, Polygon } from 'geojson';

type Manejador = (e: { originalEvent?: Event }) => void;

/** Mapa mínimo: registra los easeTo, los datos de cada fuente y permite disparar gestos. */
function mapaFalso() {
  const manejadores = new Map<string, Manejador[]>();
  const unaVez: (() => void)[] = [];
  const fuentes = new Map<string, unknown>();
  const contenedor = { clientWidth: 390 };
  const mapa = {
    centros: [] as number[][],
    zoom: 14,
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getSource: (id: string) => ({ setData: (d: unknown) => fuentes.set(id, d) }),
    datos: (id: string) => fuentes.get(id) as { features: unknown[] } | undefined,
    getZoom: () => mapa.zoom,
    getContainer: () => contenedor,
    getCenter: () => {
      const [lng, lat] = mapa.centros.at(-1) ?? [0, 0];
      return { lng, lat };
    },
    on: (tipo: string, f: Manejador) => manejadores.set(tipo, [...(manejadores.get(tipo) ?? []), f]),
    once: (_: string, f: () => void) => unaVez.push(f),
    easeTo: ({ center }: { center: number[] }) => {
      mapa.centros.push(center);
      // El movimiento por código también dispara dragstart/zoomstart, sin originalEvent.
      manejadores.get('zoomstart')?.forEach(f => f({}));
      unaVez.splice(0).forEach(f => f());
    },
    gesto: (tipo = 'dragstart') => manejadores.get(tipo)?.forEach(f => f({ originalEvent: new Event('touchstart') })),
    /** Zoom como el del usuario: mueve la cámara y avisa a los oyentes de `zoom`. */
    zoomA: (z: number) => {
      mapa.zoom = z;
      manejadores.get('zoom')?.forEach(f => f({}));
    },
    /** Giro del teléfono: cambia el ancho del mapa y avisa a los oyentes de `resize`. */
    redimensionar: (ancho: number) => {
      contenedor.clientWidth = ancho;
      manejadores.get('resize')?.forEach(f => f({}));
    },
  };
  return mapa;
}

function gpsFalso() {
  let alLlegar: PositionCallback = () => undefined;
  let alFallar: PositionErrorCallback = () => undefined;
  const geo = {
    watchPosition: vi.fn((ok: PositionCallback, err: PositionErrorCallback) => {
      alLlegar = ok;
      alFallar = err;
      return 7;
    }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  };
  const posicion = (lng: number, lat: number) =>
    alLlegar({ coords: { longitude: lng, latitude: lat, accuracy: 10 } } as GeolocationPosition);
  const error = (code: number) => alFallar({ code } as GeolocationPositionError);
  return { geo: geo as unknown as Geolocation, posicion, error, clearWatch: geo.clearWatch };
}

/** Ventana falsa: entrega los eventos de orientación que la prueba decida. */
function brujulaFalsa({ sinSoporte = false } = {}) {
  const oyentes = new Map<string, ((e: unknown) => void)[]>();
  const fuente: FuenteOrientacion = {
    // Sin soporte el equipo no expone `DeviceOrientationEvent`, como un
    // escritorio: se declara acá en vez de depender de lo que traiga jsdom.
    ...(sinSoporte ? {} : { DeviceOrientationEvent: {} }),
    screen: { orientation: { angle: 0 } },
    addEventListener: (tipo: string, oyente: EventListener) => {
      const f = oyente as (e: unknown) => void;
      oyentes.set(tipo, [...(oyentes.get(tipo) ?? []), f]);
    },
    removeEventListener: (tipo: string, oyente: EventListener) => {
      oyentes.set(tipo, (oyentes.get(tipo) ?? []).filter(f => f !== oyente));
    },
  };
  const girar = (grados: number) =>
    oyentes.get('deviceorientationabsolute')?.forEach(f => f({ absolute: true, alpha: 360 - grados }));
  const escuchando = () => (oyentes.get('deviceorientationabsolute')?.length ?? 0) > 0;
  return { fuente, girar, escuchando };
}

describe('UbicacionMapa', () => {
  let mapa: ReturnType<typeof mapaFalso>;
  let gps: ReturnType<typeof gpsFalso>;
  let estados: EstadoUbicacion[];
  let ubicacion: UbicacionMapa;

  beforeEach(() => {
    mapa = mapaFalso();
    gps = gpsFalso();
    estados = [];
    ubicacion = new UbicacionMapa(mapa as never, gps.geo, e => estados.push(e));
  });

  it('el primer toque busca, centra y sigue', () => {
    ubicacion.alternar();
    expect(ubicacion.actual).toBe('buscando');
    gps.posicion(-73.34, -37.47);
    expect(ubicacion.actual).toBe('siguiendo');
    expect(mapa.centros).toEqual([[-73.34, -37.47]]);
  });

  it('si el usuario mueve el mapa deja de seguir y el GPS ya no lo trae de vuelta', () => {
    ubicacion.alternar();
    gps.posicion(-73.34, -37.47);
    mapa.gesto('dragstart');
    expect(ubicacion.actual).toBe('fondo');
    gps.posicion(-73.341, -37.471);
    expect(mapa.centros).toHaveLength(1);
  });

  it('en "fondo" el botón vuelve a centrar y seguir', () => {
    ubicacion.alternar();
    gps.posicion(-73.34, -37.47);
    mapa.gesto('zoomstart');
    gps.posicion(-73.35, -37.48);
    ubicacion.alternar();
    expect(ubicacion.actual).toBe('siguiendo');
    expect(mapa.centros.at(-1)).toEqual([-73.35, -37.48]);
  });

  it('los movimientos del propio seguimiento no cuentan como gesto', () => {
    ubicacion.alternar();
    gps.posicion(-73.34, -37.47);
    gps.posicion(-73.341, -37.471);
    expect(ubicacion.actual).toBe('siguiendo');
    expect(mapa.centros).toHaveLength(2);
  });

  it('parado en el mismo lugar no mueve el mapa y sigue atento a los gestos', () => {
    ubicacion.alternar();
    gps.posicion(-73.34, -37.47);
    gps.posicion(-73.34, -37.47);
    expect(mapa.centros).toHaveLength(1);
    mapa.gesto('dragstart');
    expect(ubicacion.actual).toBe('fondo');
  });

  it('tocar mientras sigue apaga la ubicación', () => {
    ubicacion.alternar();
    gps.posicion(-73.34, -37.47);
    ubicacion.alternar();
    expect(ubicacion.actual).toBe('apagada');
    expect(gps.clearWatch).toHaveBeenCalledWith(7);
  });

  it('permiso denegado la apaga; un corte del GPS con posición ya obtenida no', () => {
    ubicacion.alternar();
    gps.posicion(-73.34, -37.47);
    gps.error(3);
    expect(ubicacion.actual).toBe('siguiendo');
    gps.error(1);
    expect(ubicacion.actual).toBe('apagada');
  });

  it('sin brújula en el equipo queda solo el punto, sin cono', () => {
    const brujula = brujulaFalsa({ sinSoporte: true });
    const u = new UbicacionMapa(mapa as never, gps.geo, () => undefined, brujula.fuente);
    u.alternar();
    gps.posicion(-73.34, -37.47);
    expect(brujula.escuchando()).toBe(false);
    expect(mapa.datos('ubicacion')?.features).toHaveLength(2);
    expect(mapa.datos('rumbo')?.features).toHaveLength(0);
  });

  it('con brújula dibuja el cono hacia donde apunta el teléfono', () => {
    const brujula = brujulaFalsa();
    const u = new UbicacionMapa(mapa as never, gps.geo, () => undefined, brujula.fuente);
    u.alternar();
    gps.posicion(-73.34, -37.47);
    expect(brujula.escuchando()).toBe(true);
    brujula.girar(90);
    expect(mapa.datos('rumbo')?.features.length).toBeGreaterThanOrEqual(3);
  });

  it('el cono mide lo mismo en pantalla aunque el usuario haga zoom', () => {
    const brujula = brujulaFalsa();
    const u = new UbicacionMapa(mapa as never, gps.geo, () => undefined, brujula.fuente);
    u.alternar();
    gps.posicion(-73.34, -37.47);
    brujula.girar(0);
    // El tramo largo: distancia en metros desde el punto hasta el borde del cono.
    const largoEnPx = () => {
      const [cola] = mapa.datos('rumbo')?.features as Feature<Polygon>[];
      const anillo = cola.geometry.coordinates[0];
      const medio = anillo[Math.floor(anillo.length / 2)];
      const metros = Math.abs(medio[1] + 37.47) * 110_540;
      return metros / metrosPorPixel(mapa.getZoom(), -37.47);
    };
    const antes = largoEnPx();
    mapa.zoomA(19);
    expect(largoEnPx()).toBeCloseTo(antes, 6);
    expect(antes).toBeCloseTo(largoRumboPx(390), 6);
  });

  it('dibuja la sombra debajo del punto y el halo de precisión al fondo', () => {
    const ids = mapa.addLayer.mock.calls.map(([capa]) => (capa as { id: string }).id);
    expect(ids).toEqual(['ubicacion-precision', 'ubicacion-rumbo', 'ubicacion-sombra', 'ubicacion-punto']);
  });

  it('al girar el teléfono el cono se reajusta al nuevo ancho del mapa', () => {
    const brujula = brujulaFalsa();
    const u = new UbicacionMapa(mapa as never, gps.geo, () => undefined, brujula.fuente);
    u.alternar();
    gps.posicion(-73.34, -37.47);
    brujula.girar(0);
    const largo = () => {
      const [cola] = mapa.datos('rumbo')?.features as Feature<Polygon>[];
      const anillo = cola.geometry.coordinates[0];
      const medio = anillo[Math.floor(anillo.length / 2)];
      return Math.abs(medio[1] + 37.47);
    };
    const antes = largo();
    mapa.redimensionar(1200);
    expect(largo()).toBeGreaterThan(antes);
  });

  it('al apagar la ubicación también se apaga la brújula y se borra el cono', () => {
    const brujula = brujulaFalsa();
    const u = new UbicacionMapa(mapa as never, gps.geo, () => undefined, brujula.fuente);
    u.alternar();
    gps.posicion(-73.34, -37.47);
    brujula.girar(90);
    u.alternar();
    expect(brujula.escuchando()).toBe(false);
    expect(mapa.datos('rumbo')?.features).toHaveLength(0);
  });
});
