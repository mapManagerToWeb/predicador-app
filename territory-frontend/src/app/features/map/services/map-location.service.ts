import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject, type Observable } from 'rxjs';

import { Toast } from '../../../core/services/toast';
import { LOCATION_DEFAULTS, TOAST_MESSAGES } from '../utils/map-constants';

/** Consumer token returned by {@link MapLocationService.start}. Opaque on purpose. */
export type LocationConsumer = object;

export type LocationErrorCode = 'denied' | 'unavailable' | 'timeout';

/**
 * Stream events emitted to follow-mode consumers. Error codes are already
 * normalized to the spec vocabulary ('denied' | 'unavailable' | 'timeout').
 */
export type LocationEvent =
  | { kind: 'position'; lat: number; lng: number; accuracy: number; timestamp: number }
  | { kind: 'error'; code: LocationErrorCode };

export type LocationStatus = 'idle' | 'locating' | 'following' | 'error';

/**
 * Geolocation watch lifecycle owner. A single shared `watchPosition` is
 * ref-counted across consumers (GPS follow mode, plus the `toggle()` token
 * retained for programmatic use) so at most one OS watch ever runs.
 *
 * It must be provided at root (it is injected by `MapRenderFacade`, which is
 * `providedIn: 'root'`): the OS watch must survive navigation away from the
 * map and still be usable on map re-entry.
 */
@Injectable({ providedIn: 'root' })
export class MapLocationService {
  private readonly toast = inject(Toast);

  private watchId = signal<number | null>(null);
  private warnLowAccuracy = false;
  /** Active consumers sharing the single OS watch (see start/stop/stopAll). */
  private readonly consumers = new Set<LocationConsumer>();
  /** Token used by the standalone `toggle()` consumer (no UI bound to it). */
  private buttonConsumer: LocationConsumer | null = null;

  private readonly positionSubject = new Subject<LocationEvent>();

  private readonly statusSignal = signal<LocationStatus>('idle');
  private readonly latSignal = signal<number | null>(null);
  private readonly lngSignal = signal<number | null>(null);
  private readonly accuracySignal = signal<number | null>(null);
  private readonly timestampSignal = signal<number | null>(null);

  readonly status = this.statusSignal.asReadonly();
  readonly lat = this.latSignal.asReadonly();
  readonly lng = this.lngSignal.asReadonly();
  readonly accuracy = this.accuracySignal.asReadonly();
  readonly timestamp = this.timestampSignal.asReadonly();

  /** True while an OS watch is registered. */
  readonly watching = computed(() => this.watchId() !== null);

  /**
   * Normalized position/error stream shared by all consumers. Deliberately not
   * completed by `destroy()`: the service is root-provided and reused across
   * route entries, so a completed Subject would break later subscriptions.
   */
  readonly events$: Observable<LocationEvent> = this.positionSubject.asObservable();

  /**
   * Toggles this service's standalone watch token: acquires (joins the shared
   * watch) or releases it. No UI is bound to it — the map page's only geolocation
   * control is the GPS follow button (`MapGpsFollowService`). Ignores calls while
   * a watch is still starting up (spec contract: no duplicate watches).
   */
  toggle(): void {
    if (this.status() === 'locating') return;
    if (this.buttonConsumer) {
      this.stop(this.buttonConsumer);
      this.buttonConsumer = null;
      return;
    }
    this.buttonConsumer = this.start() ?? null;
  }

  /**
   * Acquires a consumer slot on the shared OS watch (starts it on first
   * consumer). Returns an opaque token to release later via {@link stop}, or
   * `null` when geolocation is unavailable (unsupported or insecure context).
   */
  start(): LocationConsumer | null {
    if (
      typeof navigator === 'undefined' ||
      !navigator.geolocation ||
      !window.isSecureContext
    ) {
      this.toast.show(TOAST_MESSAGES.locationUnsupported);
      return null;
    }
    const consumer: LocationConsumer = {};
    this.consumers.add(consumer);
    if (this.watchId() === null) this.openWatch();
    return consumer;
  }

  /**
   * Releases one consumer token. Unknown/stale tokens are a no-op; the last
   * release closes the OS watch and returns the status to `idle`. The caller
   * is responsible for clearing any rendered position (the service keeps its
   * signals for the legacy status UI).
   */
  stop(consumer: LocationConsumer): void {
    if (!this.consumers.delete(consumer)) return;
    if (this.consumers.size === 0) this.closeWatch();
  }

  /**
   * Releases every consumer (including the toggle-button token) and closes the
   * OS watch. Used on fatal geolocation errors and service destroy.
   */
  stopAll(): void {
    this.consumers.clear();
    this.buttonConsumer = null;
    this.closeWatch();
  }

  destroy(): void {
    this.stopAll();
  }

  private openWatch(): void {
    this.statusSignal.set('locating');
    const id = navigator.geolocation.watchPosition(
      (position) => this.handleSuccess(position),
      (error) => this.handleError(error),
      {
        enableHighAccuracy: LOCATION_DEFAULTS.enableHighAccuracy,
        timeout: LOCATION_DEFAULTS.timeoutMs,
        maximumAge: LOCATION_DEFAULTS.maximumAgeMs,
      },
    );
    this.watchId.set(id);
  }

  private closeWatch(): void {
    const id = this.watchId();
    if (id !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(id);
    }
    this.watchId.set(null);
    this.statusSignal.set('idle');
  }

  private handleSuccess(position: GeolocationPosition): void {
    if (this.consumers.size === 0) return; // late fix after last release: ignore
    const { latitude, longitude, accuracy } = position.coords;
    this.latSignal.set(latitude);
    this.lngSignal.set(longitude);
    this.accuracySignal.set(accuracy);
    this.timestampSignal.set(position.timestamp);
    if (this.statusSignal() !== 'following') this.statusSignal.set('following');
    if (
      accuracy > LOCATION_DEFAULTS.lowAccuracyMeters &&
      !this.warnLowAccuracy
    ) {
      this.warnLowAccuracy = true;
      this.toast.show(TOAST_MESSAGES.locationLowAccuracy);
    }
    this.positionSubject.next({
      kind: 'position',
      lat: latitude,
      lng: longitude,
      accuracy,
      timestamp: position.timestamp,
    });
  }

  private handleError(error: GeolocationPositionError): void {
    if (this.consumers.size === 0) return; // late error after last release: ignore
    let code: LocationErrorCode = 'unavailable';
    switch (error.code) {
      case 1:
        code = 'denied';
        this.toast.show(TOAST_MESSAGES.locationDenied);
        break;
      case 2:
        code = 'unavailable';
        this.toast.show(TOAST_MESSAGES.locationUnavailable);
        break;
      case 3:
        code = 'timeout';
        this.toast.show(TOAST_MESSAGES.locationUnavailable);
        break;
      default:
        break; // unknown codes surface as 'unavailable' without a toast (legacy behavior)
    }
    // Any geolocation error tears down the watch for every consumer; a retry
    // re-acquires a fresh one.
    this.stopAll();
    this.positionSubject.next({ kind: 'error', code });
  }
}
