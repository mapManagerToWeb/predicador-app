import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MapEngineService } from './map-engine.service';
import { map } from 'leaflet';

const { fakeMap } = vi.hoisted(() => {
  const m = { setView: vi.fn(), remove: vi.fn() };
  m.setView.mockReturnValue(m);
  return { fakeMap: m };
});

vi.mock('leaflet', () => ({
  map: vi.fn(() => fakeMap),
}));

describe('MapEngineService', () => {
  let service: MapEngineService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MapEngineService();
  });

  it('starts without a map', () => {
    expect(service.getMap()).toBeNull();
  });

  it('initializes a Leaflet map on the given element', () => {
    const element = document.createElement('div');
    service.initializeMap(element);

    expect(map).toHaveBeenCalledWith(element, { preferCanvas: true, zoomControl: false });
    expect(fakeMap.setView).toHaveBeenCalled();
    expect(service.getMap()).toBe(fakeMap);
  });

  it('destroy removes the map and clears the reference', () => {
    service.initializeMap(document.createElement('div'));
    service.destroy();

    expect(fakeMap.remove).toHaveBeenCalled();
    expect(service.getMap()).toBeNull();
  });

  it('destroy is safe when no map exists', () => {
    expect(() => service.destroy()).not.toThrow();
  });
});
