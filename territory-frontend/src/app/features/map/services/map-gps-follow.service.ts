import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { Subscription } from 'rxjs';

import {
  MapLocationService,
  type LocationConsumer,
  type LocationEvent,
} from './map-location.service';
import { MapGpsOverlayService } from './map-gps-overlay.service';
import type { MapEngine } from './map-engine.interface';
import { MapStateService } from './map-state.service';
import { LOCATION_DEFAULTS, TOAST_MESSAGES } from '../utils/map-constants';

export type GpsFollowState = 'off' | 'active' | 'paused';

export type GpsFollowError = 'denied' | 'unavailable' | 'timeout' | 'unsupported' | null;

/** A trail point in `[lng, lat]` order (GeoJSON convention). */
export type TrailPoint = readonly [number, number];

/**
 * Camera + event capabilities follow mode needs on top of {@link MapEngine}.
 * Declared structurally so pinned `MapEngine` mocks stay valid; satisfied by
 * the concrete `MaplibreEngineService`.
 */
export interface GpsFollowEngine {
  easeTo(center: [number, number], options?: { duration?: number }): void;
  on(event: string, handler: () => void): void;
  off(event: string, handler: () => void): void;
}

/** Engine contract accepted by {@link MapGpsFollowService.attachEngine}. */
export type GpsFollowMapEngine = MapEngine & GpsFollowEngine;

/** Camera easing duration for follow-mode re-centering (ms). */
const EASE_DURATION_MS = 500;

