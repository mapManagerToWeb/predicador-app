import { Injectable } from '@angular/core';
import type { ProjectionMap } from '../map-geometry';
import type { SnappedPoint, Edge } from '../map-geometry';

/**
 * Manages partial polygon drawing.
 *
 * <p>In MapLibre-only mode, partial draw uses the edit overlay
 * (MapEditOverlayService). This service is retained as a no-op for
 * facade compatibility.</p>
 */
@Injectable({ providedIn: 'root' })
export class MapPartialDrawService {
  setProjectionAdapter(_adapter: ProjectionMap): void {
    // No-op
  }

  clearProjectionAdapter(): void {
    // No-op
  }

  getPoligonoParcial(): unknown | null {
    return null;
  }

  clearPoligonoParcialRef(): void {
    // No-op
  }

  limpiarCapasParciales(): void {
    // No-op
  }

  redibujarParcial(
    _puntos: SnappedPoint[],
    _currentTerritoryColor: string,
    _manzanaEdges: Edge[],
    _onMarkerDrag: (index: number, marker: unknown) => void
  ): void {
    // No-op
  }

  actualizarParcialEnDrag(
    _puntos: SnappedPoint[],
    _currentTerritoryColor: string,
    _manzanaEdges: Edge[],
    _index: number,
    _marker: unknown
  ): void {
    // No-op
  }

  updatePartialPolygonLatLngs(_latlngs: unknown[], _currentTerritoryColor: string): void {
    // No-op
  }

  destroy(): void {
    // No-op
  }
}
