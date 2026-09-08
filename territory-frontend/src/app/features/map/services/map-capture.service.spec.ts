import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as L from 'leaflet';
import { MapCaptureService } from './map-capture.service';
import { MapEngineService } from './map-engine.service';
import { MapTerritoryLayerService } from './map-territory-layer.service';
import { MapLayerRegistry } from './map-layer-registry.service';
import {
  getBaseTerritoryStyle,
  getCaptureUnmarkedStyle,
  getCaptureIncompleteStyle,
  getHiddenStyle,
  getMarkedManzanaStyle,
  getPartialPolygonCompleteStyle,
} from './map-style.service';

function makePath(): L.Path {
  const p = new L.Polygon([
    [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 0, lng: 1 },
    ],
  ]);
  vi.spyOn(p, 'setStyle');
  return p as unknown as L.Path;
}

function fakeFeatureLayer(territorioNumero: number, color: string, paths: L.Path[]) {
  return {
    territorioPadre: territorioNumero,
    color,
    layer: {
      eachLayer: (cb: (l: L.Layer) => void) => paths.forEach(cb),
      getBounds: () => ({ isValid: () => true, extend: vi.fn() }),
    },
  };
}

function fakeLabel(text: string) {
  return {
    getElement: () => ({ querySelector: () => ({ textContent: text }) }),
    setOpacity: vi.fn(),
  };
}

