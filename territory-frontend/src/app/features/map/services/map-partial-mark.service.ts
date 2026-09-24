import { Injectable, inject } from '@angular/core';
import type { Layer, Polygon } from 'leaflet';
import { Toast } from '../../../core/services/toast';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { MapStateService } from './map-state.service';
import { MapLayerRegistry } from './map-layer-registry.service';
import { MapLadosService } from './map-lados.service';
import { TOAST_MESSAGES, nextParcialId } from '../utils/map-constants';
import { calcularLados, franjaDeLados, type GeometriaManzana } from '../utils/lados';
import type { ManzanaIndex, ZonaParcial } from '../types/map.types';

/**
 * Marcado parcial por lados: se abre una manzana, se tocan las calles que se
 * predicaron y "Listo" guarda la zona (una franja a lo largo de esos lados).
 * Una manzana con todos sus lados queda marcada completa.
 */
@Injectable({ providedIn: 'root' })
export class MapPartialMarkService {
  private readonly rendering = inject(MapRenderingFacade);
  private readonly selection = inject(MapSelectionService);
  private readonly state = inject(MapStateService);
  private readonly registry = inject(MapLayerRegistry);
  private readonly lados = inject(MapLadosService);
  private readonly toastService = inject(Toast);

  /** Abre una manzana para elegir sus lados; si había otra abierta, la guarda antes. */
  abrirManzana(manzana: ManzanaIndex): void {
    if (this.state.edicionLados()) this.confirmarEdicion(false);

    const geometria = manzana.polygon.toGeoJSON().geometry as GeometriaManzana;
    const lados = calcularLados(geometria);
    if (lados.length === 0) {
      this.toastService.show(TOAST_MESSAGES.sinLados, 3000, 'warning');
      return;
    }

    const zona = this.zonaDeManzana(manzana.id);
    // Mientras se edita, la zona guardada se oculta: la vista previa la reemplaza.
    if (zona) {
      const capa = this.registry.get(zona.id);
      if (capa) this.rendering.removeExtraLayer(capa);
    }

    this.selection.seleccionarManzana(manzana.polygon, manzana.color, manzana.nombreBloque, manzana.territorioNumero);
    this.state.edicionLados.set({
      manzanaId: manzana.id,
      nombre: manzana.nombreBloque,
      territorio: manzana.territorioNumero,
      color: manzana.color,
      geometria,
      lados,
      seleccion: zona ? zona.lados.filter(i => i < lados.length) : [],
      zonaId: zona?.id ?? null,
    });
    this.lados.mostrarEdicion(this.state.edicionLados()!, indice => this.alternarLado(indice));
  }

  alternarLado(indice: number): void {
    const edicion = this.state.edicionLados();
    if (!edicion) return;
    const seleccion = edicion.seleccion.includes(indice)
      ? edicion.seleccion.filter(i => i !== indice)
      : [...edicion.seleccion, indice].sort((a, b) => a - b);
    const actualizada = { ...edicion, seleccion };
    this.state.edicionLados.set(actualizada);
    this.lados.actualizarEdicion(actualizada);
  }

  /**
   * Guarda la manzana abierta: sin lados borra su zona, con todos la marca
   * completa y con algunos guarda la franja de esos lados.
   */
  confirmarEdicion(avisar = true): void {
    const edicion = this.state.edicionLados();
    if (!edicion) return;

    if (edicion.seleccion.length === edicion.lados.length) {
      this.cerrarEdicion();
      this.completarManzana(edicion.manzanaId);
      return;
    }
    if (edicion.seleccion.length === 0) {
      if (edicion.zonaId) this.eliminarZona(edicion.zonaId, false);
      this.cerrarEdicion();
      if (avisar && edicion.zonaId) this.toastService.show(TOAST_MESSAGES.partialDeleted);
      return;
    }

    const geometria = franjaDeLados(edicion.geometria, edicion.seleccion);
    if (!geometria) {
      this.toastService.show(TOAST_MESSAGES.sinLados, 3000, 'warning');
      return;
    }
    this.guardarZona({
      id: edicion.zonaId ?? nextParcialId(),
      territorio: edicion.territorio,
      manzanaId: edicion.manzanaId,
      manzanaNombre: edicion.nombre,
      lados: edicion.seleccion,
      geometria,
    }, edicion.color);
    this.cerrarEdicion();
    if (avisar) {
      this.toastService.show(TOAST_MESSAGES.ladosMarcados(edicion.seleccion.length, edicion.lados.length), 2500, 'success');
    }
  }

