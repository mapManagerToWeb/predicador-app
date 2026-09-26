import { UbicacionMapa, type EstadoUbicacion } from './ubicacion';

type Manejador = (e: { originalEvent?: Event }) => void;

/** Mapa mínimo: registra los easeTo y permite disparar gestos. */
function mapaFalso() {
  const manejadores = new Map<string, Manejador[]>();
  const unaVez: (() => void)[] = [];
  const mapa = {
    centros: [] as number[][],
    datos: null as unknown,
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getSource: () => ({ setData: (d: unknown) => (mapa.datos = d) }),
    getZoom: () => 14,
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
});
