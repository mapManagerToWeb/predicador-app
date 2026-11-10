import {
  cono,
  conoEnPantalla,
  largoRumboPx,
  metrosPorPixel,
  normalizar,
  rumboDeEvento,
  RumboTelefono,
  suavizarRumbo,
  type FuenteOrientacion,
} from './rumbo';

function evento(datos: Record<string, unknown>): DeviceOrientationEvent {
  return datos as unknown as DeviceOrientationEvent;
}

/** Ventana falsa que registra sus oyentes y deja dispararlos a mano. */
function ventanaConOyentes(extra: Partial<FuenteOrientacion> = {}) {
  const oyentes = new Map<string, EventListener>();
  const fuente: FuenteOrientacion = {
    DeviceOrientationEvent: {},
    screen: { orientation: { angle: 0 } },
    addEventListener: (tipo: string, oyente: EventListener) => {
      oyentes.set(tipo, oyente);
    },
    removeEventListener: (tipo: string, oyente: EventListener) => {
      if (oyentes.get(tipo) === oyente) oyentes.delete(tipo);
    },
    ...extra,
  };
  const escuchando = () => oyentes.size > 0;
  /** `alpha` es el giro del sensor; el rumbo es su complemento. */
  const emitir = (alpha: number) =>
    oyentes.get('deviceorientationabsolute')?.({ absolute: true, alpha } as unknown as Event);
  return { fuente, escuchando, emitir };
}

describe('rumboDeEvento', () => {
  it('usa la brújula de iOS', () => {
    expect(rumboDeEvento(evento({ webkitCompassHeading: 123 }))).toBe(123);
  });

  it('con orientación absoluta convierte alpha a rumbo', () => {
    expect(rumboDeEvento(evento({ absolute: true, alpha: 90 }))).toBe(270);
    expect(rumboDeEvento(evento({ absolute: true, alpha: 270 }))).toBe(90);
    expect(rumboDeEvento(evento({ absolute: true, alpha: 0 }))).toBe(0);
  });

  it('sin norte absoluto no inventa un rumbo', () => {
    expect(rumboDeEvento(evento({ absolute: false, alpha: 90 }))).toBeNull();
    expect(rumboDeEvento(evento({}))).toBeNull();
  });

  it('si iOS dice que la brújula no sirve, cae a la orientación absoluta', () => {
    expect(rumboDeEvento(evento({ webkitCompassHeading: 45, webkitCompassAccuracy: -1, absolute: true, alpha: 90 }))).toBe(270);
  });

  it('suma el giro de la pantalla (teléfono de lado)', () => {
    expect(rumboDeEvento(evento({ webkitCompassHeading: 10 }), 90)).toBe(100);
    expect(rumboDeEvento(evento({ webkitCompassHeading: 350 }), 90)).toBe(80);
  });
});

describe('normalizar', () => {
  it('deja el rumbo entre 0 y 360', () => {
    expect(normalizar(0)).toBe(0);
    expect(normalizar(360)).toBe(0);
    expect(normalizar(-10)).toBe(350);
    expect(normalizar(730)).toBe(10);
  });
});

describe('suavizarRumbo', () => {
  it('arranca con la primera lectura', () => {
    expect(suavizarRumbo(null, 350)).toBe(350);
  });

  it('cruza el norte por el lado corto', () => {
    expect(suavizarRumbo(350, 10, 0.5)).toBe(0);
    expect(suavizarRumbo(10, 350, 0.5)).toBe(0);
  });

  it('se acerca sin saltar de golpe', () => {
    expect(suavizarRumbo(0, 90, 0.5)).toBe(45);
  });
});

describe('cono', () => {
  const punto: [number, number] = [-73.34, -37.47];
  const medio = (f: ReturnType<typeof cono>) => {
    const anillo = f.geometry.coordinates[0];
    return anillo[Math.floor(anillo.length / 2)];
  };

  it('apunta al norte', () => {
    const [, lat] = medio(cono(punto, 0, 50));
    const [lng] = medio(cono(punto, 0, 50));
    expect(lat).toBeGreaterThan(punto[1]);
    expect(lng).toBeCloseTo(punto[0], 6);
  });

  it('apunta al este', () => {
    const [lng, lat] = medio(cono(punto, 90, 50));
    expect(lng).toBeGreaterThan(punto[0]);
    expect(lat).toBeCloseTo(punto[1], 6);
  });

  it('arranca y termina en la ubicación, así el cono nace del punto', () => {
    const anillo = cono(punto, 45, 50).geometry.coordinates[0];
    expect(anillo[0]).toEqual(punto);
    expect(anillo.at(-1)).toEqual(punto);
  });
});