describe('MapCaptureService', () => {
  let service: MapCaptureService;
  let registry: MapLayerRegistry;
  let engine: { getMap: ReturnType<typeof vi.fn> };
  let territories: {
    getAllTerritoriesLayer: ReturnType<typeof vi.fn>;
    getTerritoryLabels: ReturnType<typeof vi.fn>;
  };
  let fakeMap: { fitBounds: ReturnType<typeof vi.fn>; getZoom: ReturnType<typeof vi.fn>; getContainer: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    fakeMap = { fitBounds: vi.fn(), getZoom: vi.fn().mockReturnValue(15), getContainer: vi.fn().mockReturnValue(document.createElement('div')) };
    engine = { getMap: vi.fn() };
    territories = { getAllTerritoriesLayer: vi.fn(), getTerritoryLabels: vi.fn(), getFeatureLayerByTerritorio: vi.fn().mockReturnValue(undefined), getManzanaCountByTerritorio: vi.fn().mockReturnValue(0) };
    TestBed.configureTestingModule({
      providers: [
        MapCaptureService,
        MapLayerRegistry,
        { provide: MapEngineService, useValue: engine },
        { provide: MapTerritoryLayerService, useValue: territories },
      ],
    });
    service = TestBed.inject(MapCaptureService);
    registry = TestBed.inject(MapLayerRegistry);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('prepararCaptura', () => {
    it('resolves immediately and touches nothing when there is no map', async () => {
      engine.getMap.mockReturnValue(null);

      await service.prepararCaptura([], []);

      expect(territories.getAllTerritoriesLayer).not.toHaveBeenCalled();
    });

    it('regression: fits bounds WITHOUT animation so the map settles before capture', async () => {
      engine.getMap.mockReturnValue(fakeMap);
      territories.getAllTerritoriesLayer.mockReturnValue([fakeFeatureLayer(1, '#ff0000', [])]);
      territories.getTerritoryLabels.mockReturnValue([]);
      territories.getFeatureLayerByTerritorio.mockReturnValue(
        fakeFeatureLayer(1, '#ff0000', [])
      );

      await service.prepararCaptura([], [1]);

      expect(fakeMap.fitBounds).toHaveBeenCalledWith(expect.anything(), {
        padding: [50, 50],
        animate: false,
      });
    });

    it('hides unselected territories, styles the selection, updates labels and fits bounds', async () => {
      engine.getMap.mockReturnValue(fakeMap);
      const markedPath = makePath();
      const unmarkedPath = makePath();
      const hiddenPath = makePath();
      const partialPath = makePath();
      registry.register('m1', markedPath);
      registry.register('parcial-9', partialPath);

      territories.getAllTerritoriesLayer.mockReturnValue([
        fakeFeatureLayer(1, '#ff0000', [markedPath, unmarkedPath]),
        fakeFeatureLayer(2, '#00ff00', [hiddenPath]),
      ]);
      territories.getTerritoryLabels.mockReturnValue([fakeLabel('1'), fakeLabel('2')]);
      territories.getFeatureLayerByTerritorio.mockImplementation((num: number) => {
        if (num === 1) return { territorioPadre: 1, color: '#ff0000', layer: { getBounds: () => ({ isValid: () => true }) } };
        if (num === 2) return { territorioPadre: 2, color: '#00ff00', layer: { getBounds: () => ({ isValid: () => true }) } };
        return undefined;
      });

      const marcadas = [
        { id: 'm1', nombreBloque: 'A', color: '#ff0000', territorioNumero: 1 },
        { id: 'parcial-9', nombreBloque: 'Zona parcial', color: '#ff0000', territorioNumero: 1 },
      ];

      const promise = service.prepararCaptura(marcadas, [1]);
      await promise;

      expect(hiddenPath.setStyle).toHaveBeenCalledWith(getHiddenStyle());
      expect(markedPath.setStyle).toHaveBeenCalledWith(getMarkedManzanaStyle('#ff0000'));
      expect(unmarkedPath.setStyle).toHaveBeenCalledWith(getCaptureUnmarkedStyle('#ff0000'));
      expect(partialPath.setStyle).toHaveBeenCalledWith(getPartialPolygonCompleteStyle('#ff0000'));
      expect(fakeMap.fitBounds).toHaveBeenCalledWith(expect.anything(), { padding: [50, 50], animate: false });
    });

    it('updates label opacity to reflect the selection', async () => {
      engine.getMap.mockReturnValue(fakeMap);
      const label1 = fakeLabel('1');
      const label2 = fakeLabel('2');
      territories.getAllTerritoriesLayer.mockReturnValue([fakeFeatureLayer(1, '#ff0000', [])]);
      territories.getTerritoryLabels.mockReturnValue([label1, label2]);

      const promise = service.prepararCaptura([], [1]);
      await promise;

      expect(label1.setOpacity).toHaveBeenCalledWith(1);
      expect(label2.setOpacity).toHaveBeenCalledWith(0);
    });
  });

  describe('prepararCapturaSoloIncompletos', () => {
    it('styles incomplete territories with marked layers highlighted and thick unmarked strokes', async () => {
      engine.getMap.mockReturnValue(fakeMap);
      const markedPath = makePath();
      const unmarkedPath = makePath();
      const hiddenPath = makePath();
      const partialPath = makePath();
      registry.register('m1', markedPath);
      registry.register('parcial-9', partialPath);

      territories.getAllTerritoriesLayer.mockReturnValue([
        fakeFeatureLayer(1, '#ff0000', [markedPath, unmarkedPath]),
        fakeFeatureLayer(2, '#00ff00', [hiddenPath]),
      ]);
      territories.getTerritoryLabels.mockReturnValue([fakeLabel('1'), fakeLabel('2')]);
      territories.getFeatureLayerByTerritorio.mockImplementation((num: number) => {
        if (num === 1) return fakeFeatureLayer(1, '#ff0000', [markedPath, unmarkedPath]);
        if (num === 2) return fakeFeatureLayer(2, '#00ff00', [hiddenPath]);
        return undefined;
      });
      const getCount = vi.fn().mockImplementation((num: number) => (num === 1 ? 3 : 0));

      const marcadas = [
        { id: 'm1', nombreBloque: 'A', color: '#ff0000', territorioNumero: 1 },
        { id: 'parcial-9', nombreBloque: 'Zona parcial', color: '#ff0000', territorioNumero: 1 },
      ];

      const promise = service.prepararCapturaSoloIncompletos(marcadas, [1, 2], territories.getAllTerritoriesLayer(), getCount);
      await promise;

      expect(markedPath.setStyle).toHaveBeenCalledWith(getMarkedManzanaStyle('#ff0000'));
      expect(unmarkedPath.setStyle).toHaveBeenCalledWith(getCaptureIncompleteStyle('#ff0000'));
      expect(hiddenPath.setStyle).toHaveBeenCalledWith(getHiddenStyle());
      expect(partialPath.setStyle).toHaveBeenCalledWith(getPartialPolygonCompleteStyle('#ff0000'));
      expect(fakeMap.fitBounds).toHaveBeenCalledWith(expect.anything(), { padding: [50, 50], animate: false });
    });

    it('resolves immediately when no incomplete territory is selected', async () => {
      engine.getMap.mockReturnValue(fakeMap);
      territories.getAllTerritoriesLayer.mockReturnValue([]);
      territories.getTerritoryLabels.mockReturnValue([]);
      const getCount = vi.fn().mockReturnValue(2);

      const promise = service.prepararCapturaSoloIncompletos(
        [{ id: 'm1', nombreBloque: 'A', color: '#ff0000', territorioNumero: 1 }],
        [1],
        territories.getAllTerritoriesLayer(),
        getCount
      );

      await promise;
      expect(getCount).toHaveBeenCalled();
    });
  });

  describe('waitForTiles', () => {
    function fakeTileMap() {
      const container = document.createElement('div');
      return {
        getContainer: () => container,
        fitBounds: vi.fn(),
        getZoom: vi.fn().mockReturnValue(15),
      };
    }

    it('resolves immediately when there are no tiles', async () => {
      const map = fakeTileMap();
      await expect((service as any).waitForTiles(map)).resolves.toBeUndefined();
    });

    it('resolves immediately when all tiles are complete', async () => {
      const map = fakeTileMap();
      const tilePane = document.createElement('div');
      tilePane.classList.add('leaflet-tile-pane');
      const img1 = document.createElement('img');
      const img2 = document.createElement('img');
      Object.defineProperty(img1, 'complete', { value: true });
      Object.defineProperty(img2, 'complete', { value: true });
      tilePane.appendChild(img1);
      tilePane.appendChild(img2);
      map.getContainer().appendChild(tilePane);

      await expect((service as any).waitForTiles(map)).resolves.toBeUndefined();
    });

    it('resolves after tiles load within timeout', async () => {
      vi.useFakeTimers();
      const map = fakeTileMap();
      const tilePane = document.createElement('div');
      tilePane.classList.add('leaflet-tile-pane');
      const img1 = document.createElement('img');
      const img2 = document.createElement('img');
      Object.defineProperty(img1, 'complete', { value: true });
      Object.defineProperty(img2, 'complete', { value: false, writable: true });
      tilePane.appendChild(img1);
      tilePane.appendChild(img2);
      map.getContainer().appendChild(tilePane);

      const promise = (service as any).waitForTiles(map);

      // Simulate tile loading after 200ms
      vi.advanceTimersByTime(200);
      (img2 as any).complete = true;
      img2.dispatchEvent(new Event('load'));

      await expect(promise).resolves.toBeUndefined();
      vi.useRealTimers();
    });

    it('resolves after timeout even if tiles never load', async () => {
      vi.useFakeTimers();
      const map = fakeTileMap();
      const tilePane = document.createElement('div');
      tilePane.classList.add('leaflet-tile-pane');
      const img = document.createElement('img');
      Object.defineProperty(img, 'complete', { value: false, writable: true });
      tilePane.appendChild(img);
      map.getContainer().appendChild(tilePane);

      const promise = (service as any).waitForTiles(map);

      vi.advanceTimersByTime(8000);

      await expect(promise).resolves.toBeUndefined();
      vi.useRealTimers();
    });
  });

  describe('restaurarMapaPostCaptura', () => {
    it('does nothing when there is no map', () => {
      engine.getMap.mockReturnValue(null);

      expect(() => service.restaurarMapaPostCaptura([], [], 'none')).not.toThrow();
    });

    it('restores visible base styles for unselected territories when mode is none', () => {
      engine.getMap.mockReturnValue(fakeMap);
      const selectedPath = makePath();
      const unselectedPath = makePath();
      territories.getAllTerritoriesLayer.mockReturnValue([
        fakeFeatureLayer(1, '#ff0000', [selectedPath]),
        fakeFeatureLayer(2, '#00ff00', [unselectedPath]),
      ]);
      territories.getTerritoryLabels.mockReturnValue([]);
      territories.getFeatureLayerByTerritorio.mockImplementation((num: number) => {
        if (num === 1) return { territorioPadre: 1, color: '#ff0000', layer: { getBounds: () => ({ isValid: () => true }) } };
        if (num === 2) return { territorioPadre: 2, color: '#00ff00', layer: { getBounds: () => ({ isValid: () => true }) } };
        return undefined;
      });

      service.restaurarMapaPostCaptura([], [1], 'none');

      expect(unselectedPath.setStyle).toHaveBeenCalledWith(getBaseTerritoryStyle('#00ff00', false));
      expect(selectedPath.setStyle).toHaveBeenCalledWith(getBaseTerritoryStyle('#ff0000', false));
      expect(fakeMap.fitBounds).toHaveBeenCalledWith(expect.anything(), { padding: [30, 30] });
    });

    it('hides unselected territories when mode is not none', () => {
      engine.getMap.mockReturnValue(fakeMap);
      const unselectedPath = makePath();
      territories.getAllTerritoriesLayer.mockReturnValue([
        fakeFeatureLayer(1, '#ff0000', [makePath()]),
        fakeFeatureLayer(2, '#00ff00', [unselectedPath]),
      ]);
      territories.getTerritoryLabels.mockReturnValue([]);

      service.restaurarMapaPostCaptura([], [1], 'completa');

      expect(unselectedPath.setStyle).toHaveBeenCalledWith(getHiddenStyle());
    });
  });
});
