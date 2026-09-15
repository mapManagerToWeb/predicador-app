import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Path } from 'leaflet';
import type { PathOptions } from 'leaflet';
import type * as L from 'leaflet';
import {
  getBaseTerritoryStyle,
  getMarkedManzanaStyle,
  getHiddenStyle,
  getSelectedManzanaStyle,
  getPartialPolygonStyle,
  getPartialPolygonCompleteStyle,
  getCaptureUnmarkedStyle,
  getCaptureIncompleteStyle,
  MapStyleService,
} from './map-style.service';
import { MapLayerRegistry } from './map-layer-registry.service';
import { STYLE_DEFAULTS } from '../utils/map-constants';
import type { FeatureLayer } from '../types/map.types';

// Mock de Leaflet Path para poder ejercitar applyStyleToFeatureLayer (filtra
// `l instanceof Path`). El factory crea la clase internamente porque vi.mock
// se hoistea por encima de las declaraciones del archivo.
vi.mock('leaflet', () => {
  class FakePath {
    options: PathOptions = {};
    readonly setStyle = vi.fn();
  }
  return { Path: FakePath };
});

describe('MapStyleService — pure style functions', () => {
  describe('getBaseTerritoryStyle', () => {
    it('should return low fillOpacity for incomplete territory', () => {
      const style = getBaseTerritoryStyle('#ff0000', false);
      expect(style.fillOpacity).toBe(0.05);
      expect(style.fillColor).toBe('#ff0000');
      expect(style.color).toBe('#ff0000');
      expect(style.opacity).toBe(1);
      expect(style.stroke).toBe(true);
      expect(style.weight).toBe(STYLE_DEFAULTS.polygon.weight);
    });

    it('should return high fillOpacity for complete territory', () => {
      const style = getBaseTerritoryStyle('#00ff00', true);
      expect(style.fillOpacity).toBe(0.6);
      expect(style.fillColor).toBe('#00ff00');
      expect(style.color).toBe('#00ff00');
    });
  });

  describe('getMarkedManzanaStyle', () => {
    it('should use markedPolygon fillOpacity', () => {
      const style = getMarkedManzanaStyle('#123456');
      expect(style.fillColor).toBe('#123456');
      expect(style.color).toBe('#123456');
      expect(style.fillOpacity).toBe(STYLE_DEFAULTS.markedPolygon.fillOpacity);
      expect(style.opacity).toBe(1);
      expect(style.stroke).toBe(true);
      expect(style.weight).toBe(STYLE_DEFAULTS.polygon.weight);
    });
  });

  describe('getHiddenStyle', () => {
    it('should return hidden polygon style', () => {
      const style = getHiddenStyle();
      expect(style.opacity).toBe(0);
      expect(style.fillOpacity).toBe(0);
      expect(style.stroke).toBe(false);
      expect(style.weight).toBe(0);
    });
  });

  describe('getSelectedManzanaStyle', () => {
    it('should use selectedManzana config', () => {
      const style = getSelectedManzanaStyle();
      expect(style.fillColor).toBe(STYLE_DEFAULTS.selectedManzana.fillColor);
      expect(style.weight).toBe(STYLE_DEFAULTS.selectedManzana.weight);
      expect(style.color).toBe(STYLE_DEFAULTS.selectedManzana.color);
      expect(style.fillOpacity).toBe(STYLE_DEFAULTS.selectedManzana.fillOpacity);
    });
  });

  describe('getPartialPolygonStyle', () => {
    it('should be dashed while drafting', () => {
      const style = getPartialPolygonStyle('#123456', true);
      expect(style.fillColor).toBe('#123456');
      expect(style.color).toBe('#123456');
      expect(style.fillOpacity).toBe(STYLE_DEFAULTS.partialPolygon.fillOpacity);
      expect(style.dashArray).toBe(STYLE_DEFAULTS.partialPolygon.dashArray);
    });

    it('should be solid when enough points exist', () => {
      const style = getPartialPolygonStyle('#123456', false);
      expect(style.dashArray).toBeUndefined();
      expect(style.weight).toBe(STYLE_DEFAULTS.partialPolygon.weight);
    });
  });

  describe('getPartialPolygonCompleteStyle', () => {
    it('should clear dashArray and use complete fill', () => {
      const style = getPartialPolygonCompleteStyle('#123456');
      expect(style.fillColor).toBe('#123456');
      expect(style.fillOpacity).toBe(STYLE_DEFAULTS.partialPolygonComplete.fillOpacity);
      expect(style.weight).toBe(STYLE_DEFAULTS.partialPolygonComplete.weight);
      expect(style.dashArray).toBeUndefined();
    });
  });

  describe('getCaptureUnmarkedStyle', () => {
    it('should dim unmarked polygons during capture', () => {
      const style = getCaptureUnmarkedStyle('#123456');
      expect(style.color).toBe('#123456');
      expect(style.opacity).toBe(0.6);
      expect(style.fillOpacity).toBe(0.05);
      expect(style.weight).toBe(1.5);
    });
  });

  describe('getCaptureIncompleteStyle', () => {
    it('should use a larger stroke width for incomplete territories', () => {
      const style = getCaptureIncompleteStyle('#123456');
      expect(style.color).toBe('#123456');
      expect(style.opacity).toBe(0.8);
      expect(style.fillOpacity).toBe(0.05);
      expect(style.weight).toBe(4);
    });
  });
});

