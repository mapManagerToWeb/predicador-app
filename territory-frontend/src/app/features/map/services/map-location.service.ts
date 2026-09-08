import { Injectable, inject, signal } from '@angular/core';
import * as L from 'leaflet';
import { MapRenderingFacade } from './map-rendering.facade';
import { Toast } from '../../../core/services/toast';
import { LOCATION_DEFAULTS, TOAST_MESSAGES } from '../utils/map-constants';

export type LocationStatus = 'idle' | 'locating' | 'following';

/**
 * Ubicación del usuario sobre el mapa, estilo "Mi ubicación" de Google Maps.
 *
 * <p>Único punto del código que toca `navigator.geolocation`. Un tap inicia
 * `watchPosition` (el primer fix centra la vista); otro tap detiene el
 * seguimiento y limpia las capas. Las capas viven en un pane propio con
 * `interactive: false` para no robar clicks al marcado de manzanas.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapLocationService {
  private readonly rendering = inject(MapRenderingFacade);
  private readonly toastService = inject(Toast);

  readonly status = signal<LocationStatus>('idle');

  private watchId: number | null = null;
  private layerGroup: L.LayerGroup | null = null;
  private marker: L.CircleMarker | null = null;
  private accuracyCircle: L.Circle | null = null;
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
    this.removeLayers();
    this.status.set('idle');
  }

  destroy(): void {
    this.stop();
  }

  private start(): void {
    // SSR y navegadores sin la API o en contexto inseguro (HTTP): nada que hacer.
    if (typeof navigator === 'undefined' || !navigator.geolocation || !window.isSecureContext) {
      this.toastService.show(TOAST_MESSAGES.locationUnsupported);
      return;
    }

    const map = this.rendering.getMap();
    if (!map) return;

    this.status.set('locating');
    this.watchId = navigator.geolocation.watchPosition(
      pos => this.onPosition(map, pos),
      err => this.onError(err),
      {
        enableHighAccuracy: LOCATION_DEFAULTS.enableHighAccuracy,
        timeout: LOCATION_DEFAULTS.timeoutMs,
        maximumAge: LOCATION_DEFAULTS.maximumAgeMs,
      }
    );
  }

  private onPosition(map: L.Map, pos: GeolocationPosition): void {
    const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
    this.ensureLayers(map);

    this.marker?.setLatLng(latlng);
    this.accuracyCircle?.setLatLng(latlng);
    this.accuracyCircle?.setRadius(pos.coords.accuracy);

    // Recentrar solo si el usuario salió del encuadre; si sigue visible no
    // peleamos con su pan/zoom (comportamiento Google Maps).
    const viewport = map.getBounds().pad(-LOCATION_DEFAULTS.recenterPadFactor);
    if (this.status() !== 'following' || !viewport.contains(latlng)) {
      map.setView(latlng, Math.max(map.getZoom(), MAP_LOCATION_MIN_ZOOM));
    }

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

  private ensureLayers(map: L.Map): void {
    if (this.layerGroup) return;

    // Pane propio por encima de los polígonos; interactive:false para que los
    // clicks lleguen al mapa (marcado de manzanas) aunque el marcador esté encima.
    if (!map.getPane(LOCATION_PANE)) {
      const pane = map.createPane(LOCATION_PANE);
      pane.style.zIndex = '650';
      pane.style.pointerEvents = 'none';
    }

    this.marker = L.circleMarker([0, 0], {
      radius: 8,
      color: '#ffffff',
      weight: 3,
      fillColor: '#1a73e8',
      fillOpacity: 1,
      interactive: false,
      pane: LOCATION_PANE,
    });
    this.accuracyCircle = L.circle([0, 0], {
      radius: 0,
      color: '#1a73e8',
      weight: 1,
      fillColor: '#1a73e8',
      fillOpacity: 0.15,
      interactive: false,
      pane: LOCATION_PANE,
    });
    this.layerGroup = L.layerGroup([this.accuracyCircle, this.marker]).addTo(map);
  }

  private removeLayers(): void {
    this.layerGroup?.remove();
    this.layerGroup = null;
    this.marker = null;
    this.accuracyCircle = null;
    this.warnedLowAccuracy = false;
  }
}

const LOCATION_PANE = 'locationPane';
/** Zoom mínimo al centrar por primera vez: suficiente para orientarse sin saltar. */
const MAP_LOCATION_MIN_ZOOM = 16;
