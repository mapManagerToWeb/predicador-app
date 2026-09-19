import { Injectable, inject } from '@angular/core';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapMarkRestorationService } from './map-mark-restoration.service';
import { Toast } from '../../../core/services/toast';
import { DraftMarksService } from './map-draft';
import { TOAST_MESSAGES } from '../utils/map-constants';
import { getTerritoryProgress } from '../utils/territory-progress';
import type { ModoMarcado } from '../types/map.types';
import type { Reporte } from '../../../core/models/models';

@Injectable({ providedIn: 'root' })
export class MapSelectionService {
  private readonly state = inject(MapStateService);
  private readonly rendering = inject(MapRenderingFacade);
  private readonly restoration = inject(MapMarkRestorationService);
  private readonly toastService = inject(Toast);
  private readonly draftService = inject(DraftMarksService);

  seleccionarManzana(_polygon: unknown, color: string, nombreBloque: string, territorioNumero: number): void {
    this.restaurarManzanaAnterior();

    this.state.manzanaSeleccionadaColor.set(color);
    this.state.manzanaSeleccionadaNombre.set(nombreBloque);
    this.state.manzanaSeleccionadaTerritorio.set(territorioNumero);
    this.state.manzanaEdges.set([]);

    if (!this.state.territoriosSeleccionados().includes(territorioNumero)) {
      this.state.territoriosSeleccionados.update(nums => [...nums, territorioNumero]);
      this.state.territorioSeleccionado.set(
        this.state.territoriosSeleccionados().length === 1 ? territorioNumero : null
      );
      this.updateTotalManzanas(this.state.territoriosSeleccionados());
    }

    this.rendering.setCurrentTerritoryColor(color);
  }

  selectManzanaById(
    manzanaId: string,
    nombreBloque: string,
    color: string,
    territorioNumero: number,
  ): void {
    this.restaurarManzanaAnterior();

    this.state.manzanaSeleccionadaColor.set(color);
    this.state.manzanaSeleccionadaNombre.set(nombreBloque);
    this.state.manzanaSeleccionadaTerritorio.set(territorioNumero);
    this.state.manzanaEdges.set([]);

    if (!this.state.territoriosSeleccionados().includes(territorioNumero)) {
      this.state.territoriosSeleccionados.update(nums => [...nums, territorioNumero]);
      this.state.territorioSeleccionado.set(
        this.state.territoriosSeleccionados().length === 1 ? territorioNumero : null
      );
      this.updateTotalManzanas(this.state.territoriosSeleccionados());
    }

    // Leaflet parity: the tapped manzana stays highlighted in yellow
    // (`STYLE_DEFAULTS.selectedManzana`) while it anchors a partial draw.
    this.rendering.setSelectedManzana(manzanaId, nombreBloque, territorioNumero);
    this.rendering.setCurrentTerritoryColor(color);
  }

  restaurarManzanaAnterior(): void {
    this.state.manzanaSeleccionadaNombre.set('');
    this.state.manzanaSeleccionadaTerritorio.set(null);
    this.state.manzanaEdges.set([]);
    this.rendering.clearSelectedManzana();
  }

  toggleManzanaById(id: string, nombreBloque: string, color: string, territorioNumero: number): void {
    if (this.state.manzanasById().has(id)) {
      this.desmarcarManzanaById(id, territorioNumero, color);
    } else {
      this.marcarManzanaById(id, nombreBloque, color, territorioNumero);
    }
  }

  toggleManzana(id: string, nombreBloque: string, _layer: unknown, color: string, territorioNumero: number): void {
    if (this.state.manzanasById().has(id)) {
      this.desmarcarManzanaById(id, territorioNumero, color);
    } else {
      this.marcarManzanaById(id, nombreBloque, color, territorioNumero);
    }
  }

  private desmarcarManzanaById(id: string, territorioNumero: number, _color: string): void {
    const newMap = new Map(this.state.manzanasById());
    newMap.delete(id);
    this.state.manzanasById.set(newMap);
    const marcadas = this.state.manzanasByTerritorio().get(territorioNumero) ?? [];
    const { marcadas: marcadasCount } = getTerritoryProgress(this.rendering.getManzanaCountByTerritorio(territorioNumero), marcadas.length);

    if (marcadasCount === 0) {
      this.state.territoriosSeleccionados.update(nums => nums.filter(n => n !== territorioNumero));
      const seleccionados = this.state.territoriosSeleccionados();
      this.state.territorioSeleccionado.set(seleccionados.length === 1 ? seleccionados[0] : null);
      this.rendering.ocultarPoligonosNoSeleccionados(seleccionados);
    }

    this.updateTotalManzanas(this.state.territoriosSeleccionados());
    this.rendering.refreshMarksVisual();
  }