  /** Descarta los cambios de la manzana abierta y vuelve a mostrar su zona anterior. */
  cancelarEdicion(): void {
    const edicion = this.state.edicionLados();
    if (!edicion) return;
    if (edicion.zonaId) {
      const capa = this.registry.get(edicion.zonaId);
      if (capa) this.mostrarCapa(capa);
    }
    this.cerrarEdicion();
  }

  /** "Toda la manzana": la marca completa y descarta su zona parcial. */
  marcarManzanaCompleta(): void {
    const edicion = this.state.edicionLados();
    if (!edicion) return;
    this.cerrarEdicion();
    this.completarManzana(edicion.manzanaId);
  }

  /**
   * Al marcar completa una manzana (desde cualquier modo) su zona parcial deja
   * de tener sentido: se quita.
   */
  quitarZonaDeManzana(manzanaId: string): void {
    const zona = this.zonaDeManzana(manzanaId);
    if (zona) this.eliminarZona(zona.id, false);
  }

  eliminarZona(id: string, avisar = true): void {
    const layer = this.registry.get(id);
    if (layer) this.rendering.removeExtraLayer(layer);
    this.registry.unregister(id);

    const marcadas = new Map(this.state.manzanasById());
    marcadas.delete(id);
    this.state.manzanasById.set(marcadas);
    const zonas = new Map(this.state.zonasParciales());
    zonas.delete(id);
    this.state.zonasParciales.set(zonas);
    if (avisar) this.toastService.show(TOAST_MESSAGES.partialDeleted);
  }

  private guardarZona(zona: ZonaParcial, color: string): void {
    const anterior = this.registry.get(zona.id);
    if (anterior) this.rendering.removeExtraLayer(anterior);

    const capa: Polygon = this.lados.crearCapaZona(zona.geometria, color);
    this.registry.register(zona.id, capa);
    this.mostrarCapa(capa);

    const marcadas = new Map(this.state.manzanasById());
    marcadas.set(zona.id, {
      id: zona.id,
      nombreBloque: `Parcial: ${zona.manzanaNombre}`,
      color,
      territorioNumero: zona.territorio,
    });
    this.state.manzanasById.set(marcadas);
    this.state.zonasParciales.set(new Map(this.state.zonasParciales()).set(zona.id, zona));
  }

  private completarManzana(manzanaId: string): void {
    this.quitarZonaDeManzana(manzanaId);
    if (this.state.manzanasById().has(manzanaId)) return;
    const manzana = this.rendering.getManzanaIndex().find(m => m.id === manzanaId);
    if (!manzana) return;
    this.selection.toggleManzana(manzana.id, manzana.nombreBloque, manzana.polygon, manzana.color, manzana.territorioNumero);
    this.toastService.show(TOAST_MESSAGES.manzanaCompleta(manzana.nombreBloque), 2500, 'success');
  }

  /** Las capas extra se registran en el facade pero hay que agregarlas al mapa aparte. */
  private mostrarCapa(capa: Layer): void {
    const map = this.rendering.getMap();
    if (map) capa.addTo(map);
    this.rendering.addExtraLayer(capa);
  }

  private cerrarEdicion(): void {
    this.lados.limpiarEdicion();
    this.state.edicionLados.set(null);
    this.selection.restaurarManzanaAnterior();
  }

  private zonaDeManzana(manzanaId: string): ZonaParcial | undefined {
    return [...this.state.zonasParciales().values()].find(z => z.manzanaId === manzanaId);
  }
}
