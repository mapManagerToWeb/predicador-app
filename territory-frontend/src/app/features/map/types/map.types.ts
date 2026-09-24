import type * as L from 'leaflet';
import type * as GeoJSON from 'geojson';
import type { GeometriaManzana, Lado, ZonaParcialDatos } from '../utils/lados';

export type ModoMarcado = 'none' | 'completa' | 'parcial';

/**
 * Pure data for a marked manzana — no Leaflet handles.
 * The live layer is resolved through the MapLayerRegistry seam.
 */
export interface ManzanaMarcada {
  id: string;
  nombreBloque: string;
  color: string;
  territorioNumero: number;
}

export interface FeatureLayer {
  territorioPadre: number;
  color: string;
  layer: L.GeoJSON;
}

/** Zona parcial marcada en la salida en curso (id `parcial-…`, igual que su ManzanaMarcada). */
export interface ZonaParcial extends ZonaParcialDatos {
  id: string;
  territorio: number;
}

/** Manzana abierta en modo parcial para elegir qué lados (calles) se predicaron. */
export interface EdicionLados {
  manzanaId: string;
  nombre: string;
  territorio: number;
  color: string;
  geometria: GeometriaManzana;
  lados: Lado[];
  seleccion: number[];
  /** Zona existente de esta manzana que se está editando, si la hay. */
  zonaId: string | null;
}

export interface ManzanaIndex {
  polygon: L.Polygon;
  id: string;
  nombreBloque: string;
  color: string;
  territorioNumero: number;
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

export interface TerritorioCacheData {
  fc: GeoJSON.FeatureCollection;
  simplifiedFc: GeoJSON.FeatureCollection;
  dissolvedFeature: GeoJSON.Feature | null;
  color: string;
  bounds: L.LatLngBounds;
}