  marcarManzanaById(
    id: string,
    nombreBloque: string,
    color: string,
    territorioNumero: number,
  ): void {
    const newMap = new Map(this.state.manzanasById());
    newMap.set(id, { id, nombreBloque, color, territorioNumero });
    this.state.manzanasById.set(newMap);

    if (this.state.territoriosSeleccionados().includes(territorioNumero)) {
      this.rendering.refreshMarksVisual();
      return;
    }

    this.state.territoriosSeleccionados.update(nums => [...nums, territorioNumero]);
    const seleccionados = this.state.territoriosSeleccionados();
    this.state.territorioSeleccionado.set(seleccionados.length === 1 ? territorioNumero : null);

    this.rendering.ocultarPoligonosNoSeleccionados(seleccionados);
    this.updateTotalManzanas(this.state.territoriosSeleccionados());
    this.rendering.refreshMarksVisual();
  }

  marcarManzana(
    id: string,
    nombreBloque: string,
    _layer: unknown,
    color: string,
    territorioNumero: number
  ): void {
    const newMap = new Map(this.state.manzanasById());
    newMap.set(id, { id, nombreBloque, color, territorioNumero });
    this.state.manzanasById.set(newMap);

    if (this.state.territoriosSeleccionados().includes(territorioNumero)) {
      this.rendering.refreshMarksVisual();
      return;
    }

    this.state.territoriosSeleccionados.update(nums => [...nums, territorioNumero]);
    const seleccionados = this.state.territoriosSeleccionados();
    this.state.territorioSeleccionado.set(seleccionados.length === 1 ? territorioNumero : null);

    this.rendering.ocultarPoligonosNoSeleccionados(seleccionados);
    this.updateTotalManzanas(this.state.territoriosSeleccionados());
    this.rendering.refreshMarksVisual();
  }

  prepareTerritorioSeleccionado(numeros: number[]): number[] {
    const estabaEnModoMarcado = this.state.modoMarcado() !== 'none';

    this.limpiarParcial();
    this.restaurarManzanaAnterior();

    if (!estabaEnModoMarcado) {
      this.state.modoMarcado.set('none');
      this.state.territoriosSeleccionados.set(numeros);
    } else {
      this.acumularSeleccionTerritorios(numeros);
    }

    this.state.territorioSeleccionado.set(
      this.state.territoriosSeleccionados().length === 1 ? this.state.territoriosSeleccionados()[0] : null
    );

    this.rendering.ocultarPoligonosNoSeleccionados(this.state.territoriosSeleccionados());
    this.rendering.fitBoundsToTerritorios(this.state.territoriosSeleccionados());
    this.updateTotalManzanas(numeros);
    // Re-apply the marked overlay + highlight for the new selection. Without
    // this, the overlay keeps showing the previous selection's marks until
    // the async DB restore finishes — and if the selected territory has no
    // reports, restaurarConReportes early-returns and the overlay would
    // never refresh at all.
    this.rendering.refreshMarksVisual();

    return numeros;
  }

  private acumularSeleccionTerritorios(numeros: number[]): void {
    const existentes = new Set(this.state.territoriosSeleccionados());
    for (const n of numeros) existentes.add(n);
    this.state.territoriosSeleccionados.set(Array.from(existentes));
  }

  private updateTotalManzanas(numsAConsiderar: number[]): void {
    const total = numsAConsiderar.reduce(
      (sum, n) => sum + this.rendering.getManzanaCountByTerritorio(n), 0
    );
    this.state.totalManzanas.set(total);
  }

  async restaurarMarcadoDesdeDB(
    territorioNumero: number,
    colorOverride?: string,
    options: { actualizarEstadoMarcado?: boolean } = {}
  ): Promise<void> {
    await this.restoration.restaurarDesdeDB(territorioNumero, colorOverride, options);
  }

  restaurarMarcadoConReportes(
    territorioNumero: number,
    reportes: Reporte[],
    colorOverride?: string,
    options: { actualizarEstadoMarcado?: boolean } = {}
  ): void {
    this.restoration.restaurarConReportes(territorioNumero, reportes, colorOverride, options);
  }

  setModoMarcado(modo: ModoMarcado): void {
    if (this.state.modoMarcado() !== modo) {
      this.limpiarParcial();
      this.restaurarManzanaAnterior();
    }
    this.state.modoMarcado.set(modo);

    if (modo === 'completa' || modo === 'parcial') {
      this.rendering.ocultarPoligonosNoSeleccionados(this.state.territoriosSeleccionados());
      this.toastService.show(modo === 'parcial' ? TOAST_MESSAGES.partialMode : TOAST_MESSAGES.completeMode);
    } else {
      this.rendering.restaurarVisibilidadPoligonos();
    }
  }

  limpiarMarcas(): void {
    this.state.manzanasById.set(new Map());
    this.state.territorioSeleccionado.set(null);
    this.state.territoriosSeleccionados.set([]);
    this.state.modoMarcado.set('none');
    this.rendering.clearSelectedManzana();
    this.rendering.restaurarVisibilidadPoligonos();
    this.state.totalManzanas.set(0);
    this.rendering.setCurrentTerritoryColor('');
    this.draftService.clear();
    this.rendering.refreshMarksVisual();
  }

  limpiarParcial(): void {
    this.state.puntosParciales.set([]);
  }
}
