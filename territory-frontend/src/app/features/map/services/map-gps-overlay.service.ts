import { Injectable } from '@angular/core';

import type { MapEngine } from './map-engine.interface';
import { LOCATION_DEFAULTS } from '../utils/map-constants';

/** GeoJSON source holding the position marker + accuracy polygon. */
const POSITION_SOURCE_ID = 'gps-position';

/** GeoJSON source holding the breadcrumb trail LineString. */
const TRAIL_SOURCE_ID = 'gps-trail';

const ACCURACY_FILL_LAYER_ID = 'gps-accuracy-fill';
const ACCURACY_LINE_LAYER_ID = 'gps-accuracy-line';
const TRAIL_LAYER_ID = 'gps-trail-line';
const MARKER_LAYER_ID = 'gps-marker';

/** Segments of the accuracy circle (D1: computed polygon, metric-accurate). */
const ACCURACY_SEGMENTS = 64;

/** Meters per degree of latitude (WGS84, equatorial approximation). */
const METERS_PER_DEGREE_LAT = 111320;

/** Single GPS blue used for marker, accuracy and trail. */
const GPS_COLOR = '#2563eb';

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * Precomputed unit-circle vertices for the accuracy polygon. Vertex `i` sits
 * at angle `2π·i/64`; the ring is closed by repeating vertex 0, yielding 65
 * positions (64 segments).
 */
const ACCURACY_UNIT_RING: ReadonlyArray<readonly [number, number]> =
  Array.from({ length: ACCURACY_SEGMENTS }, (_, i) => {
    const angle = (i / ACCURACY_SEGMENTS) * 2 * Math.PI;
    return [Math.cos(angle), Math.sin(angle)] as const;
  });

/**
 * Builds a 64-segment circle around (`lat`, `lng`) with radius `accuracy`
 * meters, scaled per axis so the polygon stays metric-accurate across
 * latitudes (1° lat ≈ 111 320 m; 1° lng ≈ 111 320 m · cos(lat)).
 */
function accuracyPolygon(
  lat: number,
  lng: number,
  accuracy: number,
): GeoJSON.Polygon {
  const dLat = accuracy / METERS_PER_DEGREE_LAT;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
  const dLng = dLat / cosLat;
  const ring: [number, number][] = ACCURACY_UNIT_RING.map(([x, y]) => [
    lng + x * dLng,
    lat + y * dLat,
  ]);
  ring.push([...ring[0]]); // close the ring
  return { type: 'Polygon', coordinates: [ring] };
}

