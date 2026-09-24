import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Map as LeafletMap, Marker, Polygon, Polyline } from 'leaflet';
import { MapLadosService } from './map-lados.service';
import { MapEngineService } from './map-engine.service';
import { calcularLados } from '../utils/lados';
import type { EdicionLados } from '../types/map.types';
import type { Polygon as GeoPolygon } from 'geojson';

const cuadra: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-73.3, -37.5], [-73.299, -37.5], [-73.299, -37.4995], [-73.3, -37.4995], [-73.3, -37.5]]],
};

function edicion(seleccion: number[]): EdicionLados {
  return {
    manzanaId: 'm1',
    nombre: '5.a',
    territorio: 5,
    color: '#22c55e',
    geometria: cuadra,
    lados: calcularLados(cuadra),
    seleccion,
    zonaId: null,
  };
}

describe('MapLadosService', () => {
  let service: MapLadosService;
  let map: LeafletMap;

  beforeEach(() => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientWidth', { value: 400 });
    Object.defineProperty(el, 'clientHeight', { value: 800 });
    document.body.appendChild(el);
    map = new LeafletMap(el, { center: [-37.5, -73.3], zoom: 17 });
    TestBed.configureTestingModule({
      providers: [MapLadosService, { provide: MapEngineService, useValue: { getMap: () => map } }],
    });
    service = TestBed.inject(MapLadosService);
  });

  const capas = <T>(tipo: new (...args: never[]) => T): T[] => {
    const lista: T[] = [];
    map.eachLayer(l => {
      if (l instanceof tipo) lista.push(l as T);
    });
    return lista;
  };

  it('dibuja cada lado con su insignia y avisa el lado tocado', () => {
    const alTocar = vi.fn();
    service.mostrarEdicion(edicion([]), alTocar);

    const insignias = capas(Marker);
    expect(insignias).toHaveLength(4);
    // Borde, línea y zona de toque por lado; sin lados elegidos no hay vista previa.
    expect(capas(Polyline).filter(l => !(l instanceof Polygon))).toHaveLength(12);
    expect(capas(Polygon)).toHaveLength(0);

    insignias[2].fire('click');
    expect(alTocar).toHaveBeenCalledWith(2);
  });

  it('muestra la vista previa de la franja y la insignia marcada', () => {
    service.mostrarEdicion(edicion([]), vi.fn());
    service.actualizarEdicion(edicion([1]));

    expect(capas(Polygon)).toHaveLength(1);
    const marcadas = capas(Marker).filter(m => (m.options.icon?.options.className ?? '').includes('marcado'));
    expect(marcadas).toHaveLength(1);
  });

  it('limpiar quita todo lo dibujado y deja de avisar', () => {
    const alTocar = vi.fn();
    service.mostrarEdicion(edicion([0]), alTocar);
    const insignia = capas(Marker)[0];

    service.limpiarEdicion();

    expect(capas(Marker)).toHaveLength(0);
    expect(capas(Polyline)).toHaveLength(0);
    insignia.fire('click');
    expect(alTocar).not.toHaveBeenCalled();
  });

  it('la capa de una zona guardada no es interactiva', () => {
    const capa = service.crearCapaZona(cuadra, '#ff0000');
    expect(capa.options.interactive).toBe(false);
    expect(capa.options.color).toBe('#ff0000');
  });
});
