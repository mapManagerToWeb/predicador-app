import { Injectable, inject } from '@angular/core';
import { Toast } from '../../../core/services/toast';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import type { SnappedPoint } from '../map-geometry';
import { TOAST_MESSAGES, nextParcialId } from '../utils/map-constants';

@Injectable({ providedIn: 'root' })
export class MapPartialMarkService {
  private readonly rendering = inject(MapRenderingFacade);
  private readonly selection = inject(MapSelectionService);
  private readonly state = inject(MapStateService);
  private readonly toastService = inject(Toast);

  agregarPunto(punto: SnappedPoint): void {
    const actuales = this.state.puntosParciales();
    this.state.puntosParciales.set([...actuales, punto]);
  }

  deshacerPunto(): void {
    const actuales = this.state.puntosParciales();
    if (actuales.length === 0) return;
    this.state.puntosParciales.set(actuales.slice(0, -1));
  }

  private colorTerritorioActivo(): string {
    const territorioManzana = this.state.manzanaSeleccionadaTerritorio();
    const seleccionados = this.state.territoriosSeleccionados();
    const territorio = territorioManzana ?? seleccionados[seleccionados.length - 1];
    if (territorio !== undefined && territorio !== null) {
      const fl = this.rendering.getAllTerritoriesLayer().find(f => f.territorioPadre === territorio);
      if (fl?.color) return fl.color;
    }
    return this.rendering.getCurrentTerritoryColor() || '#22c55e';
  }

  private territorioActivo(): number | null {
    const territorioManzana = this.state.manzanaSeleccionadaTerritorio();
    if (territorioManzana !== null) return territorioManzana;
    const seleccionados = this.state.territoriosSeleccionados();
    return seleccionados.length > 0 ? seleccionados[seleccionados.length - 1] : null;
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

    const id = nextParcialId();
    const nombreBloque = this.state.manzanaSeleccionadaNombre()
      ? `Parcial: ${this.state.manzanaSeleccionadaNombre()}`
      : 'Zona parcial';

    const color = this.colorTerritorioActivo();

    // Store partial geometry for save
    this.state.setDatosParciales(territorio, {
      puntos: [...this.state.puntosParciales()],
      geometria: JSON.stringify({ type: 'Point', coordinates: [] }),
    });

    const newMap = new Map(this.state.manzanasById());
    newMap.set(id, { id, nombreBloque, color, territorioNumero: territorio });
    this.state.manzanasById.set(newMap);

    this.state.puntosParciales.set([]);
    this.selection.restaurarManzanaAnterior();
    this.state.modoMarcado.set('none');
    this.rendering.refreshMarksVisual();
    this.toastService.show(TOAST_MESSAGES.partialMarked);
  }

  cancelarParcial(): void {
    this.selection.limpiarParcial();
    this.selection.restaurarManzanaAnterior();
    this.state.modoMarcado.set('none');
  }

  eliminarParcial(id: string): void {
    const current = this.state.manzanasById();
    const removed = current.get(id);
    if (!removed) return;

    const newMap = new Map(current);
    newMap.delete(id);
    this.state.manzanasById.set(newMap);
    this.state.clearDatosParciales(removed.territorioNumero);
    this.rendering.refreshMarksVisual();
    this.toastService.show(TOAST_MESSAGES.partialDeleted);
  }
}