/**
 * Renders the GPS follow-mode overlay on the MapLibre map, following the
 * established edit-overlay pattern (`map-edit-overlay.service.ts`): two
 * GeoJSON sources (`gps-position`, `gps-trail`) plus four layers, added once
 * on {@link attach} and removed on {@link detach}.
 *
 * <p>The service is a renderer only: trail hygiene (5 m distance filter,
 * 2 000-point cap) is owned by `MapGpsFollowService` where the trail array
 * lives. {@link updateTrail} still slices defensively to the cap so the
 * rendered LineString can never exceed the D1 bound.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapGpsOverlayService {
  private attached = false;

  /** Whether the GPS sources/layers are currently on the map. */
  isAttached(): boolean {
    return this.attached;
  }

  /**
   * Adds the GPS sources and layers to the map. Idempotent: a second call on
   * an already-attached overlay does nothing (call {@link detach} first when
   * the engine instance changes).
   */
  attach(engine: MapEngine): void {
    if (this.attached) return;

    engine.addGeoJsonSource(POSITION_SOURCE_ID, EMPTY_COLLECTION);
    engine.addGeoJsonSource(TRAIL_SOURCE_ID, EMPTY_COLLECTION);

    // Bottom → top: accuracy fill, accuracy outline, trail, marker.
    engine.addLayer({
      id: ACCURACY_FILL_LAYER_ID,
      type: 'fill',
      source: POSITION_SOURCE_ID,
      paint: { 'fill-color': GPS_COLOR, 'fill-opacity': 0.15 },
    });
    engine.addLayer({
      id: ACCURACY_LINE_LAYER_ID,
      type: 'line',
      source: POSITION_SOURCE_ID,
      paint: {
        'line-color': GPS_COLOR,
        // Strengthened (1 → 1.5, 0.6 → 0.8) so the ring stays legible
        // above the 0.85–0.95-opacity marked-manzana overlay.
        'line-width': 1.5,
        'line-opacity': 0.8,
      },
    });
    engine.addLayer({
      id: TRAIL_LAYER_ID,
      type: 'line',
      source: TRAIL_SOURCE_ID,
      paint: {
        'line-color': GPS_COLOR,
        'line-width': 3,
        'line-opacity': 0.8,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    engine.addLayer({
      id: MARKER_LAYER_ID,
      type: 'circle',
      source: POSITION_SOURCE_ID,
      // Without this filter MapLibre draws a circle at every vertex of the
      // accuracy Polygon (~65 dots) — circle layers must be restricted to
      // the position Point feature.
      filter: ['==', ['get', 'kind'], 'position'],
      paint: {
        'circle-color': GPS_COLOR,
        'circle-radius': 7,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2.5,
      },
    });
    this.attached = true;
  }

  /**
   * Renders the marker at (`lat`, `lng`) plus the 64-segment accuracy
   * polygon. Non-finite or non-positive accuracies render the marker only.
   * No-op while detached.
   */
  updatePosition(
    engine: MapEngine,
    lat: number,
    lng: number,
    accuracy: number,
  ): void {
    if (!this.attached) return;

    const features: GeoJSON.Feature[] = [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: { kind: 'position' },
      },
    ];
    if (Number.isFinite(accuracy) && accuracy > 0) {
      features.push({
        type: 'Feature',
        geometry: accuracyPolygon(lat, lng, accuracy),
        properties: { kind: 'accuracy' },
      });
    }
    engine.updateGeoJsonSourceData(POSITION_SOURCE_ID, {
      type: 'FeatureCollection',
      features,
    });
  }

  /**
   * Renders the breadcrumb trail as a LineString. Fewer than 2 points (or an
   * empty trail) clears the source — a LineString needs at least 2 positions.
   * Rendered points are capped at `LOCATION_DEFAULTS.trailMaxPoints`
   * (drop-oldest), mirroring the follow service's recording cap (D1).
   * No-op while detached.
   */
  updateTrail(
    engine: MapEngine,
    trail: ReadonlyArray<readonly [number, number]>,
  ): void {
    if (!this.attached) return;

    const points = trail.slice(-LOCATION_DEFAULTS.trailMaxPoints);
    if (points.length < 2) {
      engine.updateGeoJsonSourceData(TRAIL_SOURCE_ID, EMPTY_COLLECTION);
      return;
    }
    engine.updateGeoJsonSourceData(TRAIL_SOURCE_ID, {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: points.map(([lng, lat]) => [lng, lat]),
          },
          properties: { kind: 'trail' },
        },
      ],
    });
  }

  /** Clears the rendered trail. No-op while detached. */
  clearTrail(engine: MapEngine): void {
    if (!this.attached) return;
    engine.updateGeoJsonSourceData(TRAIL_SOURCE_ID, EMPTY_COLLECTION);
  }

  /** Clears the marker + accuracy polygon (e.g. on follow deactivation). No-op while detached. */
  clearPosition(engine: MapEngine): void {
    if (!this.attached) return;
    engine.updateGeoJsonSourceData(POSITION_SOURCE_ID, EMPTY_COLLECTION);
  }

  /**
   * Removes the GPS layers and sources and detaches the overlay. Idempotent;
   * further update/clear calls become no-ops until {@link attach} runs again.
   */
  detach(engine: MapEngine): void {
    if (!this.attached) return;

    for (const id of [MARKER_LAYER_ID, TRAIL_LAYER_ID, ACCURACY_LINE_LAYER_ID, ACCURACY_FILL_LAYER_ID]) {
      try {
        engine.removeLayer(id);
      } catch {
        // Layer may not exist — ignore.
      }
    }
    for (const id of [POSITION_SOURCE_ID, TRAIL_SOURCE_ID]) {
      try {
        engine.removeSource(id);
      } catch {
        // Source may not exist — ignore.
      }
    }
    this.attached = false;
  }
}
