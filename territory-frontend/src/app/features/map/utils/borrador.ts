import { leerZonas, serializarZonas, type ZonaParcialDatos } from './lados';
import type { BaseTerritorio, TerritorioSalida } from './salida';

/**
 * Formato del borrador (lo marcado sin enviar). Las zonas se guardan con el
 * mismo formato que los reportes (`serializarZonas`) para reutilizar su lectura.
 */
export interface Borrador {
  abiertos: number[];
  territorios: TerritorioSalida[];
  predicacion: 'mañana' | 'tarde';
  inicioSesion: string | null;
  /**
   * De quién es (id del encargado o su teléfono). Si la sesión vence, lo
   * marcado se conserva; si después entra otra persona en el mismo teléfono,
   * no hereda las marcas ajenas.
   */
  dueno?: string | null;
}

interface ZonasGuardadas {
  g: string | null;
  p: string | null;
}

interface TerritorioGuardado {
  n: number;
  m: string[];
  z: ZonasGuardadas;
  b: { m: string[]; z: ZonasGuardadas; f: string | null; v: boolean } | null;
}

interface BorradorV2 {
  v: 2;
  abiertos: number[];
  territorios: TerritorioGuardado[];
  predicacion: string;
  inicioSesion: string | null;
  dueno?: string | null;
  savedAt: number;
}

function guardarZonas(zonas: ZonaParcialDatos[]): ZonasGuardadas {
  const { geometriaParcial, puntosParciales } = serializarZonas(zonas);
  return { g: geometriaParcial, p: puntosParciales };
}

function leerZonasGuardadas(z: unknown): ZonaParcialDatos[] {
  const zg = z as Partial<ZonasGuardadas> | null;
  if (!zg || typeof zg !== 'object') return [];
  return leerZonas(typeof zg.g === 'string' ? zg.g : null, typeof zg.p === 'string' ? zg.p : null);
}

const esTextos = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
const esNumeros = (v: unknown): v is number[] => Array.isArray(v) && v.every(x => Number.isInteger(x));
const turno = (v: unknown): 'mañana' | 'tarde' => (v === 'mañana' ? 'mañana' : 'tarde');

export function serializarBorrador(b: Borrador, ahora = Date.now()): BorradorV2 {
  return {
    v: 2,
    abiertos: b.abiertos,
    territorios: b.territorios.map(t => ({
      n: t.numero,
      m: t.marcadas,
      z: guardarZonas(t.zonas),
      b: t.base && { m: t.base.marcadas, z: guardarZonas(t.base.zonas), f: t.base.fecha, v: t.base.vueltaNueva },
    })),
    predicacion: b.predicacion,
    inicioSesion: b.inicioSesion,
    dueno: b.dueno ?? null,
    savedAt: ahora,
  };
}

function leerBase(b: unknown): BaseTerritorio | null {
  const base = b as TerritorioGuardado['b'];
  if (!base || typeof base !== 'object' || !esTextos(base.m)) return null;
  return {
    marcadas: base.m,
    zonas: leerZonasGuardadas(base.z),
    fecha: typeof base.f === 'string' ? base.f : null,
    vueltaNueva: base.v === true,
  };
}

/**
 * Lee el borrador guardado. Acepta el de la versión anterior (mapa Leaflet)
 * para no perder marcas sin enviar al actualizar la app: sus territorios
 * quedan con la base desconocida y el mapa la busca al abrirlos.
 */
export function leerBorrador(valor: unknown): Borrador | null {
  if (!valor || typeof valor !== 'object') return null;
  const v = valor as Record<string, unknown>;

  if (v['v'] === 2) {
    if (!esNumeros(v['abiertos']) || !Array.isArray(v['territorios'])) return null;
    const territorios: TerritorioSalida[] = [];
    for (const t of v['territorios'] as TerritorioGuardado[]) {
      if (!t || !Number.isInteger(t.n) || !esTextos(t.m)) continue;
      territorios.push({ numero: t.n, marcadas: [...t.m].sort(), zonas: leerZonasGuardadas(t.z), base: leerBase(t.b) });
    }
    const conDatos = new Set(territorios.map(t => t.numero));
    return {
      abiertos: (v['abiertos'] as number[]).filter(n => conDatos.has(n)),
      territorios,
      predicacion: turno(v['predicacion']),
      inicioSesion: typeof v['inicioSesion'] === 'string' ? v['inicioSesion'] : null,
      dueno: typeof v['dueno'] === 'string' ? v['dueno'] : null,
    };
  }

  return leerBorradorLeaflet(v);
}

/** Borrador del mapa Leaflet: `manzanasById` + `datosParcialesGuardados`. */
function leerBorradorLeaflet(v: Record<string, unknown>): Borrador | null {
  const manzanas = v['manzanasById'];
  const seleccion = v['territoriosSeleccionados'];
  if (!manzanas || typeof manzanas !== 'object' || !esNumeros(seleccion)) return null;

  const porTerritorio = new Map<number, TerritorioSalida>();
  const territorio = (n: number) => {
    const t = porTerritorio.get(n) ?? { numero: n, marcadas: [], zonas: [], base: null };
    porTerritorio.set(n, t);
    return t;
  };
  for (const m of Object.values(manzanas as Record<string, { id?: unknown; territorioNumero?: unknown }>)) {
    if (typeof m?.id !== 'string' || !Number.isInteger(m.territorioNumero) || m.id.startsWith('parcial-')) continue;
    territorio(m.territorioNumero as number).marcadas.push(m.id);
  }
  const parciales = v['datosParcialesGuardados'];
  if (parciales && typeof parciales === 'object') {
    for (const [n, d] of Object.entries(parciales as Record<string, { geometria?: unknown; detalle?: unknown }>)) {
      const zonas = leerZonas(typeof d?.geometria === 'string' ? d.geometria : null, typeof d?.detalle === 'string' ? d.detalle : null);
      if (zonas.length) territorio(Number(n)).zonas.push(...zonas);
    }
  }
  const territorios = [...porTerritorio.values()]
    .filter(t => (seleccion as number[]).includes(t.numero))
    .map(t => ({ ...t, marcadas: [...new Set(t.marcadas)].sort() }));
  if (territorios.length === 0) return null;
  return {
    abiertos: territorios.map(t => t.numero),
    territorios,
    predicacion: turno(v['predicacion']),
    inicioSesion: null,
  };
}
