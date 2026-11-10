import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { EstadoTerritorioPublico } from '../../core/map/estado-publico';
import { getColorForTerritorio } from './utils/territory-colors';
import type { GeometriaManzana } from '../../core/map/lados';
import type { Manzana } from './utils/salida';

/**
 * Datos del mapa tal como los entrega el servidor: las manzanas en GeoJSON,
 * el color de cada territorio y el estado público del último reporte.
 */
export interface DatosMapa {
  geojson: string;
  colores: Record<number, string>;
  estados: EstadoTerritorioPublico[];
}

/** Manzana tal como viene en el GeoJSON del servidor. */
interface PropsManzanaApi {
  id: string;
  mid?: number;
  nombre_bloque: string;
  territorio_padre: number;
  color: string | null;
}

/** Manzanas ya indexadas para el marcado. */
export interface ManzanasIndexadas {
  porId: Map<string, Manzana>;
  porTerritorio: Map<number, Manzana[]>;
  colores: Record<number, string>;
}

/** Copia de los datos del mapa en el teléfono, para cuando no hay red. */
const CACHE_DATOS = 'mapa.datos.v1';

/**
 * Indexa las manzanas por id y por territorio. El servidor manda el color de
 * cada manzana; cuando viene vacío se usa el que le toca al territorio.
 * Las features sin geometría o sin territorio padre se descartan.
 */
export function indexarManzanas(datos: DatosMapa): ManzanasIndexadas {
  const porId = new Map<string, Manzana>();
  const porTerritorio = new Map<number, Manzana[]>();
  const colores = { ...(datos.colores ?? {}) };
  const fc = JSON.parse(datos.geojson) as FeatureCollection<Polygon | MultiPolygon, PropsManzanaApi>;
  for (const f of fc.features) {
    const p = f.properties;
    if (!f.geometry || !p || p.territorio_padre === undefined) continue;
    const m: Manzana = {
      id: p.id,
      mid: p.mid,
      nombre: p.nombre_bloque,
      territorio: p.territorio_padre,
      geometria: f.geometry as GeometriaManzana,
    };
    if (!colores[m.territorio]) colores[m.territorio] = getColorForTerritorio(m.territorio, p.color);
    porId.set(m.id, m);
    const lista = porTerritorio.get(m.territorio) ?? [];
    lista.push(m);
    porTerritorio.set(m.territorio, lista);
  }
  return { porId, porTerritorio, colores };
}

/** Guarda la última copia descargada. Sin espacio o sin almacenamiento, no hace nada. */
export function guardarCopia(datos: DatosMapa): void {
  try {
    localStorage.setItem(CACHE_DATOS, JSON.stringify(datos));
  } catch {
    // Sin espacio o sin almacenamiento: la próxima vez sin red no habrá copia.
  }
}

/** Lee la última copia guardada, si existe y sigue siendo válida. */
export function leerCopia(): DatosMapa | null {
  try {
    const texto = localStorage.getItem(CACHE_DATOS);
    return texto ? (JSON.parse(texto) as DatosMapa) : null;
  } catch {
    return null;
  }
}