describe('metrosPorPixel', () => {
  it('usa la convención de MapLibre: el mundo mide 512·2^zoom píxeles', () => {
    expect(metrosPorPixel(0, 0)).toBeCloseTo(40075016.686 / 512, 3);
    // A zoom 15 en el ecuador, un píxel mide ~2.39 m (con 256 serían ~4.78 m).
    expect(metrosPorPixel(15, 0)).toBeCloseTo(2.3887, 3);
  });

  it('cada zoom acerca a la mitad', () => {
    expect(metrosPorPixel(16, -37) / metrosPorPixel(17, -37)).toBeCloseTo(2, 6);
  });
});

describe('largoRumboPx', () => {
  it('acompaña el ancho del mapa dentro de topes sanos', () => {
    expect(largoRumboPx(390)).toBeCloseTo(39, 6);
    expect(largoRumboPx(320)).toBe(34);
    expect(largoRumboPx(1200)).toBe(48);
  });

  it('sin ancho válido usa un teléfono típico', () => {
    expect(largoRumboPx(0)).toBe(largoRumboPx(390));
    expect(largoRumboPx(Number.NaN)).toBe(largoRumboPx(390));
  });
});

describe('conoEnPantalla', () => {
  const punto: [number, number] = [-73.34, -37.47];
  /** Largo en píxeles de pantalla con la convención de MapLibre (512 px de mundo en el zoom 0). */
  const px = (f: ReturnType<typeof conoEnPantalla>[number], zoom: number) => {
    const anillo = f.geometry.coordinates[0];
    const medio = anillo[Math.floor(anillo.length / 2)];
    const metros = Math.abs(medio[1] - punto[1]) * 110_540;
    const metrosPorPx = (40075016.686 * Math.cos((punto[1] * Math.PI) / 180)) / (512 * 2 ** zoom);
    return metros / metrosPorPx;
  };
  const largoDe = (f: ReturnType<typeof conoEnPantalla>[number]) => {
    const anillo = f.geometry.coordinates[0];
    return Math.abs(anillo[Math.floor(anillo.length / 2)][1] - punto[1]);
  };

  it('mide largoRumboPx en pantalla a cualquier zoom', () => {
    for (const zoom of [11, 14, 17, 19]) {
      expect(px(conoEnPantalla(punto, 0, zoom, 390)[0], zoom)).toBeCloseTo(largoRumboPx(390), 6);
    }
  });

  it('se achica en un teléfono chico y no crece en una tablet', () => {
    expect(px(conoEnPantalla(punto, 0, 17, 320)[0], 17)).toBeLessThan(px(conoEnPantalla(punto, 0, 17, 390)[0], 17));
    expect(px(conoEnPantalla(punto, 0, 17, 1200)[0], 17)).toBe(px(conoEnPantalla(punto, 0, 17, 900)[0], 17));
  });

  it('se desvanece hacia la punta: tramos anidados cada vez más cortos y opacos', () => {
    const tramos = conoEnPantalla(punto, 0, 17, 390);
    expect(tramos.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < tramos.length; i++) {
      expect(largoDe(tramos[i])).toBeLessThan(largoDe(tramos[i - 1]));
      expect(tramos[i].properties?.['opacidad'] as number).toBeGreaterThan(tramos[i - 1].properties?.['opacidad'] as number);
    }
    // La punta queda casi transparente: el cono se lee como un haz, no como una mancha.
    expect(tramos[0].properties?.['opacidad'] as number).toBeLessThan(0.08);
  });
});

describe('RumboTelefono · permiso de iOS', () => {
  it('con el permiso concedido se suscribe a la orientación', async () => {
    const ventana = ventanaConOyentes({
      DeviceOrientationEvent: { requestPermission: async () => 'granted' },
    });
    await new RumboTelefono(ventana.fuente, () => undefined).encender();
    expect(ventana.escuchando()).toBe(true);
  });

  it('si el permiso se niega no se suscribe', async () => {
    const ventana = ventanaConOyentes({
      DeviceOrientationEvent: { requestPermission: async () => 'denied' },
    });
    await new RumboTelefono(ventana.fuente, () => undefined).encender();
    expect(ventana.escuchando()).toBe(false);
  });

  it('si pedir el permiso revienta no propaga el error ni se suscribe', async () => {
    const ventana = ventanaConOyentes({
      DeviceOrientationEvent: {
        requestPermission: async () => {
          throw new Error('sin permiso');
        },
      },
    });
    await expect(new RumboTelefono(ventana.fuente, () => undefined).encender()).resolves.toBeUndefined();
    expect(ventana.escuchando()).toBe(false);
  });

  it('si apagan la ubicación con el permiso abierto, la respuesta tardía no se suscribe', async () => {
    let responder: (estado: string) => void = () => undefined;
    const pendiente = new Promise<string>(resolver => (responder = resolver));
    const ventana = ventanaConOyentes({
      DeviceOrientationEvent: { requestPermission: () => pendiente },
    });
    const telefono = new RumboTelefono(ventana.fuente, () => undefined);

    const encendido = telefono.encender();
    telefono.apagar(); // el usuario apaga mientras el diálogo sigue abierto
    responder('granted');
    await encendido;

    expect(ventana.escuchando()).toBe(false);
  });
});

