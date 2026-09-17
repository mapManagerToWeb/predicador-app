import { Injectable, inject } from '@angular/core';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { Toast } from '../../../core/services/toast';
import type { ManzanaIndex } from '../types/map.types';

export interface MapClickResult {
  action: 'none';
  manzana?: ManzanaIndex;
  partialId?: string;
  snappedPoint?: unknown;
}

/**
 * Handles map click interactions.
 *
 * <p>In MapLibre-only mode, click handling is done directly via GPU picking
 * in MapPage. This service is retained as a no-op for compatibility.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapInteractionService {
  private readonly state = inject(MapStateService);
  private readonly rendering = inject(MapRenderingFacade);
  private readonly toastService = inject(Toast);

  handleMapClick(_e: unknown): MapClickResult {
    // No-op: MapLibre uses GPU picking in MapPage
    return { action: 'none' };
  }

  handleMarkerDrag(_marker: unknown, _index: number): unknown[] {
    return this.state.puntosParciales();
  }
}
