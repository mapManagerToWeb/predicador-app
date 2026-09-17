import { Injectable } from '@angular/core';
import type { ManzanaMarcada, FeatureLayer } from '../types/map.types';

/**
 * Manages screenshot capture preparation and post-capture restoration.
 *
 * <p>In MapLibre-only mode, capture uses html-to-image or similar
 * approach. This service is retained as a no-op for facade compatibility.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapCaptureService {
  getAllTerritoriesLayer(): FeatureLayer[] {
    return [];
  }

  async prepararCaptura(
    _manzanasMarcadas: ManzanaMarcada[],
    _territoriosSeleccionados: number[],
  ): Promise<void> {
    // No-op
  }

  prepararCapturaSoloIncompletos(
    _manzanasMarcadas: ManzanaMarcada[],
    _territoriosSeleccionados: number[],
    _allTerritoriesLayer: FeatureLayer[],
    _getManzanaCountByTerritorio: (num: number) => number,
  ): Promise<void> {
    return Promise.resolve();
  }

  restaurarMapaPostCaptura(
    _manzanasMarcadas: ManzanaMarcada[],
    _territoriosSeleccionados: number[],
    _modoMarcado: string,
  ): void {
    // No-op
  }
}