describe('MapStyleService', () => {
  let service: MapStyleService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MapStyleService, MapLayerRegistry],
    });
    service = TestBed.inject(MapStyleService);
  });

  /** FeatureLayer cuyo GeoJSON itera sobre los `Path` dados (mocks de Leaflet). */
  function makeFeatureLayer(paths: Array<{ options: PathOptions; setStyle: ReturnType<typeof vi.fn> }>): FeatureLayer {
    return {
      territorioPadre: 1,
      color: '#ff0000',
      layer: {
        eachLayer: vi.fn((cb: (l: unknown) => void) => {
          for (const p of paths) cb(p);
        }),
      } as unknown as L.GeoJSON,
    };
  }

  // `Path` real es abstracto; el mock de leaflet lo reemplaza por una clase
  // instanciable. El cast solo ajusta el tipo para poder construir fakes.
  const FakePathCtor = Path as unknown as new () => { options: PathOptions; setStyle: ReturnType<typeof vi.fn> };

  it('skips setStyle when the incoming style equals the layer current options', () => {
    const base = getBaseTerritoryStyle('#ff0000', false);
    const path = new FakePathCtor();
    path.options = { ...base };
    const fl = makeFeatureLayer([path]);

    service.applyStyleToFeatureLayer(fl, base);

    expect(path.setStyle).not.toHaveBeenCalled();
  });

  it('calls setStyle once per path when the style differs', () => {
    const base = getBaseTerritoryStyle('#ff0000', false);
    const hidden = getHiddenStyle();
    const paths = [new FakePathCtor(), new FakePathCtor()];
    for (const p of paths) p.options = { ...base };
    const fl = makeFeatureLayer(paths);

    service.applyStyleToFeatureLayer(fl, hidden);

    for (const p of paths) expect(p.setStyle).toHaveBeenCalledTimes(1);
  });

  it('resolves a style function once per feature layer', () => {
    const resolver = vi.fn(() => getBaseTerritoryStyle('#00ff00', true));
    const paths = [new FakePathCtor(), new FakePathCtor()];
    for (const p of paths) p.options = { ...getBaseTerritoryStyle('#ff0000', false) };
    const fl = makeFeatureLayer(paths);

    service.applyStyleToFeatureLayer(fl, resolver);

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith(fl);
    for (const p of paths) expect(p.setStyle).toHaveBeenCalledTimes(1);
  });

  it('compares partial styles with dashArray undefined correctly', () => {
    const estilo = getPartialPolygonStyle('#123456', false); // incluye dashArray: undefined
    const igual = new FakePathCtor();
    igual.options = { ...estilo };
    const distinto = new FakePathCtor();
    distinto.options = { ...estilo, dashArray: '8, 8' };
    const fl = makeFeatureLayer([igual, distinto]);

    service.applyStyleToFeatureLayer(fl, estilo);

    expect(igual.setStyle).not.toHaveBeenCalled();
    expect(distinto.setStyle).toHaveBeenCalledTimes(1);
  });
});
