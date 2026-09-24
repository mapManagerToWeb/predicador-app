import { Injectable, inject } from '@angular/core';
import { DivIcon, LatLng, Marker, Polygon, Polyline, type Layer } from 'leaflet';
import type { Position } from 'geojson';
import { MapEngineService } from './map-engine.service';
import { getPartialPolygonCompleteStyle } from './map-style.service';
import { franjaDeLados, type GeometriaManzana } from '../utils/lados';
import type { EdicionLados } from '../types/map.types';

/** Ancho en px de la zona tocable de cada lado (mucho más que la línea visible). */
const ANCHO_TOQUE_PX = 34;

const aLatLng = (p: Position) => new LatLng(p[1], p[0]);

/** Coordenadas GeoJSON (Polygon o MultiPolygon) al formato anidado de Leaflet. */
function aLatLngs(g: GeometriaManzana): LatLng[][] | LatLng[][][] {
  return g.type === 'Polygon'
    ? g.coordinates.map(anillo => anillo.map(aLatLng))
    : g.coordinates.map(poligono => poligono.map(anillo => anillo.map(aLatLng)));
}

/**
 * Dibujo del marcado por lados en Leaflet: los lados de la manzana abierta
 * como tramos tocables (con una insignia numerada en el medio, que es el
 * blanco de toque más cómodo en el celular) y la vista previa de la franja.
 * La geometría la calcula `utils/lados.ts`; acá solo se pinta.
 */
@Injectable({ providedIn: 'root' })
export class MapLadosService {
  private readonly engine = inject(MapEngineService);
  private capas: Layer[] = [];
  private vistaPrevia: Polygon | null = null;
  private alTocar: ((indice: number) => void) | null = null;

  mostrarEdicion(edicion: EdicionLados, alTocar: (indice: number) => void): void {
    this.limpiarEdicion();
    const map = this.engine.getMap();
    if (!map) return;
    this.alTocar = alTocar;

    // Arriba está el buscador y abajo el panel de marcado (casi media pantalla
    // en un celular): la manzana se encuadra en el espacio que queda libre.
    const alto = map.getSize().y;
    const bounds = new Polygon(aLatLngs(edicion.geometria)).getBounds();
    map.fitBounds(bounds, {
      maxZoom: 19,
      paddingTopLeft: [40, Math.min(110, alto * 0.15)],
      paddingBottomRight: [40, Math.min(380, alto * 0.48)],
    });
    this.dibujar(edicion);
  }

  /** Repinta tras marcar o desmarcar un lado. */
  actualizarEdicion(edicion: EdicionLados): void {
    const alTocar = this.alTocar;
    this.quitarCapas();
    this.alTocar = alTocar;
    this.dibujar(edicion);
  }

  limpiarEdicion(): void {
    this.quitarCapas();
    this.alTocar = null;
  }

  /** Capa de una zona ya marcada (no interactiva: los toques los resuelve el mapa). */
  crearCapaZona(geometria: GeometriaManzana, color: string): Polygon {
    return new Polygon(aLatLngs(geometria), { ...getPartialPolygonCompleteStyle(color), interactive: false });
  }

  private dibujar(edicion: EdicionLados): void {
    const map = this.engine.getMap();
    if (!map) return;
    const seleccion = new Set(edicion.seleccion);

    const franja = franjaDeLados(edicion.geometria, edicion.seleccion);
    if (franja) {
      this.vistaPrevia = new Polygon(aLatLngs(franja), {
        ...getPartialPolygonCompleteStyle(edicion.color),
        interactive: false,
      }).addTo(map);
    }

    for (const lado of edicion.lados) {
      const marcado = seleccion.has(lado.indice);
      const latlngs = lado.puntos.map(aLatLng);
      const tocar = () => this.alTocar?.(lado.indice);

      // Borde oscuro + línea: se ve sobre el mapa claro, el oscuro y el satelital.
      this.agregar(new Polyline(latlngs, { color: '#111827', weight: marcado ? 11 : 9, opacity: 0.75, interactive: false }));
      this.agregar(
        new Polyline(latlngs, {
          color: marcado ? edicion.color : '#ffffff',
          weight: marcado ? 7 : 5,
          opacity: 1,
          dashArray: marcado ? undefined : '8 6',
          interactive: false,
        }),
      );
      const toque = new Polyline(latlngs, {
        weight: ANCHO_TOQUE_PX,
        opacity: 0,
        bubblingMouseEvents: false,
      });
      toque.on('click', tocar);
      this.agregar(toque);

      const insignia = new Marker(this.puntoMedio(lado.puntos), {
        icon: new DivIcon({
          className: `lado-badge${marcado ? ' marcado' : ''}`,
          html: marcado ? '✓' : String(lado.indice + 1),
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        keyboard: false,
        bubblingMouseEvents: false,
      });
      insignia.on('click', tocar);
      this.agregar(insignia);
    }
  }

  /** Punto a mitad de camino (por largo) del lado. */
  private puntoMedio(puntos: Position[]): LatLng {
    const latlngs = puntos.map(aLatLng);
    const tramos = latlngs.slice(1).map((p, i) => latlngs[i].distanceTo(p));
    let resto = tramos.reduce((a, b) => a + b, 0) / 2;
    for (let i = 0; i < tramos.length; i++) {
      if (resto <= tramos[i] && tramos[i] > 0) {
        const t = resto / tramos[i];
        return new LatLng(
          latlngs[i].lat + (latlngs[i + 1].lat - latlngs[i].lat) * t,
          latlngs[i].lng + (latlngs[i + 1].lng - latlngs[i].lng) * t,
        );
      }
      resto -= tramos[i];
    }
    return latlngs[0];
  }

  private agregar(capa: Layer): void {
    const map = this.engine.getMap();
    if (!map) return;
    capa.addTo(map);
    this.capas.push(capa);
  }

  private quitarCapas(): void {
    const map = this.engine.getMap();
    for (const capa of this.capas) map?.removeLayer(capa);
    if (this.vistaPrevia) map?.removeLayer(this.vistaPrevia);
    this.capas = [];
    this.vistaPrevia = null;
  }
}