describe('RumboTelefono · por qué no hay rumbo', () => {
  it('avisa cuando el equipo no tiene brújula', async () => {
    const motivos: string[] = [];
    const ventana = ventanaConOyentes({ DeviceOrientationEvent: undefined });
    await new RumboTelefono(ventana.fuente, () => undefined, undefined, m => motivos.push(m)).encender();
    expect(motivos).toEqual(['sin-soporte']);
  });

  it('avisa cuando se niega el permiso de movimiento', async () => {
    const motivos: string[] = [];
    const ventana = ventanaConOyentes({
      DeviceOrientationEvent: { requestPermission: async () => 'denied' },
    });
    await new RumboTelefono(ventana.fuente, () => undefined, undefined, m => motivos.push(m)).encender();
    expect(motivos).toEqual(['permiso-denegado']);
  });

  it('avisa cuando en dos segundos no llega ninguna lectura', async () => {
    vi.useFakeTimers();
    try {
      const motivos: string[] = [];
      const ventana = ventanaConOyentes({ DeviceOrientationEvent: {} });
      await new RumboTelefono(ventana.fuente, () => undefined, undefined, m => motivos.push(m)).encender();
      vi.advanceTimersByTime(2000);
      expect(motivos).toEqual(['sin-brujula']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('con una lectura válida no avisa nada', async () => {
    vi.useFakeTimers();
    try {
      const motivos: string[] = [];
      const ventana = ventanaConOyentes({ DeviceOrientationEvent: {} });
      const telefono = new RumboTelefono(ventana.fuente, () => undefined, undefined, m => motivos.push(m));
      await telefono.encender();
      ventana.emitir(360);
      vi.advanceTimersByTime(2000);
      expect(motivos).toEqual([]);
      telefono.apagar();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('RumboTelefono · cuándo avisa', () => {
  it('descarta los avisos más seguidos que 60 ms sin mover el estado', async () => {
    const avisos: number[] = [];
    let ahora = 0;
    const ventana = ventanaConOyentes();
    const telefono = new RumboTelefono(ventana.fuente, r => avisos.push(r), () => ahora);
    await telefono.encender();

    ahora = 1000;
    ventana.emitir(360); // rumbo 0
    ahora = 1030;
    ventana.emitir(270); // 30 ms después: se descarta
    expect(avisos).toEqual([0]);

    ahora = 1070;
    ventana.emitir(270);
    // Si el aviso descartado hubiera movido el estado, acá daría 39.375.
    expect(avisos).toHaveLength(2);
    expect(avisos[1]).toBeCloseTo(22.5, 6);
  });

  it('no avisa por un cambio menor a 2°, aunque sí lo acumula', async () => {
    const avisos: number[] = [];
    let ahora = 0;
    const ventana = ventanaConOyentes();
    const telefono = new RumboTelefono(ventana.fuente, r => avisos.push(r), () => ahora);
    await telefono.encender();

    ahora = 1000;
    ventana.emitir(360); // rumbo 0
    ahora = 2000;
    ventana.emitir(356); // rumbo 4: suavizado a 1°, no se nota en pantalla
    expect(avisos).toEqual([0]);
  });

  it('avisa cuando el giro se nota', async () => {
    const avisos: number[] = [];
    let ahora = 0;
    const ventana = ventanaConOyentes();
    const telefono = new RumboTelefono(ventana.fuente, r => avisos.push(r), () => ahora);
    await telefono.encender();

    ahora = 1000;
    ventana.emitir(360); // rumbo 0
    ahora = 2000;
    ventana.emitir(340); // rumbo 20: suavizado a 5°
    expect(avisos).toEqual([0, 5]);
  });
});
