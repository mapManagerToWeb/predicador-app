import type * as L from 'leaflet';
import type * as GeoJSON from 'geojson';
import { SnappedPoint, Edge } from '../map-geometry';
export type { SnappedPoint, Edge };

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

export interface DatosParciales {
  puntos: SnappedPoint[];
  geometria: string;
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
  color: string;
  bounds: L.LatLngBounds;
}

