import type * as GeoJSON from 'geojson';
import { SnappedPoint, Edge, LatLng } from '../map-geometry';
export type { SnappedPoint, Edge, LatLng };

export type ModoMarcado = 'none' | 'completa' | 'parcial';

/**
 * Pure data for a marked manzana — no map library handles.
 */
export interface ManzanaMarcada {
  id: string;
  nombreBloque: string;
  color: string;
  territorioNumero: number;
}

/**
 * Minimal interface for a Leaflet-style layer that can be styled and iterated.
 * Used by the Leaflet-legacy rendering path. In MapLibre mode these are empty.
 */
export interface LeafletStyleLayer {
  setStyle(options: Record<string, unknown>): void;
  eachLayer(fn: (l: LeafletStyleLayer) => void): void;
  getBounds(): LeafletBounds;
}

/** Minimal bounds interface — replaces L.LatLngBounds. */
export interface LeafletBounds {
  isValid(): boolean;
  extend(bounds: LeafletBounds): LeafletBounds;
  getCenter(): LatLng;
}

export interface FeatureLayer {
  territorioPadre: number;
  color: string;
  layer: LeafletStyleLayer;
}

export interface DatosParciales {
  puntos: SnappedPoint[];
  geometria: string;
}

export interface ManzanaIndex {
  polygon: { getLatLngs(): unknown; setStyle(s: Record<string, unknown>): void };
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
  bounds: LeafletBounds;
}