/** Mean Earth radius (m) for the haversine trail distance filter. */
const EARTH_RADIUS_M = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two `[lng, lat]` points, in meters. */
export function distanceMeters(from: TrailPoint, to: TrailPoint): number {
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * GPS follow-me mode: `off → active → paused` state machine over the shared,
 * ref-counted {@link MapLocationService} watch.
 *
 * <p>Responsibilities:</p>
 * <ul>
 *   <li>Viewport lock — eases the camera to every position while `active`.</li>
 *   <li>Manual takeover — `dragstart`/`zoomstart`/`rotatestart`/`pitchstart`
 *       transition to `paused`; a re-center action returns to `active`.</li>
 *   <li>Edit interplay (D4) — entering partial-draw/edit forces `paused` and
 *       never auto-resumes; deactivating edit keeps the pause.</li>
 *   <li>Rendering — pushes marker/accuracy/trail into
 *       {@link MapGpsOverlayService}.</li>
 *   <li>Trail hygiene (D1) — 5 m distance filter, 2 000-point cap.</li>
 * </ul>
 *
 * <p>The watch is released on deactivation, fatal geolocation errors, and
 * {@link destroy} (route exit) — satisfying "no orphaned location watches".</p>
 */
@Injectable({ providedIn: 'root' })
export class MapGpsFollowService {
  private readonly location = inject(MapLocationService);
  private readonly overlay = inject(MapGpsOverlayService);
  private readonly mapState = inject(MapStateService);

  private readonly stateSignal = signal<GpsFollowState>('off');
  private readonly trailSignal = signal<readonly TrailPoint[]>([]);
  private readonly errorSignal = signal<GpsFollowError>(null);

  readonly state = this.stateSignal.asReadonly();
  readonly trail = this.trailSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  /** True while partial-draw or GeoJSON edit mode owns the camera (D4). */
  readonly editing = computed(
    () =>
      this.mapState.modoMarcado() === 'parcial' ||
      this.mapState.editGeoJson() !== null,
  );

  /** Spanish error copy for the current error, or `null` when healthy. */
  readonly errorMessage = computed<string | null>(() => {
    switch (this.errorSignal()) {
      case 'denied':
        return TOAST_MESSAGES.locationDenied;
      case 'unavailable':
      case 'timeout':
        return TOAST_MESSAGES.locationUnavailable;
      case 'unsupported':
        return TOAST_MESSAGES.locationUnsupported;
      case null:
        return null;
    }
  });

  /** True when at least one trail point is recorded (disables "Limpiar ruta"). */
  readonly hasTrail = computed(() => this.trailSignal().length > 0);

  /** True while follow mode holds the position lock (active, not paused). */
  readonly following = computed(() => this.stateSignal() === 'active');

  private engine: GpsFollowMapEngine | null = null;
  private consumer: LocationConsumer | null = null;
  private subscription: Subscription | null = null;
  private lastPosition: TrailPoint | null = null;
  /** True while an `easeTo` we initiated is executing (guards pause handlers). */
  private easing = false;

  private readonly handleDragStart = (): void => this.handleUserInteraction();
  private readonly handleZoomStart = (): void => this.handleUserInteraction();
  private readonly handleRotateStart = (): void => this.handleUserInteraction();
  private readonly handlePitchStart = (): void => this.handleUserInteraction();

  constructor() {
    // D4: entering edit mode while following forces a pause; leaving edit
    // mode never auto-resumes (explicit user action only).
    effect(() => {
      if (this.editing() && this.stateSignal() === 'active') {
        this.stateSignal.set('paused');
      }
    });
  }

  /**
   * Wires follow mode to a freshly created map engine: attaches the GPS
   * overlay and registers the user-interaction pause handlers. Idempotent per
   * engine instance; call {@link destroy} before re-attaching a new engine.
   */
  attachEngine(engine: GpsFollowMapEngine): void {
    this.engine = engine;
    this.overlay.attach(engine);
    engine.on('dragstart', this.handleDragStart);
    engine.on('zoomstart', this.handleZoomStart);
    engine.on('rotatestart', this.handleRotateStart);
    engine.on('pitchstart', this.handlePitchStart);
  }

  /**
   * Activates follow mode: acquires a consumer slot on the shared watch and
   * starts locking the viewport to position updates. No-op while edit mode
   * owns the camera (D4). On unavailable geolocation it surfaces the
   * `unsupported` error and stays off instead of throwing (SSR/insecure
   * context contract).
   */
  activate(): void {
    if (this.editing()) return;
    if (this.stateSignal() !== 'off') return;

    this.errorSignal.set(null);
    const consumer = this.location.start();
    if (!consumer) {
      this.errorSignal.set('unsupported');
      return;
    }
    this.consumer = consumer;
    this.ensureSubscribed();
    this.stateSignal.set('active');
  }

  /**
   * Deactivates follow mode: releases the watch consumer, clears the marker
   * (a stale dot would mislead) and returns to `off`. The trail is kept — the
   * user can clear it explicitly with {@link clearTrail}.
   */
  deactivate(): void {
    this.releaseConsumer();
    this.stateSignal.set('off');
    const engine = this.engine;
    if (engine) this.overlay.clearPosition(engine);
  }

  /**
   * Re-center action (only offered while `paused`): eases back to the last
   * known position and resumes the viewport lock.
   */
  recenter(): void {
    if (this.stateSignal() !== 'paused') return;
    this.stateSignal.set('active');
    const last = this.lastPosition;
    if (last) this.easeToCenter([last[0], last[1]]);
  }

  /** Clears the breadcrumb trail (signal + rendered source). */
  clearTrail(): void {
    this.trailSignal.set([]);
    const engine = this.engine;
    if (engine) this.overlay.clearTrail(engine);
  }

  /**
   * Full teardown for route exit: releases the watch, unsubscribes from the
   * position stream, detaches camera handlers and the overlay, and resets to
   * the default `off` state so a later route entry starts clean. The shared
   * location stream itself stays alive (root-provided service).
   */
  destroy(): void {
    this.releaseConsumer();
    this.subscription?.unsubscribe();
    this.subscription = null;

    const engine = this.engine;
    if (engine) {
      engine.off('dragstart', this.handleDragStart);
      engine.off('zoomstart', this.handleZoomStart);
      engine.off('rotatestart', this.handleRotateStart);
      engine.off('pitchstart', this.handlePitchStart);
      this.overlay.detach(engine);
      this.engine = null;
    }

    this.stateSignal.set('off');
    this.trailSignal.set([]);
    this.errorSignal.set(null);
    this.lastPosition = null;
    this.easing = false;
  }

  private ensureSubscribed(): void {
    if (this.subscription) return;
    this.subscription = this.location.events$.subscribe((event) =>
      this.onLocationEvent(event),
    );
  }

  private onLocationEvent(event: LocationEvent): void {
    if (this.stateSignal() === 'off') return; // deactivated: ignore stream

    if (event.kind === 'error') {
      this.releaseConsumer(); // watch already torn down by the location service
      this.stateSignal.set('off');
      this.errorSignal.set(event.code);
      const engine = this.engine;
      if (engine) this.overlay.clearPosition(engine);
      return;
    }

    this.lastPosition = [event.lng, event.lat];
    const engine = this.engine;
    if (engine) {
      this.overlay.updatePosition(engine, event.lat, event.lng, event.accuracy);
    }

    // Trail records while engaged (active OR paused): pausing only releases
    // the viewport, it does not stop walking.
    this.recordTrail([event.lng, event.lat]);

    if (this.stateSignal() === 'active') {
      this.easeToCenter([event.lng, event.lat]);
    }
  }

  /** Appends a trail point with the 5 m filter and the 2 000-point cap (D1). */
  private recordTrail(point: TrailPoint): void {
    const current = this.trailSignal();
    const last = current[current.length - 1];
    if (last && distanceMeters(last, point) < LOCATION_DEFAULTS.trailMinDistanceM) {
      return;
    }
    const next: TrailPoint[] = [...current, point];
    const capped =
      next.length > LOCATION_DEFAULTS.trailMaxPoints
        ? next.slice(next.length - LOCATION_DEFAULTS.trailMaxPoints)
        : next;
    this.trailSignal.set(capped);
    const engine = this.engine;
    if (engine) this.overlay.updateTrail(engine, capped);
  }

  private easeToCenter(center: [number, number]): void {
    const engine = this.engine;
    if (!engine) return;
    // MapLibre fires the `*start` camera events synchronously inside easeTo;
    // the flag prevents those from being mistaken for user interaction.
    this.easing = true;
    try {
      engine.easeTo(center, { duration: EASE_DURATION_MS });
    } finally {
      this.easing = false;
    }
  }

  private handleUserInteraction(): void {
    if (this.easing) return;
    if (this.stateSignal() !== 'active') return;
    this.stateSignal.set('paused');
  }

  private releaseConsumer(): void {
    if (!this.consumer) return;
    this.location.stop(this.consumer);
    this.consumer = null;
  }
}
