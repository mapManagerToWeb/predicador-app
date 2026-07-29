import { Injectable, inject } from '@angular/core';
import * as L from 'leaflet';
import { Toast } from '../../../core/services/toast';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapInteractionService } from './map-interaction.service';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { DEDUP_THRESHOLD_PX, latLngDist } from '../map-geometry';
import type { SnappedPoint } from '../map-geometry';
import { TOAST_MESSAGES, STYLE_DEFAULTS } from '../utils/map-constants';

@Injectable({ providedIn: 'root' })
export class MapPartialMarkService {
  private rendering = inject(MapRenderingFacade);
  private interaction = inject(MapInteractionService);
  private selection = inject(MapSelectionService);
  private state = inject(MapStateService);
  private toastService = inject(Toast);

  agregarPunto(punto: SnappedPoint): void {
    const actuales = this.state.puntosParciales();
    const map = this.rendering.getMap();
    if (!map) return;

    if (actuales.length > 0) {
      const last = actuales[actuales.length - 1];
      if (latLngDist(last.latlng, punto.latlng, map) < DEDUP_THRESHOLD_PX) return;
    }

    this.state.puntosParciales.set([...actuales, punto]);
    this.redibujarParcial();
  }

  deshacerPunto(): void {
    const actuales = this.state.puntosParciales();
    if (actuales.length === 0) return;

    this.state.puntosParciales.set(actuales.slice(0, -1));
    this.redibujarParcial();
  }

  /**
   * Devuelve el color del territorio actualmente en foco para marcado parcial.
   * Prioridad:
   *   1. Territorio de la manzana seleccionada (contexto exacto donde se está marcando).
   *   2. Último territorio agregado a la lista de seleccionados.
   *   3. Signal global (fallback).
   */
  private colorTerritorioActivo(): string {
    const territorioManzana = this.state.manzanaSeleccionadaTerritorio;
    const seleccionados = this.state.territoriosSeleccionados();
    const territorio = territorioManzana ?? seleccionados[seleccionados.length - 1];
    if (territorio !== undefined && territorio !== null) {
      const fl = this.rendering.getAllTerritoriesLayer().find(f => f.territorioPadre === territorio);
      if (fl?.color) return fl.color;
    }
    return this.rendering.getCurrentTerritoryColor() || '#22c55e';
  }

  private territorioActivo(): number | null {
    const territorioManzana = this.state.manzanaSeleccionadaTerritorio;
    if (territorioManzana !== null) return territorioManzana;
    const seleccionados = this.state.territoriosSeleccionados();
    return seleccionados.length > 0 ? seleccionados[seleccionados.length - 1] : null;
  }

  private redibujarParcial(): void {
    this.rendering.redibujarParcial(
      this.state.puntosParciales(),
      this.colorTerritorioActivo(),
      this.state.manzanaEdges,
      (index, marker) => {
        const actualizados = this.interaction.handleMarkerDrag(marker, index);
        this.state.puntosParciales.set(actualizados);
        this.redibujarParcial();
      }
    );
  }

  finalizarParcial(): void {
    if (this.state.puntosCount() < 2) {
      this.toastService.show(TOAST_MESSAGES.minPoints);
      return;
    }

    const territorio = this.territorioActivo();
    if (territorio === null) {
      this.toastService.show(TOAST_MESSAGES.noTerritories);
      return;
    }

    const id = `parcial-${Date.now()}`;
    const nombreBloque = this.state.manzanaSeleccionadaNombre
      ? `Parcial: ${this.state.manzanaSeleccionadaNombre}`
      : 'Zona parcial';

    const poligonoParcial = this.rendering.getPoligonoParcial();
    if (poligonoParcial) {
      const geoJson = poligonoParcial.toGeoJSON();
      this.state.setDatosParciales(territorio, {
        puntos: [...this.state.puntosParciales()],
        geometria: JSON.stringify(geoJson.geometry),
      });

      // Aplicar estilo sólido (relleno completo, sin dashArray) al finalizar.
      // Usa el color del territorio activo, no el signal global.
      const color = this.colorTerritorioActivo();
      poligonoParcial.setStyle({
        color,
        fillColor: color,
        fillOpacity: STYLE_DEFAULTS.partialPolygonComplete.fillOpacity,
        weight: STYLE_DEFAULTS.partialPolygonComplete.weight,
        dashArray: undefined,
      });

      this.state.manzanasMarcadas.update(current => [
        ...current,
        { id, nombreBloque, layer: poligonoParcial as unknown as L.Path, territorioNumero: territorio },
      ]);
      this.rendering.addExtraLayer(poligonoParcial);

      poligonoParcial.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stop(e);
        this.eliminarParcial(id);
      });

      this.rendering.clearPoligonoParcialRef();
    }

    this.rendering.limpiarCapasParciales();
    this.state.puntosParciales.set([]);
    this.selection.restaurarManzanaAnterior();
    this.state.modoMarcado.set('none');
    this.rendering.restaurarVisibilidadPoligonos(this.state.manzanasMarcadas(), this.state.territoriosSeleccionados());
    this.toastService.show(TOAST_MESSAGES.partialMarked);
  }

  cancelarParcial(): void {
    this.selection.limpiarParcial();
    // Cancelar sólo limpia lo dibujado en curso (no persistido). Los parciales ya
    // finalizados de otros territorios permanecen en el Map.
    this.selection.restaurarManzanaAnterior();
    this.state.modoMarcado.set('none');
  }

  eliminarParcial(id: string): void {
    const current = [...this.state.manzanasMarcadas()];
    const idx = current.findIndex(m => m.id === id);
    if (idx < 0) return;

    const marcada = current[idx];
    this.rendering.removeExtraLayer(marcada.layer);
    current.splice(idx, 1);
    this.state.manzanasMarcadas.set(current);
    // Limpiar sólo los datos parciales del territorio afectado.
    this.state.clearDatosParciales(marcada.territorioNumero);
    this.toastService.show(TOAST_MESSAGES.partialDeleted);
  }
}
