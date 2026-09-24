import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Polygon } from 'leaflet';
import { MapPartialMarkService } from './map-partial-mark.service';
import { MapStateService } from './map-state.service';
import { MapRenderingFacade } from './map-rendering.facade';
import { MapSelectionService } from './map-selection.service';
import { MapLayerRegistry } from './map-layer-registry.service';
import { MapLadosService } from './map-lados.service';
import { Toast } from '../../../core/services/toast';
import type { ManzanaIndex } from '../types/map.types';

/** Cuadra de ~80 x 60 m (4 lados). */
function manzana(id = 'm1', territorio = 5): ManzanaIndex {
  const lat = -37.5;
  const lng = -73.3;
  const dLat = 60 / 110_540;
  const dLng = 80 / (111_320 * Math.cos((lat * Math.PI) / 180));
  const polygon = new Polygon([
    [
      { lat, lng },
      { lat, lng: lng + dLng },
      { lat: lat + dLat, lng: lng + dLng },
      { lat: lat + dLat, lng },
    ],
  ]);
  return {
    polygon,
    id,
    nombreBloque: `${territorio}.a`,
    color: '#22c55e',
    territorioNumero: territorio,
    bbox: { minLat: lat, maxLat: lat + dLat, minLng: lng, maxLng: lng + dLng },
  };
}

