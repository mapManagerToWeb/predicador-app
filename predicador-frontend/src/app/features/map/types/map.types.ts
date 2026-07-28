import * as L from 'leaflet';
import * as GeoJSON from 'geojson';
import { SnappedPoint, Edge } from '../map-geometry';
export type { SnappedPoint, Edge };

export type ModoMarcado = 'none' | 'completa' | 'parcial';

export interface ManzanaMarcada {
  id: string;
  nombreBloque: string;
  layer: L.Path;
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

export interface Reporte {
  id?: number;
  sessionTime: string;
  manzanasIds?: string;
  manzanaId?: number;
  geometriaParcial?: string;
  territorioNumero: number;
  predicacion: string;
}

export interface TerritoryData {
  number: number;
  color: string;
  bounds: L.LatLngBounds;
  fc: GeoJSON.FeatureCollection;
}