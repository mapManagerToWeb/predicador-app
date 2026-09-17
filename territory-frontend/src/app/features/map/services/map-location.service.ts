import { Injectable, inject, signal } from '@angular/core';
import { MapRenderingFacade } from './map-rendering.facade';
import { Toast } from '../../../core/services/toast';
import { LOCATION_DEFAULTS, TOAST_MESSAGES } from '../utils/map-constants';

export type LocationStatus = 'idle' | 'locating' | 'following';

/**
 * Ubicación del usuario sobre el mapa.
 *
 * <p>In MapLibre-only mode, the location marker is not rendered via Leaflet
 * layers. The geolocation watch is retained for status tracking, but
 * visual rendering is deferred to a MapLibre implementation.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapLocationService {
  private readonly rendering = inject(MapRenderingFacade);
  private readonly toastService = inject(Toast);

  readonly status = signal<LocationStatus>('idle');

  private watchId: number | null = null;
  private warnedLowAccuracy = false;

  /** Alterna seguimiento. Ignora taps mientras localiza el primer fix. */
  toggle(): void {
    if (this.status() === 'locating') return;
    if (this.status() === 'following') {
      this.stop();
      return;
    }
    this.start();
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.status.set('idle');
  }

  destroy(): void {
    this.stop();
  }

  private start(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !window.isSecureContext) {
      this.toastService.show(TOAST_MESSAGES.locationUnsupported);
      return;
    }

    this.status.set('locating');
    this.watchId = navigator.geolocation.watchPosition(
      pos => this.onPosition(pos),
      err => this.onError(err),
      {
        enableHighAccuracy: LOCATION_DEFAULTS.enableHighAccuracy,
        timeout: LOCATION_DEFAULTS.timeoutMs,
        maximumAge: LOCATION_DEFAULTS.maximumAgeMs,
      }
    );
  }

  private onPosition(pos: GeolocationPosition): void {
    if (
      !this.warnedLowAccuracy &&
      pos.coords.accuracy > LOCATION_DEFAULTS.lowAccuracyMeters
    ) {
      this.warnedLowAccuracy = true;
      this.toastService.show(TOAST_MESSAGES.locationLowAccuracy);
    }

    this.status.set('following');
  }

  private onError(err: GeolocationPositionError): void {
    this.stop();
    switch (err.code) {
      case err.PERMISSION_DENIED:
        this.toastService.show(TOAST_MESSAGES.locationDenied);
        break;
      case err.POSITION_UNAVAILABLE:
      case err.TIMEOUT:
        this.toastService.show(TOAST_MESSAGES.locationUnavailable);
        break;
    }
  }
}