describe('MapPartialMarkService (marcado por lados)', () => {
  let service: MapPartialMarkService;
  let state: MapStateService;
  let registry: MapLayerRegistry;
  let m1: ManzanaIndex;
  let rendering: {
    getMap: ReturnType<typeof vi.fn>;
    addExtraLayer: ReturnType<typeof vi.fn>;
    removeExtraLayer: ReturnType<typeof vi.fn>;
    getManzanaIndex: ReturnType<typeof vi.fn>;
  };
  let selection: {
    seleccionarManzana: ReturnType<typeof vi.fn>;
    restaurarManzanaAnterior: ReturnType<typeof vi.fn>;
    toggleManzana: ReturnType<typeof vi.fn>;
  };
  let lados: {
    mostrarEdicion: ReturnType<typeof vi.fn>;
    actualizarEdicion: ReturnType<typeof vi.fn>;
    limpiarEdicion: ReturnType<typeof vi.fn>;
    crearCapaZona: ReturnType<typeof vi.fn>;
  };
  let toast: { show: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    m1 = manzana();
    rendering = {
      getMap: vi.fn().mockReturnValue(null),
      addExtraLayer: vi.fn(),
      removeExtraLayer: vi.fn(),
      getManzanaIndex: vi.fn(() => [m1]),
    };
    selection = {
      seleccionarManzana: vi.fn(),
      restaurarManzanaAnterior: vi.fn(),
      // Simula marcar completa: agrega la manzana a las marcadas.
      toggleManzana: vi.fn((id: string, nombreBloque: string, _l: unknown, color: string, territorioNumero: number) => {
        state.manzanasById.set(new Map(state.manzanasById()).set(id, { id, nombreBloque, color, territorioNumero }));
      }),
    };
    lados = {
      mostrarEdicion: vi.fn(),
      actualizarEdicion: vi.fn(),
      limpiarEdicion: vi.fn(),
      crearCapaZona: vi.fn(() => ({ addTo: vi.fn() })),
    };
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        MapPartialMarkService,
        MapStateService,
        MapLayerRegistry,
        { provide: MapRenderingFacade, useValue: rendering },
        { provide: MapSelectionService, useValue: selection },
        { provide: MapLadosService, useValue: lados },
        { provide: Toast, useValue: toast },
      ],
    });
    service = TestBed.inject(MapPartialMarkService);
    state = TestBed.inject(MapStateService);
    registry = TestBed.inject(MapLayerRegistry);
  });

  it('abrir una manzana calcula sus lados y los muestra sin ninguno elegido', () => {
    service.abrirManzana(m1);

    const edicion = state.edicionLados();
    expect(edicion?.manzanaId).toBe('m1');
    expect(edicion?.lados).toHaveLength(4);
    expect(edicion?.seleccion).toEqual([]);
    expect(selection.seleccionarManzana).toHaveBeenCalledWith(m1.polygon, '#22c55e', '5.a', 5);
    expect(lados.mostrarEdicion).toHaveBeenCalled();
  });

  it('tocar un lado lo marca y tocarlo otra vez lo desmarca', () => {
    service.abrirManzana(m1);

    service.alternarLado(2);
    service.alternarLado(0);
    expect(state.edicionLados()?.seleccion).toEqual([0, 2]);
    service.alternarLado(2);
    expect(state.edicionLados()?.seleccion).toEqual([0]);
    expect(lados.actualizarEdicion).toHaveBeenCalledTimes(3);
  });

  it('Listo con algunos lados guarda una zona parcial de esa manzana', () => {
    service.abrirManzana(m1);
    service.alternarLado(1);

    service.confirmarEdicion();

    const [zona] = [...state.zonasParciales().values()];
    expect(zona).toMatchObject({ manzanaId: 'm1', manzanaNombre: '5.a', lados: [1], territorio: 5 });
    expect(zona.geometria.type).toBe('Polygon');
    expect(state.manzanasById().get(zona.id)).toMatchObject({ nombreBloque: 'Parcial: 5.a', territorioNumero: 5 });
    expect(registry.get(zona.id)).toBeTruthy();
    expect(state.edicionLados()).toBeNull();
    expect(toast.show).toHaveBeenCalledWith('Guardado: 1 de 4 lados', 2500, 'success');
  });

  it('volver a abrir la manzana recupera sus lados y guardar edita la misma zona', () => {
    service.abrirManzana(m1);
    service.alternarLado(1);
    service.confirmarEdicion();
    const [idOriginal] = [...state.zonasParciales().keys()];

    service.abrirManzana(m1);
    expect(state.edicionLados()?.seleccion).toEqual([1]);
    expect(rendering.removeExtraLayer).toHaveBeenCalled();
    service.alternarLado(3);
    service.confirmarEdicion();

    expect([...state.zonasParciales().keys()]).toEqual([idOriginal]);
    expect(state.zonasParciales().get(idOriginal)?.lados).toEqual([1, 3]);
  });

  it('marcar todos los lados deja la manzana completa y sin zona parcial', () => {
    service.abrirManzana(m1);
    for (const i of [0, 1, 2, 3]) service.alternarLado(i);

    service.confirmarEdicion();

    expect(state.zonasParciales().size).toBe(0);
    expect(state.manzanasById().has('m1')).toBe(true);
    expect(selection.toggleManzana).toHaveBeenCalled();
  });

  it('"Toda" completa la manzana y reemplaza la zona que tenía', () => {
    service.abrirManzana(m1);
    service.alternarLado(0);
    service.confirmarEdicion();

    service.abrirManzana(m1);
    service.marcarManzanaCompleta();

    expect(state.zonasParciales().size).toBe(0);
    expect([...state.manzanasById().keys()]).toEqual(['m1']);
  });

  it('dejar sin lados una zona guardada la elimina', () => {
    service.abrirManzana(m1);
    service.alternarLado(0);
    service.confirmarEdicion();

    service.abrirManzana(m1);
    service.alternarLado(0);
    service.confirmarEdicion();

    expect(state.zonasParciales().size).toBe(0);
    expect(state.manzanasById().size).toBe(0);
  });

  it('Cancelar descarta los cambios y vuelve a mostrar la zona anterior', () => {
    service.abrirManzana(m1);
    service.alternarLado(0);
    service.confirmarEdicion();
    const [zona] = [...state.zonasParciales().values()];

    service.abrirManzana(m1);
    service.alternarLado(2);
    service.cancelarEdicion();

    expect(state.zonasParciales().get(zona.id)?.lados).toEqual([0]);
    expect(state.edicionLados()).toBeNull();
    expect(rendering.addExtraLayer).toHaveBeenLastCalledWith(registry.get(zona.id));
  });

  it('abrir otra manzana guarda la que estaba abierta', () => {
    const m2 = manzana('m2');
    rendering.getManzanaIndex.mockReturnValue([m1, m2]);
    service.abrirManzana(m1);
    service.alternarLado(0);

    service.abrirManzana(m2);

    expect([...state.zonasParciales().values()].map(z => z.manzanaId)).toEqual(['m1']);
    expect(state.edicionLados()?.manzanaId).toBe('m2');
  });

  it('marcar completa una manzana desde el modo Marcar quita su zona parcial', () => {
    service.abrirManzana(m1);
    service.alternarLado(0);
    service.confirmarEdicion();

    service.quitarZonaDeManzana('m1');

    expect(state.zonasParciales().size).toBe(0);
    expect(state.manzanasById().size).toBe(0);
  });
});
