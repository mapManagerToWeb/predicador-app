import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { estaEnLista, idsDeLista, type EstadoTerritorioPublico } from '../../core/map/estado-publico';

export type { EstadoTerritorioPublico };

/** Propiedades del GeoJSON público de manzanas (GET /territories/all/geojson). */
export interface PropsManzanaPublica {
  id: string;
  mid?: number;
  nombre_bloque: string;
  territorio_padre: number;
  color: string | null;
}

export type SituacionTerritorio = 'completado' | 'en-curso' | 'sin-registro';

export interface ResumenTerritorio {
  territorio: number;
  situacion: SituacionTerritorio;
  manzanas: number;
  predicadas: number;
  ultimoTrabajo: Date | null;
  ultimoCompletado: Date | null;
}

type GeometriaManzana = Polygon | MultiPolygon;
export type ManzanaVisor = Feature<GeometriaManzana, { territorio: number; nombre: string; color: string; predicada: boolean }>;

/** Ids de manzana marcados en el último reporte de cada territorio. */
export function idsMarcados(estados: EstadoTerritorioPublico[]): Set<string> {
  const ids = new Set<string>();
  for (const e of estados) for (const id of idsDeLista(e.manzanasIds)) ids.add(id);
  return ids;
}

/**
 * Manzanas listas para el mapa del visor: con el color de su territorio y
 * si están predicadas en la vuelta en curso (el último reporte de cada
 * territorio es acumulativo).
 */
export function manzanasDelVisor(
  geojson: FeatureCollection<GeometriaManzana, PropsManzanaPublica>,
  estados: EstadoTerritorioPublico[],
  colores: Record<number, string>,
): FeatureCollection<GeometriaManzana, ManzanaVisor['properties']> {
  const marcados = idsMarcados(estados);
  return {
    type: 'FeatureCollection',
    features: geojson.features.map(f => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        territorio: f.properties.territorio_padre,
        nombre: f.properties.nombre_bloque,
        color: colores[f.properties.territorio_padre] ?? f.properties.color ?? '#888888',
        predicada: estaEnLista(marcados, f.properties.id, f.properties.mid),
      },
    })),
  };
}

/** Zonas parciales (calles sueltas) del último reporte de cada territorio. */
export function zonasParcialesDelVisor(
  estados: EstadoTerritorioPublico[],
  colores: Record<number, string>,
): FeatureCollection<GeometriaManzana, { territorio: number; color: string }> {
  const features: Feature<GeometriaManzana, { territorio: number; color: string }>[] = [];
  for (const e of estados) {
    if (!e.geometriaParcial) continue;
    try {
      const g = JSON.parse(e.geometriaParcial) as { type?: string; coordinates?: unknown };
      if ((g.type !== 'Polygon' && g.type !== 'MultiPolygon') || !Array.isArray(g.coordinates)) continue;
      features.push({
        type: 'Feature',
        geometry: g as GeometriaManzana,
        properties: { territorio: e.territorio, color: colores[e.territorio] ?? '#888888' },
      });
    } catch {
      // Geometría ilegible: se omite esa zona, el resto del mapa sigue.
    }
  }
  return { type: 'FeatureCollection', features };
}

export function resumenTerritorios(
  manzanas: FeatureCollection<GeometriaManzana, ManzanaVisor['properties']>,
  estados: EstadoTerritorioPublico[],
): Map<number, ResumenTerritorio> {
  const porEstado = new Map(estados.map(e => [e.territorio, e]));
  const resumen = new Map<number, ResumenTerritorio>();
  for (const f of manzanas.features) {
    const t = f.properties.territorio;
    const r = resumen.get(t) ?? {
      territorio: t,
      situacion: 'sin-registro' as SituacionTerritorio,
      manzanas: 0,
      predicadas: 0,
      ultimoTrabajo: null,
      ultimoCompletado: null,
    };
    r.manzanas++;
    if (f.properties.predicada) r.predicadas++;
    resumen.set(t, r);
  }
  for (const r of resumen.values()) {
    const e = porEstado.get(r.territorio);
    if (!e?.ultimoTrabajo) continue;
    r.ultimoTrabajo = new Date(e.ultimoTrabajo);
    r.ultimoCompletado = e.ultimoCompletado ? new Date(e.ultimoCompletado) : null;
    // Reinicio de ciclo: vuelve a empezar, sin trabajo todavía (se conserva cuándo se completó).
    r.situacion = e.estado === 'completed' ? 'completado' : e.estado === 'reiniciado' ? 'sin-registro' : 'en-curso';
  }
  return resumen;
}

/** "hoy", "ayer", "hace 5 días", "hace 3 meses"… */
export function hace(fecha: Date, ahora = new Date()): string {
  const dias = Math.round(
    (new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime() -
      new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime()) /
      86_400_000,
  );
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 45) return `hace ${dias} días`;
  if (dias < 548) return `hace ${Math.round(dias / 30.4)} meses`;
  return `hace ${Math.round(dias / 365)} años`;
}
